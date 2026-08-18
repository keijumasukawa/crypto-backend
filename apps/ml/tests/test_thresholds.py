import polars as pl
import pytest

from ml.thresholds import (
    calculate_scores,
    convert_probabilities_to_directions,
    find_best_threshold,
    format_score,
    validate_threshold,
)


def test_閾値を境に3値へ変換する() -> None:
    probabilities = pl.Series("probability", [0.7, 0.625, 0.5, 0.375, 0.2])

    directions = convert_probabilities_to_directions(probabilities, 0.25)

    assert directions.to_list() == [
        "bullish",
        "bullish",
        "neutral",
        "bearish",
        "bearish",
    ]


def test_境界値は方向の判定に含める() -> None:
    probabilities = pl.Series("probability", [0.625, 0.6249, 0.3751, 0.375])

    directions = convert_probabilities_to_directions(probabilities, 0.25)

    assert directions.to_list() == ["bullish", "neutral", "neutral", "bearish"]


def test_確率が欠損する行は方向も欠損とする() -> None:
    probabilities = pl.Series("probability", [0.7, None], dtype=pl.Float64)

    directions = convert_probabilities_to_directions(probabilities, 0.25)

    assert directions.to_list() == ["bullish", None]


def test_範囲外の閾値を拒否する() -> None:
    with pytest.raises(ValueError, match="0 以上 1 以下"):
        validate_threshold(1.5)


def test_確率をマイナス1からプラス1のスコアへ写像する() -> None:
    probabilities = pl.Series("probability", [0.0, 0.5, 0.75, 1.0])

    scores = calculate_scores(probabilities)

    assert scores.to_list() == pytest.approx([-1.0, 0.0, 0.5, 1.0])


def test_スコアを小数10桁の文字列に整形する() -> None:
    assert format_score(0.5) == "0.5000000000"
    assert format_score(-1.0) == "-1.0000000000"


def test_スコアの丸めは10桁の四捨五入とする() -> None:
    assert format_score(0.00000000005) == "0.0000000001"
    assert format_score(-0.00000000005) == "-0.0000000001"


def test_評価値が最大となる閾値を選ぶ() -> None:
    values = {0.1: 0.5, 0.2: 0.9, 0.3: 0.7}

    best = find_best_threshold((0.1, 0.2, 0.3), lambda tau: values[tau])

    assert best == 0.2


def test_評価値が同点の場合は先の候補を選ぶ() -> None:
    best = find_best_threshold((0.1, 0.2), lambda _tau: 1.0)

    assert best == 0.1


def test_空の閾値候補を拒否する() -> None:
    with pytest.raises(ValueError, match="1 件以上"):
        find_best_threshold((), lambda _tau: 0.0)
