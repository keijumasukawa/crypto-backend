import math
from bisect import bisect_left
from dataclasses import dataclass
from typing import Final

import polars as pl
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

CALIBRATION_METHODS: Final = ("sigmoid", "isotonic")
PROBABILITY_EPSILON: Final = 1e-6


@dataclass(frozen=True)
class SigmoidCalibration:
    coefficient: float
    intercept: float


@dataclass(frozen=True)
class IsotonicCalibration:
    thresholds: tuple[float, ...]
    values: tuple[float, ...]


Calibration = SigmoidCalibration | IsotonicCalibration


def clip_probability(probability: float) -> float:
    return min(max(probability, PROBABILITY_EPSILON), 1 - PROBABILITY_EPSILON)


def calculate_logit(probability: float) -> float:
    clipped = clip_probability(probability)
    return math.log(clipped / (1 - clipped))


def validate_calibration_inputs(
    probabilities: pl.Series,
    labels: pl.Series,
) -> None:
    if probabilities.len() != labels.len():
        message = (
            "確率とラベルの件数が一致しません。較正区間のデータを確認してください。"
        )
        raise ValueError(message)
    unique_labels = set(labels.unique().to_list())
    if unique_labels != {0, 1}:
        message = "較正には上昇と下落の両方のラベルが必要です。較正区間のデータを確認してください。"
        raise ValueError(message)


def fit_calibration(
    probabilities: pl.Series,
    labels: pl.Series,
    method: str,
) -> Calibration:
    validate_calibration_inputs(probabilities, labels)
    if method == "sigmoid":
        return fit_sigmoid_calibration(probabilities, labels)
    if method == "isotonic":
        return fit_isotonic_calibration(probabilities, labels)
    message = (
        f"較正方式は {'、'.join(CALIBRATION_METHODS)} のいずれかを指定してください。"
    )
    raise ValueError(message)


def fit_sigmoid_calibration(
    probabilities: pl.Series,
    labels: pl.Series,
) -> SigmoidCalibration:
    logits = [[calculate_logit(value)] for value in probabilities.to_list()]
    model = LogisticRegression(max_iter=1_000)
    model.fit(logits, labels.to_list())
    return SigmoidCalibration(
        coefficient=float(model.coef_[0][0]),
        intercept=float(model.intercept_[0]),
    )


def fit_isotonic_calibration(
    probabilities: pl.Series,
    labels: pl.Series,
) -> IsotonicCalibration:
    model = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    model.fit(probabilities.to_list(), labels.to_list())
    return IsotonicCalibration(
        thresholds=tuple(float(value) for value in model.X_thresholds_),
        values=tuple(float(value) for value in model.y_thresholds_),
    )


def calibrate_probabilities(
    probabilities: pl.Series,
    calibration: Calibration,
) -> pl.Series:
    if isinstance(calibration, SigmoidCalibration):
        calibrated = [
            apply_sigmoid(value, calibration) for value in probabilities.to_list()
        ]
    else:
        calibrated = [
            apply_isotonic(value, calibration) for value in probabilities.to_list()
        ]
    return pl.Series("calibrated_probability", calibrated, dtype=pl.Float64)


def apply_sigmoid(probability: float, calibration: SigmoidCalibration) -> float:
    score = calibration.coefficient * calculate_logit(probability)
    return 1 / (1 + math.exp(-(score + calibration.intercept)))


def apply_isotonic(probability: float, calibration: IsotonicCalibration) -> float:
    thresholds = calibration.thresholds
    values = calibration.values
    if probability <= thresholds[0]:
        return values[0]
    if probability >= thresholds[-1]:
        return values[-1]
    upper_index = bisect_left(thresholds, probability)
    lower_index = upper_index - 1
    span = thresholds[upper_index] - thresholds[lower_index]
    weight = (probability - thresholds[lower_index]) / span
    return values[lower_index] + weight * (values[upper_index] - values[lower_index])
