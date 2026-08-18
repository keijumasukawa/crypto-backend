import polars as pl
import pytest

from ml.features import (
    PRICE_FEATURE_COLUMNS,
    VOLATILITY_WINDOW,
    calculate_price_features,
)

HOUR: int = 3_600_000


def build_kline_frame(closes: list[float], symbol: str = "BTCUSDT") -> pl.DataFrame:
    return pl.DataFrame(
        {
            "symbol": [symbol] * len(closes),
            "open_time": [index * HOUR for index in range(len(closes))],
            "close": closes,
        }
    )


def test_当足の1本リターンとそのラグを計算する() -> None:
    frame = build_kline_frame([100.0, 110.0, 121.0, 133.1])

    result = calculate_price_features(frame)

    assert result.get_column("return_lag_1").to_list() == pytest.approx(
        [None, 0.1, 0.1, 0.1]
    )
    assert result.get_column("return_lag_2").to_list() == pytest.approx(
        [None, None, 0.1, 0.1]
    )
    assert result.get_column("return_lag_5").to_list() == [None, None, None, None]


def test_ラグは過去方向のみを参照する() -> None:
    frame = build_kline_frame([100.0, 100.0, 100.0, 200.0])

    result = calculate_price_features(frame)

    assert result.get_column("return_lag_1").to_list()[:3] == pytest.approx(
        [None, 0.0, 0.0]
    )
    assert result.get_column("return_lag_2").to_list()[:3] == pytest.approx(
        [None, None, 0.0]
    )


def test_銘柄をまたいでリターンを計算しない() -> None:
    frame = pl.concat(
        [
            build_kline_frame([100.0, 110.0], "BTCUSDT"),
            build_kline_frame([200.0, 100.0], "ETHUSDT"),
        ]
    )

    result = calculate_price_features(frame)

    assert result.get_column("return_lag_1").to_list() == pytest.approx(
        [None, 0.1, None, -0.5]
    )


def test_一定の値動きのボラティリティは0になる() -> None:
    closes = [100.0 * (1.1**power) for power in range(VOLATILITY_WINDOW + 2)]
    frame = build_kline_frame(closes)

    result = calculate_price_features(frame)
    volatility = result.get_column(f"volatility_{VOLATILITY_WINDOW}").to_list()

    assert volatility[VOLATILITY_WINDOW] == pytest.approx(0.0, abs=1e-12)
    assert volatility[VOLATILITY_WINDOW - 1] is None


def test_特徴量の列名一覧はラグとボラティリティを網羅する() -> None:
    assert PRICE_FEATURE_COLUMNS == (
        "return_lag_1",
        "return_lag_2",
        "return_lag_3",
        "return_lag_4",
        "return_lag_5",
        "volatility_20",
    )


def test_整列されていない入力を時系列順に整えて処理する() -> None:
    frame = build_kline_frame([100.0, 110.0, 121.0]).reverse()

    result = calculate_price_features(frame)

    assert result.get_column("open_time").to_list() == [0, HOUR, 2 * HOUR]
    assert result.get_column("return_lag_1").to_list() == pytest.approx(
        [None, 0.1, 0.1]
    )
