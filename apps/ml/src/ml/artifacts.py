import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import lightgbm as lgb

from ml.calibration import Calibration, IsotonicCalibration, SigmoidCalibration

MODEL_FILE_NAME: Final = "model.txt"
METADATA_FILE_NAME: Final = "metadata.json"


@dataclass(frozen=True)
class ModelMetadata:
    identifier: str
    interval: str
    train_start_open_time: int
    train_end_open_time: int
    hyperparameters: dict[str, float | int | str]
    feature_columns: tuple[str, ...]
    threshold: float
    calibration: Calibration
    hit_rate_floor: float
    commit_sha: str


def convert_calibration_to_dict(calibration: Calibration) -> dict[str, object]:
    if isinstance(calibration, SigmoidCalibration):
        return {
            "method": "sigmoid",
            "coefficient": calibration.coefficient,
            "intercept": calibration.intercept,
        }
    return {
        "method": "isotonic",
        "thresholds": list(calibration.thresholds),
        "values": list(calibration.values),
    }


def parse_calibration(data: object) -> Calibration:
    if not isinstance(data, dict):
        message = "較正の形式が正しくありません。メタデータを確認してください。"
        raise TypeError(message)
    method = data.get("method")
    if method == "sigmoid":
        return SigmoidCalibration(
            coefficient=float(data["coefficient"]),
            intercept=float(data["intercept"]),
        )
    if method == "isotonic":
        return IsotonicCalibration(
            thresholds=tuple(float(value) for value in data["thresholds"]),
            values=tuple(float(value) for value in data["values"]),
        )
    message = f"較正方式 {method} には対応していません。メタデータを確認してください。"
    raise ValueError(message)


def convert_metadata_to_json(metadata: ModelMetadata) -> str:
    payload = {
        "identifier": metadata.identifier,
        "interval": metadata.interval,
        "train_start_open_time": metadata.train_start_open_time,
        "train_end_open_time": metadata.train_end_open_time,
        "hyperparameters": metadata.hyperparameters,
        "feature_columns": list(metadata.feature_columns),
        "threshold": metadata.threshold,
        "calibration": convert_calibration_to_dict(metadata.calibration),
        "hit_rate_floor": metadata.hit_rate_floor,
        "commit_sha": metadata.commit_sha,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def parse_metadata(json_text: str) -> ModelMetadata:
    data = json.loads(json_text)
    if not isinstance(data, dict):
        message = (
            "メタデータの形式が正しくありません。ファイルの内容を確認してください。"
        )
        raise TypeError(message)
    try:
        return ModelMetadata(
            identifier=str(data["identifier"]),
            interval=str(data["interval"]),
            train_start_open_time=int(data["train_start_open_time"]),
            train_end_open_time=int(data["train_end_open_time"]),
            hyperparameters=dict(data["hyperparameters"]),
            feature_columns=tuple(str(value) for value in data["feature_columns"]),
            threshold=float(data["threshold"]),
            calibration=parse_calibration(data["calibration"]),
            hit_rate_floor=float(data["hit_rate_floor"]),
            commit_sha=str(data["commit_sha"]),
        )
    except KeyError as error:
        message = f"メタデータに {error.args[0]} がありません。ファイルの内容を確認してください。"
        raise ValueError(message) from error


def create_model_artifacts(
    directory: Path,
    model: lgb.Booster,
    metadata: ModelMetadata,
) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    model.save_model(str(directory / MODEL_FILE_NAME))
    metadata_path = directory / METADATA_FILE_NAME
    metadata_path.write_text(convert_metadata_to_json(metadata), encoding="utf-8")


def get_model(directory: Path) -> lgb.Booster:
    return lgb.Booster(model_file=str(directory / MODEL_FILE_NAME))


def get_metadata(directory: Path) -> ModelMetadata:
    metadata_path = directory / METADATA_FILE_NAME
    return parse_metadata(metadata_path.read_text(encoding="utf-8"))
