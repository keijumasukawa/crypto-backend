import json
import os
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import lightgbm as lgb
import polars as pl

from ml.artifacts import ModelMetadata, create_model_artifacts
from ml.baselines import calculate_base_rate
from ml.calibration import Calibration, calibrate_probabilities, fit_calibration
from ml.db import (
    ML_LOGIC_VERSION,
    list_active_symbols,
    list_indicator_values,
    list_klines,
    validate_interval,
)
from ml.features import (
    CROSS_SYMBOL_FEATURE_COLUMNS,
    DAY_OF_WEEK_COLUMN,
    HOUR_OF_DAY_COLUMN,
    INDICATOR_FEATURE_COLUMNS,
    PRICE_FEATURE_COLUMNS,
    calculate_calendar_features,
    calculate_cross_symbol_features,
    calculate_indicator_features,
    calculate_price_features,
)
from ml.labels import ROUND_TRIP_COST, generate_labels
from ml.leakage import RANDOM_AUC_TOLERANCE, validate_shuffled_label_training
from ml.metrics import (
    calculate_auc,
    calculate_brier_skill_score,
    calculate_hit_rate,
    calculate_max_drawdown,
    calculate_trade_returns,
)
from ml.splits import generate_walk_forward_splits, split_holdout_times
from ml.thresholds import (
    BEARISH,
    BULLISH,
    convert_probabilities_to_directions,
    find_best_threshold,
)
from ml.training import (
    BINARY_TARGET_COLUMN,
    LIGHTGBM_PARAMETERS,
    build_prediction_frame,
    build_training_frame,
    calculate_lightgbm_probabilities,
    train_lightgbm,
)

FOLD_COUNT: Final = 5
CALIBRATION_FRACTION: Final = 0.15
THRESHOLD_CANDIDATES: Final = tuple(index / 20 for index in range(11))
CALIBRATION_METHODS_BY_INTERVAL: Final = {
    "1h": "isotonic",
    "4h": "isotonic",
    "1d": "sigmoid",
}
SHUFFLE_SEED: Final = 20260819
PROBABILITY_COLUMN: Final = "calibrated_probability"
MODELS_DIRECTORY: Final = Path("models")
EVALUATION_PATH_VARIABLE: Final = "EVALUATION_PATH"
DEFAULT_EVALUATION_PATH: Final = "evaluation.json"


@dataclass(frozen=True)
class TrainingOutcome:
    model: lgb.Booster
    metadata: ModelMetadata
    validation_metrics: dict[str, float | None]
    holdout_metrics: dict[str, float | None]
    shuffled_auc: float


def list_feature_columns(interval: str) -> tuple[str, ...]:
    columns = (
        *PRICE_FEATURE_COLUMNS,
        *INDICATOR_FEATURE_COLUMNS,
        *CROSS_SYMBOL_FEATURE_COLUMNS,
        DAY_OF_WEEK_COLUMN,
    )
    if validate_interval(interval) == "1d":
        return columns
    return (*columns, HOUR_OF_DAY_COLUMN)


def build_dataset(
    klines: pl.DataFrame,
    indicator_values: pl.DataFrame,
    interval: str,
    cost: float = ROUND_TRIP_COST,
) -> pl.DataFrame:
    indicators = indicator_values.drop("interval", strict=False)
    joined = klines.join(indicators, on=["symbol", "open_time"], how="left")
    frame = generate_labels(joined, interval, cost)
    frame = calculate_price_features(frame)
    frame = calculate_indicator_features(frame)
    frame = calculate_cross_symbol_features(frame)
    frame = calculate_calendar_features(frame, interval)
    return frame.with_columns(pl.col("btc_return").fill_null(0.0))


def split_calibration_times(
    times: Sequence[int],
    fraction: float = CALIBRATION_FRACTION,
) -> tuple[list[int], list[int]]:
    sorted_times = sorted(times)
    calibration_count = round(len(sorted_times) * fraction)
    if calibration_count == 0 or calibration_count >= len(sorted_times):
        message = "較正区間が確保できません。データ量と比率を確認してください。"
        raise ValueError(message)
    core_count = len(sorted_times) - calibration_count
    return sorted_times[:core_count], sorted_times[core_count:]


