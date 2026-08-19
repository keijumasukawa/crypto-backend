import json
from datetime import UTC, datetime
from typing import Final

import lightgbm as lgb
import polars as pl

from ml.artifacts import ModelMetadata, get_metadata, get_model
from ml.db import (
    ML_LOGIC_VERSION,
    SIGNAL_COLUMNS,
    get_latest_signal_open_time,
    list_indicator_values,
    list_klines,
    update_signals,
    validate_interval,
)
from ml.labels import INTERVAL_MILLISECONDS
from ml.thresholds import convert_probabilities_to_directions, format_score
from ml.train import (
    MODELS_DIRECTORY,
    build_dataset,
    calculate_calibrated_probabilities,
    get_environment_variable,
    list_feature_columns,
)
from ml.training import build_prediction_frame

LOOKBACK_BAR_COUNT: Final = 25
PROBABILITY_DIGITS: Final = 10


def format_generated_at(now: datetime) -> str:
    return now.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def build_empty_signal_frame() -> pl.DataFrame:
    return pl.DataFrame(
        schema={
            "symbol": pl.String,
            "interval": pl.String,
            "open_time": pl.Int64,
            "logic_version": pl.String,
            "direction": pl.String,
            "score": pl.String,
            "components": pl.String,
            "generated_at": pl.String,
        }
    )


def calculate_signal_frame(
    dataset: pl.DataFrame,
    model: lgb.Booster,
    metadata: ModelMetadata,
    generated_at: str,
    start_open_time: int,
) -> pl.DataFrame:
    feature_columns = list_feature_columns(metadata.interval)
    frame = build_prediction_frame(dataset, feature_columns, metadata.symbols).filter(
        pl.col("open_time") > start_open_time
    )
    if frame.is_empty():
        return build_empty_signal_frame()
    probabilities = calculate_calibrated_probabilities(
        model, metadata.calibration, frame, feature_columns
    )
    directions = convert_probabilities_to_directions(probabilities, metadata.threshold)
    scores = [format_score(2 * value - 1) for value in probabilities.to_list()]
    components = [
        json.dumps(
            {"m": metadata.identifier, "p": round(value, PROBABILITY_DIGITS)},
            separators=(",", ":"),
            sort_keys=True,
        )
        for value in probabilities.to_list()
    ]
    return (
        frame.select("symbol", "open_time")
        .with_columns(
            pl.lit(metadata.interval).alias("interval"),
            pl.lit(ML_LOGIC_VERSION).alias("logic_version"),
            directions.alias("direction"),
            pl.Series("score", scores, dtype=pl.String),
            pl.Series("components", components, dtype=pl.String),
            pl.lit(generated_at).alias("generated_at"),
        )
        .select(SIGNAL_COLUMNS)
    )


def main() -> None:
    connection_string = get_environment_variable("DIRECT_URL")
    interval = validate_interval(get_environment_variable("INTERVAL"))
    generated_at = format_generated_at(datetime.now(UTC))

    directory = MODELS_DIRECTORY / ML_LOGIC_VERSION / interval
    metadata = get_metadata(directory)
    if metadata.interval != interval:
        message = "モデルのインターバルが指定と一致しません。成果物を確認してください。"
        raise ValueError(message)
    model = get_model(directory)

    latest_open_time = get_latest_signal_open_time(connection_string, interval)
    start_open_time = metadata.train_end_open_time
    if latest_open_time is not None:
        start_open_time = max(start_open_time, latest_open_time)
    read_start = max(
        0, start_open_time - LOOKBACK_BAR_COUNT * INTERVAL_MILLISECONDS[interval]
    )

    klines = list_klines(connection_string, interval, metadata.symbols, read_start)
    indicator_values = list_indicator_values(
        connection_string, interval, metadata.symbols, read_start
    )
    dataset = build_dataset(klines, indicator_values, interval)
    signal_frame = calculate_signal_frame(
        dataset, model, metadata, generated_at, start_open_time
    )
    written_count = update_signals(connection_string, signal_frame)
    print(f"signals を {written_count} 件書き込みました。")
