from itertools import pairwise

import pytest

from ml.splits import (
    generate_walk_forward_splits,
    split_holdout_times,
    validate_holdout_fraction,
)

HOUR: int = 3_600_000
TIMES: list[int] = [index * HOUR for index in range(100)]


def test_最終区間をホールドアウトとして隔離する() -> None:
    development, holdout = split_holdout_times(TIMES)

    assert len(development) == 90
    assert len(holdout) == 10
    assert max(development) < min(holdout)


def test_範囲外のホールドアウト比率を拒否する() -> None:
    with pytest.raises(ValueError, match="0 より大きく 1 未満"):
        validate_holdout_fraction(1.0)


def test_ホールドアウトが確保できないデータ量を拒否する() -> None:
    with pytest.raises(ValueError, match="確保できません"):
        split_holdout_times([0, HOUR], 0.1)


def test_学習区間は検証区間より過去に限られる() -> None:
    splits = generate_walk_forward_splits(TIMES, 3)

    for train_times, test_times in splits:
        assert max(train_times) < min(test_times)


def test_パージとエンバーゴの分だけ学習と検証の間を空ける() -> None:
    splits = generate_walk_forward_splits(TIMES, 3, purge_count=1, embargo_count=2)

    for train_times, test_times in splits:
        assert min(test_times) - max(train_times) == 4 * HOUR


def test_検証区間は重複せず時系列順に進む() -> None:
    splits = generate_walk_forward_splits(TIMES, 3)

    for (_, earlier_test), (_, later_test) in pairwise(splits):
        assert max(earlier_test) < min(later_test)


def test_上限未指定の学習区間は拡大する() -> None:
    splits = generate_walk_forward_splits(TIMES, 3)

    train_lengths = [len(train_times) for train_times, _ in splits]
    assert train_lengths == sorted(train_lengths)
    assert all(train_times[0] == 0 for train_times, _ in splits)


def test_上限指定の学習区間は一定の長さで移動する() -> None:
    splits = generate_walk_forward_splits(TIMES, 3, max_train_count=10)

    for train_times, _ in splits:
        assert len(train_times) == 10

    train_starts = [train_times[0] for train_times, _ in splits]
    assert train_starts == sorted(set(train_starts))
    assert train_starts[0] > 0


def test_重複と順不同の時刻を一意化して整列する() -> None:
    development, holdout = split_holdout_times(list(reversed(TIMES)) + TIMES)

    assert len(development) + len(holdout) == len(TIMES)
    assert development == sorted(development)
