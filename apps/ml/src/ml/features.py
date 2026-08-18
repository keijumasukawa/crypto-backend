from typing import Final

import polars as pl

from ml.db import validate_interval

RETURN_LAG_COUNT: Final = 5
VOLATILITY_WINDOW: Final = 20

RETURN_LAG_COLUMNS: Final = tuple(
    f"return_lag_{lag}" for lag in range(1, RETURN_LAG_COUNT + 1)
)
VOLATILITY_COLUMN: Final = f"volatility_{VOLATILITY_WINDOW}"
PRICE_FEATURE_COLUMNS: Final = (*RETURN_LAG_COLUMNS, VOLATILITY_COLUMN)

DEVIATION_SMA_COLUMNS: Final = ("sma20", "sma50", "sma200")
INDICATOR_FEATURE_COLUMNS: Final = (
    "sma20_deviation",
    "sma50_deviation",
    "sma200_deviation",
    "bb_position",
    "rsi14",
    "macd_hist_ratio",
)

BASE_SYMBOL: Final = "BTCUSDT"
CROSS_SYMBOL_FEATURE_COLUMNS: Final = ("btc_return",)
DAY_OF_WEEK_COLUMN: Final = "day_of_week"
HOUR_OF_DAY_COLUMN: Final = "hour_of_day"


def calculate_price_features(frame: pl.DataFrame) -> pl.DataFrame:
    single_return = (pl.col("close") / pl.col("close").shift(1) - 1).over("symbol")
    return_lags = [
        single_return.shift(lag - 1).over("symbol").alias(f"return_lag_{lag}")
        for lag in range(1, RETURN_LAG_COUNT + 1)
    ]
    volatility = (
        single_return.rolling_std(VOLATILITY_WINDOW)
        .over("symbol")
        .alias(VOLATILITY_COLUMN)
    )
    return frame.sort("symbol", "open_time").with_columns(*return_lags, volatility)


def calculate_indicator_features(frame: pl.DataFrame) -> pl.DataFrame:
    deviations = [
        (pl.col("close") / pl.col(sma) - 1).alias(f"{sma}_deviation")
        for sma in DEVIATION_SMA_COLUMNS
    ]
    band_width = pl.col("bb_upper") - pl.col("bb_lower")
    bb_position = (
        pl.when(band_width != 0)
        .then((pl.col("close") - pl.col("bb_lower")) / band_width)
        .otherwise(None)
        .alias("bb_position")
    )
    macd_hist_ratio = (pl.col("macd_hist") / pl.col("close")).alias("macd_hist_ratio")
    return frame.with_columns(*deviations, bb_position, macd_hist_ratio)


def calculate_cross_symbol_features(frame: pl.DataFrame) -> pl.DataFrame:
    base_returns = (
        frame.filter(pl.col("symbol") == BASE_SYMBOL)
        .sort("open_time")
        .select(
            "open_time",
            (pl.col("close") / pl.col("close").shift(1) - 1).alias("btc_return"),
        )
    )
    joined = frame.sort("symbol", "open_time").join(
        base_returns, on="open_time", how="left"
    )
    return joined.with_columns(
        pl.when(pl.col("symbol") == BASE_SYMBOL)
        .then(None)
        .otherwise(pl.col("btc_return"))
        .alias("btc_return")
    )


def calculate_calendar_features(frame: pl.DataFrame, interval: str) -> pl.DataFrame:
    validate_interval(interval)
    open_datetime = pl.from_epoch("open_time", time_unit="ms")
    columns = [open_datetime.dt.weekday().alias(DAY_OF_WEEK_COLUMN)]
    if interval != "1d":
        columns.append(open_datetime.dt.hour().alias(HOUR_OF_DAY_COLUMN))
    return frame.with_columns(columns)
