from typing import Final

import polars as pl

BINARY_LABELS: Final = (1, -1)
BASELINE_PROBABILITY_COLUMNS: Final = (
    "always_up_probability",
    "persistence_probability",
    "base_rate_probability",
)
BUY_AND_HOLD_COLUMN: Final = "buy_and_hold_return"


def validate_probability(probability: float) -> float:
    if not 0 <= probability <= 1:
        message = "確率は 0 以上 1 以下で指定してください。"
        raise ValueError(message)
    return probability


def calculate_base_rate(labels: pl.Series) -> float:
    binary_labels = labels.filter(labels.is_in(BINARY_LABELS))
    if binary_labels.is_empty():
        message = "2 値のラベルがありません。学習区間のラベルを確認してください。"
        raise ValueError(message)
    mean_value = (binary_labels == 1).mean()
    if not isinstance(mean_value, int | float):
        message = "基準率を算出できません。ラベルの型を確認してください。"
        raise TypeError(message)
    return float(mean_value)


def calculate_baseline_predictions(
    frame: pl.DataFrame,
    base_rate: float,
) -> pl.DataFrame:
    validate_probability(base_rate)
    previous_return = (pl.col("close") / pl.col("close").shift(1) - 1).over("symbol")
    persistence = (
        pl.when(previous_return > 0)
        .then(1.0)
        .when(previous_return < 0)
        .then(0.0)
        .otherwise(None)
    )
    return frame.sort("symbol", "open_time").with_columns(
        pl.lit(1.0).alias("always_up_probability"),
        persistence.alias("persistence_probability"),
        pl.lit(base_rate).alias("base_rate_probability"),
    )


def calculate_buy_and_hold_returns(frame: pl.DataFrame) -> pl.DataFrame:
    return (
        frame.sort("symbol", "open_time")
        .group_by("symbol", maintain_order=True)
        .agg(
            (pl.col("close").last() / pl.col("close").first() - 1).alias(
                BUY_AND_HOLD_COLUMN
            )
        )
    )
