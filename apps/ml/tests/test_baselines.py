import polars as pl
import pytest

from ml.baselines import (
    calculate_base_rate,
    calculate_baseline_predictions,
    calculate_buy_and_hold_returns,
    validate_probability,
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


def test_学習区間の2値ラベルから上昇の基準率を算出する() -> None:
    labels = pl.Series("label", [1, 1, -1, 0, None], dtype=pl.Int8)

    assert calculate_base_rate(labels) == pytest.approx(2 / 3)


def test_2値のラベルがない場合を拒否する() -> None:
    labels = pl.Series("label", [0, None], dtype=pl.Int8)

    with pytest.raises(ValueError, match="2 値のラベル"):
        calculate_base_rate(labels)


def test_範囲外の確率を拒否する() -> None:
    with pytest.raises(ValueError, match="0 以上 1 以下"):
        validate_probability(1.5)


def test_常時上昇と基準率は定数の確率を返す() -> None:
    frame = build_kline_frame([100.0, 110.0])

    result = calculate_baseline_predictions(frame, 0.55)

    assert result.get_column("always_up_probability").to_list() == [1.0, 1.0]
    assert result.get_column("base_rate_probability").to_list() == [0.55, 0.55]


def test_持続性は直前足と同方向を予測する() -> None:
    frame = build_kline_frame([100.0, 110.0, 99.0, 99.0])

    result = calculate_baseline_predictions(frame, 0.5)

    assert result.get_column("persistence_probability").to_list() == [
        None,
        1.0,
        0.0,
        None,
    ]


def test_持続性は銘柄をまたいで予測しない() -> None:
    frame = pl.concat(
        [
            build_kline_frame([100.0, 110.0], "BTCUSDT"),
            build_kline_frame([200.0, 190.0], "ETHUSDT"),
        ]
    )

    result = calculate_baseline_predictions(frame, 0.5)

    assert result.get_column("persistence_probability").to_list() == [
        None,
        1.0,
        None,
        0.0,
    ]


def test_保有リターンを銘柄ごとに算出する() -> None:
    frame = pl.concat(
        [
            build_kline_frame([100.0, 120.0, 150.0], "BTCUSDT"),
            build_kline_frame([200.0, 180.0, 100.0], "ETHUSDT"),
        ]
    )

    result = calculate_buy_and_hold_returns(frame)

    assert result.get_column("symbol").to_list() == ["BTCUSDT", "ETHUSDT"]
    assert result.get_column("buy_and_hold_return").to_list() == pytest.approx(
        [0.5, -0.5]
    )
