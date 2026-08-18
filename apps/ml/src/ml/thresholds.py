from collections.abc import Callable, Sequence
from decimal import ROUND_HALF_UP, Decimal
from typing import Final

import polars as pl

BULLISH: Final = "bullish"
BEARISH: Final = "bearish"
NEUTRAL: Final = "neutral"
SCORE_EXPONENT: Final = Decimal("0.0000000001")


def validate_threshold(threshold: float) -> float:
    if not 0 <= threshold <= 1:
        message = "3 値化の閾値は 0 以上 1 以下で指定してください。"
        raise ValueError(message)
    return threshold


def convert_probabilities_to_directions(
    probabilities: pl.Series,
    threshold: float,
) -> pl.Series:
    validate_threshold(threshold)
    upper_bound = 0.5 + threshold / 2
    lower_bound = 0.5 - threshold / 2
    directions = [
        convert_probability_to_direction(value, upper_bound, lower_bound)
        for value in probabilities.to_list()
    ]
    return pl.Series("direction", directions, dtype=pl.String)


def convert_probability_to_direction(
    probability: float | None,
    upper_bound: float,
    lower_bound: float,
) -> str | None:
    if probability is None:
        return None
    if probability >= upper_bound:
        return BULLISH
    if probability <= lower_bound:
        return BEARISH
    return NEUTRAL


def calculate_scores(probabilities: pl.Series) -> pl.Series:
    return (probabilities * 2 - 1).rename("score")


def format_score(score: float) -> str:
    quantized = Decimal(str(score)).quantize(SCORE_EXPONENT, rounding=ROUND_HALF_UP)
    return format(quantized, "f")


def find_best_threshold(
    candidates: Sequence[float],
    evaluate: Callable[[float], float],
) -> float:
    if not candidates:
        message = "3 値化の閾値の候補を 1 件以上指定してください。"
        raise ValueError(message)
    best_threshold = candidates[0]
    best_value = evaluate(validate_threshold(candidates[0]))
    for candidate in candidates[1:]:
        value = evaluate(validate_threshold(candidate))
        if value > best_value:
            best_threshold = candidate
            best_value = value
    return best_threshold
