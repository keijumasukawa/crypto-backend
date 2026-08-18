import math
import random
from collections.abc import Callable, Sequence
from typing import Final

import polars as pl

from ml.metrics import calculate_auc
from ml.training import (
    BINARY_TARGET_COLUMN,
    calculate_lightgbm_probabilities,
    train_lightgbm,
)

Transform = Callable[[pl.DataFrame], pl.DataFrame]

PERTURBATION_SCALE: Final = 3
PERTURBATION_OFFSET: Final = 1
VALUE_TOLERANCE: Final = 1e-12
RANDOM_AUC: Final = 0.5
RANDOM_AUC_TOLERANCE: Final = 0.1
SHUFFLE_REPEAT_COUNT: Final = 5


def perturb_rows(
    frame: pl.DataFrame,
    open_time: int,
    columns: Sequence[str],
) -> pl.DataFrame:
    return frame.with_columns(
        pl.when(pl.col("open_time") == open_time)
        .then(pl.col(column) * PERTURBATION_SCALE + PERTURBATION_OFFSET)
        .otherwise(pl.col(column))
        .alias(column)
        for column in columns
    )


def get_target_value(
    frame: pl.DataFrame,
    value_column: str,
    target_symbol: str,
    target_open_time: int,
) -> object:
    target_rows = frame.filter(
        (pl.col("symbol") == target_symbol) & (pl.col("open_time") == target_open_time)
    )
    if target_rows.height != 1:
        message = f"対象の行が特定できません。銘柄と時刻を確認してください({target_symbol}, {target_open_time})。"
        raise ValueError(message)
    return target_rows.get_column(value_column).to_list()[0]


def values_differ(first: object, second: object) -> bool:
    if first is None and second is None:
        return False
    if first is None or second is None:
        return True
    if isinstance(first, float) and isinstance(second, float):
        return not math.isclose(first, second, abs_tol=VALUE_TOLERANCE)
    return first != second


def find_max_referenced_open_time(
    transform: Transform,
    frame: pl.DataFrame,
    value_column: str,
    target_symbol: str,
    target_open_time: int,
    perturb_columns: Sequence[str],
) -> int | None:
    baseline = get_target_value(
        transform(frame), value_column, target_symbol, target_open_time
    )
    max_referenced: int | None = None
    for open_time in frame.get_column("open_time").unique().sort().to_list():
        perturbed = perturb_rows(frame, open_time, perturb_columns)
        value = get_target_value(
            transform(perturbed), value_column, target_symbol, target_open_time
        )
        if values_differ(baseline, value):
            max_referenced = open_time
    return max_referenced


def validate_feature_reference(
    transform: Transform,
    frame: pl.DataFrame,
    value_column: str,
    target_symbol: str,
    target_open_time: int,
    perturb_columns: Sequence[str],
    max_allowed_open_time: int,
) -> None:
    max_referenced = find_max_referenced_open_time(
        transform,
        frame,
        value_column,
        target_symbol,
        target_open_time,
        perturb_columns,
    )
    if max_referenced is not None and max_referenced > max_allowed_open_time:
        message = (
            f"{value_column} が許容範囲より未来の足"
            f"(open_time {max_referenced})を参照しています。"
        )
        raise ValueError(message)


def shuffle_series(series: pl.Series, seed: int) -> pl.Series:
    values = series.to_list()
    random.Random(seed).shuffle(values)
    return pl.Series(series.name, values, dtype=series.dtype)


def validate_random_auc(
    auc: float,
    tolerance: float = RANDOM_AUC_TOLERANCE,
) -> None:
    if abs(auc - RANDOM_AUC) > tolerance:
        message = (
            f"シャッフルしたラベルの AUC({auc:.3f})が 0.5 から乖離しています。"
            "評価経路のリークを確認してください。"
        )
        raise ValueError(message)


def validate_shuffled_label_training(
    train_frame: pl.DataFrame,
    validation_frame: pl.DataFrame,
    feature_columns: Sequence[str],
    seed: int,
    tolerance: float = RANDOM_AUC_TOLERANCE,
    repeat_count: int = SHUFFLE_REPEAT_COUNT,
) -> float:
    if repeat_count < 1:
        message = "シャッフル検査の反復回数は 1 以上で指定してください。"
        raise ValueError(message)
    auc_values = [
        calculate_shuffled_label_auc(
            train_frame, validation_frame, feature_columns, seed + repeat * 2
        )
        for repeat in range(repeat_count)
    ]
    mean_auc = sum(auc_values) / len(auc_values)
    validate_random_auc(mean_auc, tolerance)
    return mean_auc


def calculate_shuffled_label_auc(
    train_frame: pl.DataFrame,
    validation_frame: pl.DataFrame,
    feature_columns: Sequence[str],
    seed: int,
) -> float:
    shuffled_train = train_frame.with_columns(
        shuffle_series(train_frame.get_column(BINARY_TARGET_COLUMN), seed)
    )
    shuffled_validation = validation_frame.with_columns(
        shuffle_series(validation_frame.get_column(BINARY_TARGET_COLUMN), seed + 1)
    )
    model = train_lightgbm(shuffled_train, shuffled_validation, feature_columns)
    probabilities = calculate_lightgbm_probabilities(
        model, validation_frame, feature_columns
    )
    return calculate_auc(
        probabilities, validation_frame.get_column(BINARY_TARGET_COLUMN)
    )
