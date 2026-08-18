import polars as pl
import pytest

from ml.metrics import (
    calculate_auc,
    calculate_brier_score,
    calculate_brier_skill_score,
    calculate_hit_rate,
    calculate_max_drawdown,
    calculate_reliability_curve,
    calculate_trade_returns,
)


def test_完全に分離できる予測のAUCは1になる() -> None:
    probabilities = pl.Series("probability", [0.9, 0.8, 0.2, 0.1])
    labels = pl.Series("label", [1, 1, 0, 0])

    assert calculate_auc(probabilities, labels) == pytest.approx(1.0)


def test_無情報の予測のAUCは0点5になる() -> None:
    probabilities = pl.Series("probability", [0.9, 0.1, 0.9, 0.1])
    labels = pl.Series("label", [1, 1, 0, 0])

    assert calculate_auc(probabilities, labels) == pytest.approx(0.5)


def test_完全な予測のBrierスコアは0になる() -> None:
    probabilities = pl.Series("probability", [1.0, 0.0])
    labels = pl.Series("label", [1, 0])

    assert calculate_brier_score(probabilities, labels) == pytest.approx(0.0)


def test_基準率と同じ予測のスキルスコアは0になる() -> None:
    probabilities = pl.Series("probability", [0.5, 0.5, 0.5, 0.5])
    labels = pl.Series("label", [1, 0, 1, 0])

    assert calculate_brier_skill_score(probabilities, labels, 0.5) == pytest.approx(0.0)


def test_基準率より良い予測のスキルスコアは正になる() -> None:
    probabilities = pl.Series("probability", [0.9, 0.1, 0.9, 0.1])
    labels = pl.Series("label", [1, 0, 1, 0])

    assert calculate_brier_skill_score(probabilities, labels, 0.5) > 0


def test_信頼性図はビンごとの予測平均と実際の率を返す() -> None:
    probabilities = pl.Series("probability", [0.1] * 5 + [0.9] * 5)
    labels = pl.Series("label", [0, 0, 0, 0, 1, 1, 1, 1, 1, 0])

    curve = calculate_reliability_curve(probabilities, labels, bin_count=2)

    assert curve.get_column("mean_predicted").to_list() == pytest.approx([0.1, 0.9])
    assert curve.get_column("fraction_positive").to_list() == pytest.approx([0.2, 0.8])


def test_的中率は方向を出した行のみを母数とする() -> None:
    directions = pl.Series(
        "direction", ["bullish", "bearish", "neutral", "bullish", "bearish"]
    )
    labels = pl.Series("label", [1, -1, 1, -1, None], dtype=pl.Int8)

    assert calculate_hit_rate(directions, labels) == pytest.approx(2 / 3)


def test_方向の予測がない場合の的中率は判定不能とする() -> None:
    directions = pl.Series("direction", ["neutral", "neutral"])
    labels = pl.Series("label", [1, -1], dtype=pl.Int8)

    assert calculate_hit_rate(directions, labels) is None


def test_取引損益はコストを差し引いて計算する() -> None:
    directions = pl.Series("direction", ["bullish", "bearish", "neutral", "bullish"])
    future_returns = pl.Series("future_return", [0.05, 0.03, 0.10, None])

    trade_returns = calculate_trade_returns(directions, future_returns, 0.002)

    assert trade_returns.to_list() == pytest.approx([0.048, -0.032, 0.0, 0.0])


def test_件数が一致しない損益の入力を拒否する() -> None:
    directions = pl.Series("direction", ["bullish"])
    future_returns = pl.Series("future_return", [0.05, 0.03])

    with pytest.raises(ValueError, match="件数が一致しません"):
        calculate_trade_returns(directions, future_returns, 0.002)


def test_最大ドローダウンは累積損益の高値からの下落幅とする() -> None:
    trade_returns = pl.Series("trade_return", [0.1, -0.2, 0.05, -0.1])

    assert calculate_max_drawdown(trade_returns) == pytest.approx(0.25)


def test_損失がない場合のドローダウンは0になる() -> None:
    trade_returns = pl.Series("trade_return", [0.1, 0.2])

    assert calculate_max_drawdown(trade_returns) == pytest.approx(0.0)
