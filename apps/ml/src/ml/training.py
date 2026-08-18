from collections.abc import Sequence
from typing import Final

import lightgbm as lgb
import polars as pl
from sklearn.linear_model import LogisticRegression

BINARY_TARGET_COLUMN: Final = "binary_label"
SYMBOL_FEATURE_COLUMN: Final = "symbol_code"

LIGHTGBM_PARAMETERS: Final = {
    "objective": "binary",
    "num_leaves": 15,
    "min_data_in_leaf": 200,
    "learning_rate": 0.05,
    "feature_fraction": 0.8,
    "verbosity": -1,
    "seed": 20260818,
}
NUM_BOOST_ROUND: Final = 1_000
EARLY_STOPPING_ROUNDS: Final = 50


def build_training_frame(
    frame: pl.DataFrame,
    feature_columns: Sequence[str],
) -> pl.DataFrame:
    if BINARY_TARGET_COLUMN in feature_columns or "label" in feature_columns:
        message = "ラベルを特徴量に含めることはできません。"
        raise ValueError(message)
    return (
        frame.filter(pl.col("label").is_in([1, -1]))
        .drop_nulls(list(feature_columns))
        .with_columns(
            (pl.col("label") == 1).cast(pl.Int8).alias(BINARY_TARGET_COLUMN),
            pl.col("symbol")
            .cast(pl.Categorical)
            .to_physical()
            .alias(SYMBOL_FEATURE_COLUMN),
        )
    )


def train_lightgbm(
    train_frame: pl.DataFrame,
    validation_frame: pl.DataFrame,
    feature_columns: Sequence[str],
) -> lgb.Booster:
    columns = [*feature_columns, SYMBOL_FEATURE_COLUMN]
    train_data = lgb.Dataset(
        train_frame.select(columns).to_numpy(),
        label=train_frame.get_column(BINARY_TARGET_COLUMN).to_numpy(),
        feature_name=columns,
        categorical_feature=[SYMBOL_FEATURE_COLUMN],
    )
    validation_data = train_data.create_valid(
        validation_frame.select(columns).to_numpy(),
        label=validation_frame.get_column(BINARY_TARGET_COLUMN).to_numpy(),
    )
    return lgb.train(
        LIGHTGBM_PARAMETERS,
        train_data,
        num_boost_round=NUM_BOOST_ROUND,
        valid_sets=[validation_data],
        callbacks=[lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False)],
    )


def train_logistic_regression(
    train_frame: pl.DataFrame,
    feature_columns: Sequence[str],
) -> LogisticRegression:
    model = LogisticRegression(max_iter=1_000)
    model.fit(
        train_frame.select(feature_columns).to_numpy(),
        train_frame.get_column(BINARY_TARGET_COLUMN).to_numpy(),
    )
    return model


def calculate_lightgbm_probabilities(
    model: lgb.Booster,
    frame: pl.DataFrame,
    feature_columns: Sequence[str],
) -> pl.Series:
    columns = [*feature_columns, SYMBOL_FEATURE_COLUMN]
    probabilities = model.predict(frame.select(columns).to_numpy())
    return pl.Series("probability_up", probabilities, dtype=pl.Float64)


def calculate_logistic_probabilities(
    model: LogisticRegression,
    frame: pl.DataFrame,
    feature_columns: Sequence[str],
) -> pl.Series:
    probabilities = model.predict_proba(frame.select(feature_columns).to_numpy())
    return pl.Series("probability_up", probabilities[:, 1], dtype=pl.Float64)
