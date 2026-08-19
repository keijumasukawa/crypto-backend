import polars as pl
import pytest

from ml.train import (
    build_dataset,
    list_feature_columns,
    split_calibration_times,
    train_model,
)

HOUR: int = 3_600_000
ROW_COUNT: int = 400


def build_klines(symbol: str, scale: float) -> pl.DataFrame:
    closes = [
        scale * (1 + 0.01 * (((index * 37) % 101) / 101 - 0.5))
        for index in range(ROW_COUNT)
    ]
    opens = [scale, *closes[:-1]]
    return pl.DataFrame(
        {
            "symbol": [symbol] * ROW_COUNT,
            "open_time": [index * HOUR for index in range(ROW_COUNT)],
            "open": opens,
            "close": closes,
        }
    )


def build_indicator_values(klines: pl.DataFrame) -> pl.DataFrame:
    return klines.select(
        "symbol",
        pl.lit("1h").alias("interval"),
        "open_time",
        (pl.col("close") * 0.99).alias("sma20"),
        (pl.col("close") * 0.98).alias("sma50"),
        (pl.col("close") * 0.9).alias("sma200"),
        (pl.col("close") * 0.995).alias("ema12"),
        (pl.col("close") * 0.99).alias("ema26"),
        pl.lit(55.0).alias("rsi14"),
        (pl.col("close") * 0.005).alias("macd"),
        (pl.col("close") * 0.004).alias("macd_signal"),
        (pl.col("close") * 0.001).alias("macd_hist"),
        (pl.col("close") * 1.05).alias("bb_upper"),
        pl.col("close").alias("bb_middle"),
        (pl.col("close") * 0.95).alias("bb_lower"),
    )


def build_test_dataset() -> pl.DataFrame:
    klines = pl.concat([build_klines("BTCUSDT", 100.0), build_klines("ETHUSDT", 200.0)])
    return build_dataset(klines, build_indicator_values(klines), "1h")


def test_日足の特徴量には時刻を含めない() -> None:
    assert "hour_of_day" not in list_feature_columns("1d")
    assert "hour_of_day" in list_feature_columns("4h")
    assert "day_of_week" in list_feature_columns("1d")
    assert "btc_return" in list_feature_columns("1h")


def test_データセットはラベルと全特徴量の列を持つ() -> None:
    dataset = build_test_dataset()

    for column in ("label", "future_return", *list_feature_columns("1h")):
        assert column in dataset.columns


def test_BTCリターンの欠損は中立値で埋める() -> None:
    dataset = build_test_dataset()

    assert dataset.get_column("btc_return").null_count() == 0


def test_較正区間は学習期間の末尾から確保する() -> None:
    times = [index * HOUR for index in range(100)]

    core_times, calibration_times = split_calibration_times(times, 0.15)

    assert len(core_times) == 85
    assert len(calibration_times) == 15
    assert max(core_times) < min(calibration_times)


def test_較正区間が確保できないデータ量を拒否する() -> None:
    with pytest.raises(ValueError, match="較正区間"):
        split_calibration_times([0, HOUR], 0.1)


def test_学習の一連の流れが成果物と評価を返す() -> None:
    dataset = build_test_dataset()

    outcome = train_model(
        dataset,
        "1h",
        "0123456789abcdef0123456789abcdef01234567",
        fold_count=2,
        shuffle_tolerance=0.5,
    )

    assert outcome.metadata.interval == "1h"
    assert outcome.metadata.threshold in [index / 20 for index in range(11)]
    assert outcome.metadata.symbols == ("BTCUSDT", "ETHUSDT")
    assert outcome.metadata.train_end_open_time < 360 * HOUR
    for key in (
        "auc",
        "brier_skill_score",
        "hit_rate",
        "total_return",
        "trade_count",
        "max_drawdown",
    ):
        assert key in outcome.validation_metrics
        assert key in outcome.holdout_metrics
    assert outcome.validation_metrics["auc"] is not None
    assert 0 <= outcome.shuffled_auc <= 1
