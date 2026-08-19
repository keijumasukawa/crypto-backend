import polars as pl
import pytest

from ml.training import (
    BINARY_TARGET_COLUMN,
    SYMBOL_FEATURE_COLUMN,
    build_training_frame,
    calculate_lightgbm_probabilities,
    calculate_logistic_probabilities,
    train_lightgbm,
    train_logistic_regression,
)

HOUR: int = 3_600_000
FEATURE_COLUMNS: tuple[str, ...] = ("momentum",)


def build_labeled_frame(row_count: int, symbol: str = "BTCUSDT") -> pl.DataFrame:
    momentum = [1.0 if index % 2 == 0 else -1.0 for index in range(row_count)]
    labels = [1 if value > 0 else -1 for value in momentum]
    return pl.DataFrame(
        {
            "symbol": [symbol] * row_count,
            "open_time": [index * HOUR for index in range(row_count)],
            "momentum": momentum,
            "label": pl.Series(labels, dtype=pl.Int8),
        }
    )


def test_中立と欠損のラベルを学習対象から除外する() -> None:
    frame = build_labeled_frame(4).with_columns(
        pl.Series("label", [1, 0, -1, None], dtype=pl.Int8)
    )

    result = build_training_frame(frame, FEATURE_COLUMNS, ("BTCUSDT",))

    assert result.height == 2
    assert result.get_column(BINARY_TARGET_COLUMN).to_list() == [1, 0]


def test_特徴量が欠損する行を学習対象から除外する() -> None:
    frame = build_labeled_frame(4).with_columns(
        pl.Series("momentum", [1.0, None, -1.0, 1.0])
    )

    result = build_training_frame(frame, FEATURE_COLUMNS, ("BTCUSDT",))

    assert result.height == 3


def test_銘柄コードは整列順の対応表で確定する() -> None:
    frame = pl.concat(
        [build_labeled_frame(2, "ETHUSDT"), build_labeled_frame(2, "BTCUSDT")]
    )

    result = build_training_frame(frame, FEATURE_COLUMNS, ("ETHUSDT", "BTCUSDT")).sort(
        "symbol"
    )

    assert result.get_column(SYMBOL_FEATURE_COLUMN).to_list() == [0, 0, 1, 1]


def test_対応表にない銘柄を拒否する() -> None:
    frame = build_labeled_frame(2, "SOLUSDT")

    with pytest.raises(pl.exceptions.InvalidOperationError):
        build_training_frame(frame, FEATURE_COLUMNS, ("BTCUSDT",))


def test_ラベルを特徴量に含める指定を拒否する() -> None:
    frame = build_labeled_frame(4)

    with pytest.raises(ValueError, match="ラベルを特徴量に"):
        build_training_frame(frame, ("momentum", "label"), ("BTCUSDT",))


def test_LightGBMが分離可能なパターンを学習する() -> None:
    train_frame = build_training_frame(
        build_labeled_frame(1_000), FEATURE_COLUMNS, ("BTCUSDT",)
    )
    validation_frame = build_training_frame(
        build_labeled_frame(400), FEATURE_COLUMNS, ("BTCUSDT",)
    )

    model = train_lightgbm(train_frame, validation_frame, FEATURE_COLUMNS)
    probabilities = calculate_lightgbm_probabilities(
        model, validation_frame, FEATURE_COLUMNS
    )

    up_rows = validation_frame.get_column("momentum").to_list()
    for probability, momentum in zip(probabilities.to_list(), up_rows, strict=True):
        if momentum > 0:
            assert probability > 0.7
        else:
            assert probability < 0.3


def test_ロジスティック回帰が分離可能なパターンを学習する() -> None:
    train_frame = build_training_frame(
        build_labeled_frame(1_000), FEATURE_COLUMNS, ("BTCUSDT",)
    )

    model = train_logistic_regression(train_frame, FEATURE_COLUMNS)
    probabilities = calculate_logistic_probabilities(
        model, train_frame, FEATURE_COLUMNS
    )

    for probability, momentum in zip(
        probabilities.to_list(),
        train_frame.get_column("momentum").to_list(),
        strict=True,
    ):
        if momentum > 0:
            assert probability > 0.7
        else:
            assert probability < 0.3
