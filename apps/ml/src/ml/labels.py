from typing import Final

import polars as pl

from ml.db import validate_interval

INTERVAL_MILLISECONDS: Final = {
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
}
ROUND_TRIP_COST: Final = 0.002


def validate_cost(cost: float) -> float:
    if cost < 0:
        message = "コストは 0 以上で指定してください。"
        raise ValueError(message)
    return cost


def calculate_future_returns(frame: pl.DataFrame, interval: str) -> pl.DataFrame:
    step = INTERVAL_MILLISECONDS[validate_interval(interval)]
    entry_open = pl.col("open").shift(-1).over("symbol")
    exit_open = pl.col("open").shift(-2).over("symbol")
    entry_time = pl.col("open_time").shift(-1).over("symbol")
    exit_time = pl.col("open_time").shift(-2).over("symbol")
    is_consecutive = (entry_time == pl.col("open_time") + step) & (
        exit_time == pl.col("open_time") + 2 * step
    )
    future_return = (
        pl.when(is_consecutive).then(exit_open / entry_open - 1).otherwise(None)
    )
    return frame.sort("symbol", "open_time").with_columns(
        future_return.alias("future_return")
    )


def generate_labels(
    frame: pl.DataFrame,
    interval: str,
    cost: float = ROUND_TRIP_COST,
) -> pl.DataFrame:
    validate_cost(cost)
    with_returns = calculate_future_returns(frame, interval)
    future_return = pl.col("future_return")
    label = (
        pl.when(future_return > cost)
        .then(1)
        .when(future_return < -cost)
        .then(-1)
        .when(future_return.is_not_null())
        .then(0)
        .otherwise(None)
        .cast(pl.Int8)
    )
    return with_returns.with_columns(label.alias("label"))
