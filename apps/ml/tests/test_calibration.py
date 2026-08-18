import polars as pl
import pytest

from ml.calibration import (
    IsotonicCalibration,
    SigmoidCalibration,
    calculate_logit,
    calibrate_probabilities,
    fit_calibration,
    validate_calibration_inputs,
)


def build_overconfident_data() -> tuple[pl.Series, pl.Series]:
    high_group = [0.9] * 10
    low_group = [0.1] * 10
    high_labels = [1] * 6 + [0] * 4
    low_labels = [1] * 4 + [0] * 6
    probabilities = pl.Series("probability", high_group + low_group)
    labels = pl.Series("label", high_labels + low_labels)
    return probabilities, labels


def test_過信した確率をシグモイドで実際の的中率に近づける() -> None:
    probabilities, labels = build_overconfident_data()

    calibration = fit_calibration(probabilities, labels, "sigmoid")
    calibrated = calibrate_probabilities(probabilities, calibration)

    high_calibrated = calibrated.to_list()[0]
    low_calibrated = calibrated.to_list()[10]
    assert high_calibrated == pytest.approx(0.6, abs=0.05)
    assert low_calibrated == pytest.approx(0.4, abs=0.05)


def test_過信した確率を等張回帰で実際の的中率に一致させる() -> None:
    probabilities, labels = build_overconfident_data()

    calibration = fit_calibration(probabilities, labels, "isotonic")
    calibrated = calibrate_probabilities(probabilities, calibration)

    assert calibrated.to_list()[0] == pytest.approx(0.6)
    assert calibrated.to_list()[10] == pytest.approx(0.4)


def test_等張回帰の較正は単調性を保つ() -> None:
    probabilities = pl.Series(
        "probability", [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]
    )
    labels = pl.Series("label", [0, 0, 0, 1, 0, 1, 1, 1, 1, 1])

    calibration = fit_calibration(probabilities, labels, "isotonic")
    calibrated = calibrate_probabilities(probabilities, calibration).to_list()

    assert calibrated == sorted(calibrated)


def test_区間の外側の確率は端の値へ丸める() -> None:
    calibration = IsotonicCalibration(thresholds=(0.2, 0.8), values=(0.3, 0.7))

    calibrated = calibrate_probabilities(
        pl.Series("probability", [0.05, 0.95]), calibration
    )

    assert calibrated.to_list() == pytest.approx([0.3, 0.7])


def test_区間の内側の確率は線形に補間する() -> None:
    calibration = IsotonicCalibration(thresholds=(0.2, 0.8), values=(0.3, 0.7))

    calibrated = calibrate_probabilities(pl.Series("probability", [0.5]), calibration)

    assert calibrated.to_list() == pytest.approx([0.5])


def test_シグモイド較正は確率の範囲に収まる() -> None:
    calibration = SigmoidCalibration(coefficient=1.0, intercept=0.0)

    calibrated = calibrate_probabilities(
        pl.Series("probability", [0.0, 0.5, 1.0]), calibration
    )

    for value in calibrated.to_list():
        assert 0 <= value <= 1


def test_件数が一致しない入力を拒否する() -> None:
    with pytest.raises(ValueError, match="件数が一致しません"):
        validate_calibration_inputs(
            pl.Series("probability", [0.5]), pl.Series("label", [1, 0])
        )


def test_片方のクラスしかないラベルを拒否する() -> None:
    with pytest.raises(ValueError, match="両方のラベル"):
        validate_calibration_inputs(
            pl.Series("probability", [0.5, 0.6]), pl.Series("label", [1, 1])
        )


def test_想定外の較正方式を拒否する() -> None:
    probabilities, labels = build_overconfident_data()

    with pytest.raises(ValueError, match="較正方式"):
        fit_calibration(probabilities, labels, "spline")


def test_確率の端はロジットの計算前に丸める() -> None:
    assert calculate_logit(0.0) < 0
    assert calculate_logit(1.0) > 0
    assert calculate_logit(0.5) == pytest.approx(0.0)
