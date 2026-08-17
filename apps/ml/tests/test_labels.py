import polars as pl
import pytest

from ml.labels import (
    INTERVAL_MILLISECONDS,
    calculate_future_returns,
    generate_labels,
    validate_cost,
)

HOUR: int = INTERVAL_MILLISECONDS["1h"]


def build_kline_frame(opens: list[float], symbol: str = "BTCUSDT") -> pl.DataFrame:
    return pl.DataFrame(
        {
            "symbol": [symbol] * len(opens),
            "open_time": [index * HOUR for index in range(len(opens))],
            "open": opens,
        }
    )


def test_執行足の始値から翌足の始値までのリターンを計算する() -> None:
    frame = build_kline_frame([100.0, 110.0, 121.0])

    result = calculate_future_returns(frame, "1h")

    assert result.get_column("future_return").to_list() == pytest.approx(
        [0.1, None, None]
    )


def test_コストを超えるリターンを上昇と下落に分類する() -> None:
    frame = build_kline_frame([100.0, 100.0, 100.3, 100.0, 99.7, 100.0, 100.1])

    result = generate_labels(frame, "1h", 0.002)

    assert result.get_column("label").to_list() == [1, -1, -1, 1, 0, None, None]


def test_コストと等しいリターンは中立とする() -> None:
    frame = build_kline_frame([100.0, 100.0, 150.0])

    result = generate_labels(frame, "1h", 0.5)

    assert result.get_column("label").to_list() == [0, None, None]


def test_銘柄をまたいでシフトしない() -> None:
    frame = pl.concat(
        [
            build_kline_frame([100.0, 110.0, 121.0], "BTCUSDT"),
            build_kline_frame([200.0, 180.0, 162.0], "ETHUSDT"),
        ]
    )

    result = generate_labels(frame, "1h")

    assert result.get_column("label").to_list() == [1, None, None, -1, None, None]


def test_足の欠落をまたぐリターンを生成しない() -> None:
    frame = pl.DataFrame(
        {
            "symbol": ["BTCUSDT"] * 4,
            "open_time": [0, HOUR, 2 * HOUR, 4 * HOUR],
            "open": [100.0, 110.0, 121.0, 133.1],
        }
    )

    result = generate_labels(frame, "1h")

    assert result.get_column("label").to_list() == [1, None, None, None]


def test_整列されていない入力を時系列順に整えて処理する() -> None:
    frame = build_kline_frame([100.0, 110.0, 121.0]).reverse()

    result = calculate_future_returns(frame, "1h")

    assert result.get_column("open_time").to_list() == [0, HOUR, 2 * HOUR]
    assert result.get_column("future_return").to_list() == pytest.approx(
        [0.1, None, None]
    )


def test_負のコストを拒否する() -> None:
    with pytest.raises(ValueError, match="0 以上"):
        validate_cost(-0.001)


def test_インターバルとミリ秒の対応は全インターバルを網羅する() -> None:
    assert INTERVAL_MILLISECONDS == {
        "1h": 3_600_000,
        "4h": 14_400_000,
        "1d": 86_400_000,
    }
