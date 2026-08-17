import pytest

from ml import main


def test_起動メッセージを出力する(capsys: pytest.CaptureFixture[str]) -> None:
    main()
    assert capsys.readouterr().out == "Hello from ml!\n"
