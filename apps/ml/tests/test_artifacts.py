import polars as pl
import pytest

from ml.artifacts import (
    METADATA_FILE_NAME,
    MODEL_FILE_NAME,
    ModelMetadata,
    convert_metadata_to_json,
    create_model_artifacts,
    get_metadata,
    get_model,
    parse_calibration,
    parse_metadata,
)
from ml.calibration import IsotonicCalibration, SigmoidCalibration
from ml.training import (
    build_training_frame,
    calculate_lightgbm_probabilities,
    train_lightgbm,
)

HOUR: int = 3_600_000


def build_metadata() -> ModelMetadata:
    return ModelMetadata(
        identifier="ml-v1-0001",
        interval="4h",
        train_start_open_time=1_500_000_000_000,
        train_end_open_time=1_600_000_000_000,
        hyperparameters={"num_leaves": 15, "objective": "binary"},
        feature_columns=("return_lag_1", "volatility_20"),
        symbols=("BTCUSDT", "ETHUSDT"),
        threshold=0.2,
        calibration=SigmoidCalibration(coefficient=1.1, intercept=-0.05),
        hit_rate_floor=0.52,
        commit_sha="0123456789abcdef0123456789abcdef01234567",
    )


def test_メタデータはJSONを経由して往復できる() -> None:
    metadata = build_metadata()

    assert parse_metadata(convert_metadata_to_json(metadata)) == metadata


def test_等張較正のメタデータも往復できる() -> None:
    metadata = ModelMetadata(
        identifier="ml-v1-0002",
        interval="1h",
        train_start_open_time=0,
        train_end_open_time=HOUR,
        hyperparameters={},
        feature_columns=("rsi14",),
        symbols=("BTCUSDT",),
        threshold=0.1,
        calibration=IsotonicCalibration(thresholds=(0.2, 0.8), values=(0.3, 0.7)),
        hit_rate_floor=0.5,
        commit_sha="abc",
    )

    assert parse_metadata(convert_metadata_to_json(metadata)) == metadata


def test_必須項目が欠けたメタデータを拒否する() -> None:
    metadata_json = convert_metadata_to_json(build_metadata())
    broken = metadata_json.replace('"threshold"', '"unknown"')

    with pytest.raises(ValueError, match="threshold"):
        parse_metadata(broken)


def test_対応しない較正方式を拒否する() -> None:
    with pytest.raises(ValueError, match="対応していません"):
        parse_calibration({"method": "spline"})


def build_labeled_frame(row_count: int) -> pl.DataFrame:
    momentum = [1.0 if index % 2 == 0 else -1.0 for index in range(row_count)]
    labels = [1 if value > 0 else -1 for value in momentum]
    return pl.DataFrame(
        {
            "symbol": ["BTCUSDT"] * row_count,
            "open_time": [index * HOUR for index in range(row_count)],
            "momentum": momentum,
            "label": pl.Series(labels, dtype=pl.Int8),
        }
    )


def test_保存したモデルは同じ予測を返す(
    tmp_path_factory: pytest.TempPathFactory,
) -> None:
    directory = tmp_path_factory.mktemp("model_artifacts")
    frame = build_training_frame(
        build_labeled_frame(1_000), ("momentum",), ("BTCUSDT",)
    )
    model = train_lightgbm(frame, frame, ("momentum",))

    create_model_artifacts(directory, model, build_metadata())
    loaded = get_model(directory)

    original = calculate_lightgbm_probabilities(model, frame, ("momentum",))
    restored = calculate_lightgbm_probabilities(loaded, frame, ("momentum",))
    assert restored.to_list() == pytest.approx(original.to_list())


def test_成果物は2つのファイルとして出力される(
    tmp_path_factory: pytest.TempPathFactory,
) -> None:
    directory = tmp_path_factory.mktemp("model_artifacts")
    frame = build_training_frame(
        build_labeled_frame(1_000), ("momentum",), ("BTCUSDT",)
    )
    model = train_lightgbm(frame, frame, ("momentum",))
    metadata = build_metadata()

    create_model_artifacts(directory, model, metadata)

    assert (directory / MODEL_FILE_NAME).is_file()
    assert (directory / METADATA_FILE_NAME).is_file()
    assert get_metadata(directory) == metadata
