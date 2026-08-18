from typing import Final

import polars as pl

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
