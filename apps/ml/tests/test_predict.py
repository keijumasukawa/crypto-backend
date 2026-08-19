import json
from datetime import UTC, datetime

import polars as pl
import pytest

from ml.artifacts import ModelMetadata
from ml.calibration import SigmoidCalibration
from ml.db import SIGNAL_COLUMNS, build_latest_signal_query
from ml.predict import (
    build_empty_signal_frame,
    calculate_signal_frame,
    format_generated_at,
)
from ml.train import build_dataset, list_feature_columns
from ml.training import build_training_frame, train_lightgbm

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
        "open_time",
        (pl.col("close") * 0.99).alias("sma20"),
        (pl.col("close") * 0.98).alias("sma50"),
        (pl.col("close") * 0.9).alias("sma200"),
        pl.lit(55.0).alias("rsi14"),
        (pl.col("close") * 0.001).alias("macd_hist"),
        (pl.col("close") * 1.05).alias("bb_upper"),
        (pl.col("close") * 0.95).alias("bb_lower"),
    )


def build_test_inputs() -> tuple[pl.DataFrame, ModelMetadata]:
    klines = pl.concat([build_klines("BTCUSDT", 100.0), build_klines("ETHUSDT", 200.0)])
    dataset = build_dataset(klines, build_indicator_values(klines), "1h")
    metadata = ModelMetadata(
        identifier="ml-v1-1h-test",
        interval="1h",
        train_start_open_time=0,
        train_end_open_time=300 * HOUR,
        hyperparameters={},
        feature_columns=list_feature_columns("1h"),
        symbols=("BTCUSDT", "ETHUSDT"),
        threshold=0.1,
        calibration=SigmoidCalibration(coefficient=1.0, intercept=0.0),
        hit_rate_floor=0.5,
        commit_sha="test",
    )
    return dataset, metadata


def test_学習末尾より後の足だけにシグナルを生成する() -> None:
    dataset, metadata = build_test_inputs()
    feature_columns = list_feature_columns("1h")
    train_frame = build_training_frame(
        dataset.filter(pl.col("open_time") <= 300 * HOUR),
        feature_columns,
        metadata.symbols,
    )
    model = train_lightgbm(train_frame, train_frame, feature_columns)

    signal_frame = calculate_signal_frame(
        dataset, model, metadata, "2026-08-19T00:00:00.000Z", 300 * HOUR
    )

    assert signal_frame.columns == list(SIGNAL_COLUMNS)
    assert min(signal_frame.get_column("open_time").to_list()) > 300 * HOUR
    assert set(signal_frame.get_column("symbol").to_list()) == {
        "BTCUSDT",
        "ETHUSDT",
    }
    assert set(signal_frame.get_column("logic_version").to_list()) == {"ml-v1"}


def test_シグナルの保存形式が仕様に一致する() -> None:
    dataset, metadata = build_test_inputs()
    feature_columns = list_feature_columns("1h")
    train_frame = build_training_frame(dataset, feature_columns, metadata.symbols)
    model = train_lightgbm(train_frame, train_frame, feature_columns)

    signal_frame = calculate_signal_frame(
        dataset, model, metadata, "2026-08-19T00:00:00.000Z", 300 * HOUR
    )
    first_row = signal_frame.row(0, named=True)

    assert first_row["direction"] in ("bullish", "bearish", "neutral")
    _integer_part, _, decimal_part = first_row["score"].partition(".")
    assert len(decimal_part) == 10
    components = json.loads(first_row["components"])
    assert components["m"] == "ml-v1-1h-test"
    assert 0 <= components["p"] <= 1
    score_value = float(first_row["score"])
    assert score_value == pytest.approx(2 * components["p"] - 1, abs=1e-9)
    assert first_row["generated_at"] == "2026-08-19T00:00:00.000Z"


def test_対象の足がない場合は空のシグナルを返す() -> None:
    dataset, metadata = build_test_inputs()
    feature_columns = list_feature_columns("1h")
    train_frame = build_training_frame(dataset, feature_columns, metadata.symbols)
    model = train_lightgbm(train_frame, train_frame, feature_columns)

    signal_frame = calculate_signal_frame(
        dataset, model, metadata, "2026-08-19T00:00:00.000Z", 500 * HOUR
    )

    assert signal_frame.is_empty()
    assert signal_frame.columns == list(SIGNAL_COLUMNS)


def test_空のシグナルは書き込み層の検証を通る形とする() -> None:
    assert build_empty_signal_frame().columns == list(SIGNAL_COLUMNS)


def test_生成時刻はミリ秒精度のUTC文字列に整形する() -> None:
    now = datetime(2026, 8, 19, 12, 34, 56, 789000, tzinfo=UTC)

    assert format_generated_at(now) == "2026-08-19T12:34:56.789Z"


def test_最新シグナルの問い合わせはml_v1に限定する() -> None:
    query = build_latest_signal_query("4h")

    assert query == (
        "SELECT max(open_time) AS latest_open_time FROM signals"
        " WHERE interval = '4h' AND logic_version = 'ml-v1'"
    )
