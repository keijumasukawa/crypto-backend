from collections.abc import Sequence
from typing import Final

from sklearn.model_selection import TimeSeriesSplit

PURGE_COUNT: Final = 1
EMBARGO_COUNT: Final = 5
HOLDOUT_FRACTION: Final = 0.1


def validate_holdout_fraction(holdout_fraction: float) -> float:
    if not 0 < holdout_fraction < 1:
        message = "ホールドアウトの比率は 0 より大きく 1 未満で指定してください。"
        raise ValueError(message)
    return holdout_fraction


def split_holdout_times(
    open_times: Sequence[int],
    holdout_fraction: float = HOLDOUT_FRACTION,
) -> tuple[list[int], list[int]]:
    validate_holdout_fraction(holdout_fraction)
    sorted_times = sorted(set(open_times))
    holdout_count = round(len(sorted_times) * holdout_fraction)
    if holdout_count == 0 or holdout_count == len(sorted_times):
        message = "ホールドアウトに割り当てる足が確保できません。データ量と比率を確認してください。"
        raise ValueError(message)
    development_count = len(sorted_times) - holdout_count
    return sorted_times[:development_count], sorted_times[development_count:]


def generate_walk_forward_splits(
    open_times: Sequence[int],
    fold_count: int,
    purge_count: int = PURGE_COUNT,
    embargo_count: int = EMBARGO_COUNT,
    max_train_count: int | None = None,
) -> list[tuple[list[int], list[int]]]:
    sorted_times = sorted(set(open_times))
    splitter = TimeSeriesSplit(
        n_splits=fold_count,
        gap=purge_count + embargo_count,
        max_train_size=max_train_count,
    )
    return [
        (
            [sorted_times[index] for index in train_indices],
            [sorted_times[index] for index in test_indices],
        )
        for train_indices, test_indices in splitter.split(sorted_times)
    ]
