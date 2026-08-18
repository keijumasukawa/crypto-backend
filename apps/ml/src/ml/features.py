from typing import Final

import polars as pl

RETURN_LAG_COUNT: Final = 5
VOLATILITY_WINDOW: Final = 20

RETURN_LAG_COLUMNS: Final = tuple(
    f"return_lag_{lag}" for lag in range(1, RETURN_LAG_COUNT + 1)
)
VOLATILITY_COLUMN: Final = f"volatility_{VOLATILITY_WINDOW}"
PRICE_FEATURE_COLUMNS: Final = (*RETURN_LAG_COLUMNS, VOLATILITY_COLUMN)


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