def filter_by_times(frame: pl.DataFrame, times: Sequence[int]) -> pl.DataFrame:
    return frame.filter(pl.col("open_time").is_in(list(times)))


def train_segment(
    dataset: pl.DataFrame,
    train_times: Sequence[int],
    feature_columns: Sequence[str],
    symbols: Sequence[str],
    calibration_method: str,
) -> tuple[lgb.Booster, Calibration, pl.DataFrame]:
    core_times, calibration_times = split_calibration_times(train_times)
    train_frame = build_training_frame(
        filter_by_times(dataset, core_times), feature_columns, symbols
    )
    calibration_frame = build_training_frame(
        filter_by_times(dataset, calibration_times), feature_columns, symbols
    )
    model = train_lightgbm(train_frame, calibration_frame, feature_columns)
    raw_probabilities = calculate_lightgbm_probabilities(
        model, calibration_frame, feature_columns
    )
    calibration = fit_calibration(
        raw_probabilities,
        calibration_frame.get_column(BINARY_TARGET_COLUMN),
        calibration_method,
    )
    return model, calibration, train_frame


def calculate_calibrated_probabilities(
    model: lgb.Booster,
    calibration: Calibration,
    frame: pl.DataFrame,
    feature_columns: Sequence[str],
) -> pl.Series:
    raw_probabilities = calculate_lightgbm_probabilities(model, frame, feature_columns)
    return calibrate_probabilities(raw_probabilities, calibration)


def evaluate_predictions(
    frame: pl.DataFrame,
    threshold: float,
    base_rate: float,
    cost: float,
) -> dict[str, float | None]:
    binary_frame = frame.filter(pl.col("label").is_in([1, -1]))
    binary_probabilities = binary_frame.get_column(PROBABILITY_COLUMN)
    binary_targets = (binary_frame.get_column("label") == 1).cast(pl.Int8)
    directions = convert_probabilities_to_directions(
        frame.get_column(PROBABILITY_COLUMN), threshold
    )
    trade_returns = calculate_trade_returns(
        directions, frame.get_column("future_return"), cost
    )
    trade_count = directions.filter(
        directions.is_in([BULLISH, BEARISH])
        & frame.get_column("future_return").is_not_null()
    ).len()
    return {
        "auc": calculate_auc(binary_probabilities, binary_targets),
        "brier_skill_score": calculate_brier_skill_score(
            binary_probabilities, binary_targets, base_rate
        ),
        "hit_rate": calculate_hit_rate(directions, frame.get_column("label")),
        "total_return": float(trade_returns.sum()),
        "trade_count": float(trade_count),
        "max_drawdown": calculate_max_drawdown(trade_returns),
    }


def calculate_hit_rate_floor(
    fold_frames: Sequence[pl.DataFrame],
    threshold: float,
) -> float:
    hit_rates = []
    for fold_frame in fold_frames:
        directions = convert_probabilities_to_directions(
            fold_frame.get_column(PROBABILITY_COLUMN), threshold
        )
        hit_rate = calculate_hit_rate(directions, fold_frame.get_column("label"))
        if hit_rate is not None:
            hit_rates.append(hit_rate)
    if not hit_rates:
        return 0.0
    return min(hit_rates)


