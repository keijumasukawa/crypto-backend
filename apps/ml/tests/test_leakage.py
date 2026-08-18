import polars as pl
import pytest

from ml.features import (
    calculate_calendar_features,
    calculate_cross_symbol_features,
    calculate_indicator_features,
    calculate_price_features,
)
from ml.labels import generate_labels
from ml.leakage import (
    find_max_referenced_open_time,
    shuffle_series,
    validate_feature_reference,
    validate_random_auc,
    validate_shuffled_label_training,
)
from ml.training import build_training_frame

HOUR: int = 3_600_000
ROW_COUNT: int = 25
TARGET_TIME: int = 22 * HOUR


def build_kline_frame(symbol: str = "BTCUSDT") -> pl.DataFrame:
    closes = [
        100.0 + index * (1 if index % 2 == 0 else -1) for index in range(ROW_COUNT)
    ]
    return pl.DataFrame(
        {
            "symbol": [symbol] * ROW_COUNT,
            "open_time": [index * HOUR for index in range(ROW_COUNT)],
            "open": [close - 0.5 for close in closes],
            "close": closes,
        }
    )


def test_価格系特徴量は対象の足より未来を参照しない() -> None:
    frame = build_kline_frame()

    for column in ("return_lag_1", "return_lag_5", "volatility_20"):
        validate_feature_reference(
            calculate_price_features,
            frame,
            column,
            "BTCUSDT",
            TARGET_TIME,
            ("close",),
            TARGET_TIME,
        )


def test_指標系特徴量は対象の足より未来を参照しない() -> None:
    frame = build_kline_frame().with_columns(
        (pl.col("close") * 0.99).alias("sma20"),
        (pl.col("close") * 0.98).alias("sma50"),
        (pl.col("close") * 0.9).alias("sma200"),
        (pl.col("close") * 0.95).alias("bb_lower"),
        (pl.col("close") * 1.05).alias("bb_upper"),
        (pl.col("close") * 0.01).alias("macd_hist"),
    )

    for column in ("sma20_deviation", "bb_position", "macd_hist_ratio"):
        validate_feature_reference(
            calculate_indicator_features,
            frame,
            column,
            "BTCUSDT",
            TARGET_TIME,
            ("close", "sma20", "bb_lower", "bb_upper", "macd_hist"),
            TARGET_TIME,
        )


def test_クロス銘柄特徴量は対象の足より未来を参照しない() -> None:
    frame = pl.concat([build_kline_frame("BTCUSDT"), build_kline_frame("ETHUSDT")])

    validate_feature_reference(
        calculate_cross_symbol_features,
        frame,
        "btc_return",
        "ETHUSDT",
        TARGET_TIME,
        ("close",),
        TARGET_TIME,
    )


def test_カレンダー特徴量は価格を参照しない() -> None:
    frame = build_kline_frame()

    max_referenced = find_max_referenced_open_time(
        lambda input_frame: calculate_calendar_features(input_frame, "4h"),
        frame,
        "hour_of_day",
        "BTCUSDT",
        TARGET_TIME,
        ("close",),
    )

    assert max_referenced is None


def test_ラベルは執行足と決済足までのみを参照する() -> None:
    frame = build_kline_frame()

    max_referenced = find_max_referenced_open_time(
        lambda input_frame: generate_labels(input_frame, "1h"),
        frame,
        "future_return",
        "BTCUSDT",
        TARGET_TIME,
        ("open",),
    )

    assert max_referenced == TARGET_TIME + 2 * HOUR


def test_未来を参照する特徴量を検出して拒否する() -> None:
    frame = build_kline_frame()

    def leaky_transform(input_frame: pl.DataFrame) -> pl.DataFrame:
        return input_frame.with_columns(
            pl.col("close").shift(-1).over("symbol").alias("leaky_feature")
        )

    with pytest.raises(ValueError, match="未来の足"):
        validate_feature_reference(
            leaky_transform,
            frame,
            "leaky_feature",
            "BTCUSDT",
            TARGET_TIME,
            ("close",),
            TARGET_TIME,
        )


def build_learnable_frame(row_count: int, offset: int = 0) -> pl.DataFrame:
    momentum = [((index + offset) * 37 % 101) / 101 - 0.5 for index in range(row_count)]
    noise = [((index + offset) * 53 % 97) / 97 - 0.5 for index in range(row_count)]
    labels = [
        1 if value + 0.6 * shift > 0 else -1
        for value, shift in zip(momentum, noise, strict=True)
    ]
    return pl.DataFrame(
        {
            "symbol": ["BTCUSDT"] * row_count,
            "open_time": [index * HOUR for index in range(row_count)],
            "momentum": momentum,
            "label": pl.Series(labels, dtype=pl.Int8),
        }
    )


def test_シャッフルは同じ乱数の種で同じ並びを返す() -> None:
    series = pl.Series("label", list(range(100)))

    first = shuffle_series(series, 1)
    second = shuffle_series(series, 1)
    different = shuffle_series(series, 2)

    assert first.to_list() == second.to_list()
    assert first.to_list() != different.to_list()
    assert sorted(first.to_list()) == list(range(100))


def test_健全な学習はシャッフル検査を通過する() -> None:
    train_frame = build_training_frame(build_learnable_frame(1_000), ("momentum",))
    validation_frame = build_training_frame(
        build_learnable_frame(400, 1_000), ("momentum",)
    )

    auc = validate_shuffled_label_training(
        train_frame, validation_frame, ("momentum",), seed=1
    )

    assert auc == pytest.approx(0.5, abs=0.1)


def test_反復回数が1未満の指定を拒否する() -> None:
    train_frame = build_training_frame(build_learnable_frame(1_000), ("momentum",))

    with pytest.raises(ValueError, match="1 以上"):
        validate_shuffled_label_training(
            train_frame, train_frame, ("momentum",), seed=1, repeat_count=0
        )


def test_ランダムから乖離したAUCを検出して拒否する() -> None:
    with pytest.raises(ValueError, match="乖離"):
        validate_random_auc(0.9)
    with pytest.raises(ValueError, match="乖離"):
        validate_random_auc(0.1)
    validate_random_auc(0.55)
