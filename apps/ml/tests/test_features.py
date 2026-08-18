import polars as pl
import pytest

from ml.features import (
    INDICATOR_FEATURE_COLUMNS,
    PRICE_FEATURE_COLUMNS,
    VOLATILITY_WINDOW,
    calculate_indicator_features,
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


def test_指標系特徴量の列名一覧は乖離と位置と比率を網羅する() -> None:
    assert INDICATOR_FEATURE_COLUMNS == (
        "sma20_deviation",
        "sma50_deviation",
        "sma200_deviation",
        "bb_position",
        "rsi14",
        "macd_hist_ratio",
    )


def test_整列されていない入力を時系列順に整えて処理する() -> None:
    frame = build_kline_frame([100.0, 110.0, 121.0]).reverse()

    result = calculate_price_features(frame)

    assert result.get_column("open_time").to_list() == [0, HOUR, 2 * HOUR]
    assert result.get_column("return_lag_1").to_list() == pytest.approx(
        [None, 0.1, 0.1]
    )


def build_indicator_frame(
    close: float,
    sma20: float | None = 100.0,
    bb_lower: float | None = 100.0,
    bb_upper: float | None = 110.0,
    macd_hist: float | None = 2.2,
) -> pl.DataFrame:
    return pl.DataFrame(
        {
            "symbol": ["BTCUSDT"],
            "open_time": [0],
            "close": [close],
            "sma20": [sma20],
            "sma50": [110.0],
            "sma200": [88.0],
            "rsi14": [65.4321098765],
            "bb_lower": [bb_lower],
            "bb_upper": [bb_upper],
            "macd_hist": [macd_hist],
        }
    )


def test_移動平均乖離を比率で計算する() -> None:
    result = calculate_indicator_features(build_indicator_frame(110.0))

    assert result.get_column("sma20_deviation").to_list() == pytest.approx([0.1])
    assert result.get_column("sma50_deviation").to_list() == pytest.approx([0.0])
    assert result.get_column("sma200_deviation").to_list() == pytest.approx([0.25])


def test_バンド内位置を下限0上限1で計算する() -> None:
    result = calculate_indicator_features(build_indicator_frame(105.0))

    assert result.get_column("bb_position").to_list() == pytest.approx([0.5])


def test_バンド幅が0の場合は位置を計算しない() -> None:
    result = calculate_indicator_features(
        build_indicator_frame(100.0, bb_lower=100.0, bb_upper=100.0)
    )

    assert result.get_column("bb_position").to_list() == [None]


def test_ヒストグラムを終値で比率化する() -> None:
    result = calculate_indicator_features(build_indicator_frame(110.0))

    assert result.get_column("macd_hist_ratio").to_list() == pytest.approx([0.02])


def test_指標が欠損する区間は特徴量も欠損のまま伝播する() -> None:
    result = calculate_indicator_features(
        build_indicator_frame(110.0, sma20=None, macd_hist=None)
    )

    assert result.get_column("sma20_deviation").to_list() == [None]
    assert result.get_column("macd_hist_ratio").to_list() == [None]
    assert result.get_column("rsi14").to_list() == pytest.approx([65.4321098765])