def train_model(
    dataset: pl.DataFrame,
    interval: str,
    commit_sha: str,
    fold_count: int = FOLD_COUNT,
    cost: float = ROUND_TRIP_COST,
    shuffle_tolerance: float = RANDOM_AUC_TOLERANCE,
) -> TrainingOutcome:
    feature_columns = list_feature_columns(interval)
    calibration_method = CALIBRATION_METHODS_BY_INTERVAL[interval]
    symbols = sorted(dataset.get_column("symbol").unique().to_list())
    times = dataset.get_column("open_time").unique().to_list()
    development_times, holdout_times = split_holdout_times(times)
    splits = generate_walk_forward_splits(development_times, fold_count)

    fold_frames = []
    last_train_frame = None
    last_test_frame = None
    for train_times, test_times in splits:
        model, calibration, train_frame = train_segment(
            dataset, train_times, feature_columns, symbols, calibration_method
        )
        test_frame = build_prediction_frame(
            filter_by_times(dataset, test_times), feature_columns, symbols
        )
        calibrated = calculate_calibrated_probabilities(
            model, calibration, test_frame, feature_columns
        )
        fold_frames.append(
            test_frame.with_columns(calibrated.alias(PROBABILITY_COLUMN))
        )
        last_train_frame = train_frame
        last_test_frame = build_training_frame(
            filter_by_times(dataset, test_times), feature_columns, symbols
        )

    validation_frame = pl.concat(fold_frames)
    threshold = find_best_threshold(
        THRESHOLD_CANDIDATES,
        lambda candidate: float(
            calculate_trade_returns(
                convert_probabilities_to_directions(
                    validation_frame.get_column(PROBABILITY_COLUMN), candidate
                ),
                validation_frame.get_column("future_return"),
                cost,
            ).sum()
        ),
    )
    base_rate = calculate_base_rate(
        filter_by_times(dataset, development_times).get_column("label")
    )
    validation_metrics = evaluate_predictions(
        validation_frame, threshold, base_rate, cost
    )
    hit_rate_floor = calculate_hit_rate_floor(fold_frames, threshold)

    if last_train_frame is None or last_test_frame is None:
        message = "ウォークフォワードの分割が生成されませんでした。データ量を確認してください。"
        raise ValueError(message)
    shuffled_auc = validate_shuffled_label_training(
        last_train_frame,
        last_test_frame,
        feature_columns,
        SHUFFLE_SEED,
        shuffle_tolerance,
    )

    final_model, final_calibration, _ = train_segment(
        dataset, development_times, feature_columns, symbols, calibration_method
    )
    holdout_frame = build_prediction_frame(
        filter_by_times(dataset, holdout_times), feature_columns, symbols
    )
    holdout_calibrated = calculate_calibrated_probabilities(
        final_model, final_calibration, holdout_frame, feature_columns
    )
    holdout_metrics = evaluate_predictions(
        holdout_frame.with_columns(holdout_calibrated.alias(PROBABILITY_COLUMN)),
        threshold,
        base_rate,
        cost,
    )

    hyperparameters = {
        key: value
        for key, value in LIGHTGBM_PARAMETERS.items()
        if isinstance(value, int | float | str)
    }
    metadata = ModelMetadata(
        identifier=f"{ML_LOGIC_VERSION}-{interval}-{max(development_times)}",
        interval=interval,
        train_start_open_time=min(development_times),
        train_end_open_time=max(development_times),
        hyperparameters=hyperparameters,
        feature_columns=tuple(feature_columns),
        symbols=tuple(symbols),
        threshold=threshold,
        calibration=final_calibration,
        hit_rate_floor=hit_rate_floor,
        commit_sha=commit_sha,
    )
    return TrainingOutcome(
        model=final_model,
        metadata=metadata,
        validation_metrics=validation_metrics,
        holdout_metrics=holdout_metrics,
        shuffled_auc=shuffled_auc,
    )


def get_environment_variable(name: str) -> str:
    value = os.environ.get(name)
    if value is None or value == "":
        message = f"環境変数 {name} を設定してください。"
        raise ValueError(message)
    return value


def main() -> None:
    connection_string = get_environment_variable("DIRECT_URL")
    interval = validate_interval(get_environment_variable("INTERVAL"))
    commit_sha = get_environment_variable("GITHUB_SHA")

    symbols = list_active_symbols(connection_string)
    klines = list_klines(connection_string, interval, symbols)
    indicator_values = list_indicator_values(connection_string, interval, symbols)
    dataset = build_dataset(klines, indicator_values, interval)

    outcome = train_model(dataset, interval, commit_sha)
    create_model_artifacts(
        MODELS_DIRECTORY / ML_LOGIC_VERSION / interval,
        outcome.model,
        outcome.metadata,
    )

    evaluation = {
        "identifier": outcome.metadata.identifier,
        "threshold": outcome.metadata.threshold,
        "hit_rate_floor": outcome.metadata.hit_rate_floor,
        "shuffled_auc": outcome.shuffled_auc,
        "validation": outcome.validation_metrics,
        "holdout": outcome.holdout_metrics,
    }
    evaluation_path = Path(
        os.environ.get(EVALUATION_PATH_VARIABLE, DEFAULT_EVALUATION_PATH)
    )
    evaluation_path.write_text(
        json.dumps(evaluation, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print("学習が完了しました。")
