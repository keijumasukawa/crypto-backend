from typing import Final

import polars as pl
from sklearn.calibration import calibration_curve
from sklearn.metrics import brier_score_loss, roc_auc_score

from ml.thresholds import BEARISH, BULLISH

RELIABILITY_BIN_COUNT: Final = 10


def calculate_auc(probabilities: pl.Series, binary_labels: pl.Series) -> float:
    return float(roc_auc_score(binary_labels.to_list(), probabilities.to_list()))


def calculate_brier_score(
    probabilities: pl.Series,
    binary_labels: pl.Series,
) -> float:
    return float(brier_score_loss(binary_labels.to_list(), probabilities.to_list()))


def calculate_brier_skill_score(
    probabilities: pl.Series,
    binary_labels: pl.Series,
    base_rate: float,
) -> float:
    base_probabilities = pl.Series("probability", [base_rate] * binary_labels.len())
    base_score = calculate_brier_score(base_probabilities, binary_labels)
    if base_score == 0:
        message = "基準モデルの Brier スコアが 0 のため比較できません。ラベルの分布を確認してください。"
        raise ValueError(message)
    return 1 - calculate_brier_score(probabilities, binary_labels) / base_score


def calculate_reliability_curve(
    probabilities: pl.Series,
    binary_labels: pl.Series,
    bin_count: int = RELIABILITY_BIN_COUNT,
) -> pl.DataFrame:
    fraction_positive, mean_predicted = calibration_curve(
        binary_labels.to_list(),
        probabilities.to_list(),
        n_bins=bin_count,
        strategy="uniform",
    )
    return pl.DataFrame(
        {
            "mean_predicted": [float(value) for value in mean_predicted],
            "fraction_positive": [float(value) for value in fraction_positive],
        }
    )


def calculate_hit_rate(directions: pl.Series, labels: pl.Series) -> float | None:
    if directions.len() != labels.len():
        message = (
            "方向とラベルの件数が一致しません。評価区間のデータを確認してください。"
        )
        raise ValueError(message)
    hit_count = 0
    trade_count = 0
    for direction, label in zip(directions.to_list(), labels.to_list(), strict=True):
        if direction not in (BULLISH, BEARISH) or label is None:
            continue
        trade_count += 1
        if (direction == BULLISH and label == 1) or (
            direction == BEARISH and label == -1
        ):
            hit_count += 1
    if trade_count == 0:
        return None
    return hit_count / trade_count


def calculate_trade_returns(
    directions: pl.Series,
    future_returns: pl.Series,
    cost: float,
) -> pl.Series:
    if directions.len() != future_returns.len():
        message = (
            "方向とリターンの件数が一致しません。評価区間のデータを確認してください。"
        )
        raise ValueError(message)
    trade_returns = []
    for direction, future_return in zip(
        directions.to_list(), future_returns.to_list(), strict=True
    ):
        if direction not in (BULLISH, BEARISH) or future_return is None:
            trade_returns.append(0.0)
        elif direction == BULLISH:
            trade_returns.append(future_return - cost)
        else:
            trade_returns.append(-future_return - cost)
    return pl.Series("trade_return", trade_returns, dtype=pl.Float64)


def calculate_max_drawdown(trade_returns: pl.Series) -> float:
    peak = 0.0
    cumulative = 0.0
    max_drawdown = 0.0
    for trade_return in trade_returns.to_list():
        cumulative += trade_return
        peak = max(peak, cumulative)
        max_drawdown = max(max_drawdown, peak - cumulative)
    return max_drawdown
