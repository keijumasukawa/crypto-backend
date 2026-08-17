import polars as pl
import pytest
from adbc_driver_manager import OperationalError

from ml.db import (
    KLINE_DECIMAL_COLUMNS,
    SIGNAL_COLUMNS,
    build_indicator_values_query,
    build_klines_query,
    build_signals_upsert_query,
    build_symbols_query,
    convert_decimal_columns,
    list_active_symbols,
    update_signals,
    validate_interval,
    validate_signal_frame,
    validate_start_time,
    validate_symbols,
)


def test_有効な銘柄のみを昇順で取得する問い合わせを組み立てる() -> None:
    assert (
        build_symbols_query()
        == "SELECT symbol FROM symbols WHERE is_active ORDER BY symbol"
    )


def test_期間指定がない場合は全期間を対象とする問い合わせを組み立てる() -> None:
    query = build_klines_query("1h", ("BTCUSDT", "ETHUSDT"))

    assert query == (
        "SELECT symbol, interval, open_time, open, high, low, close, volume,"
        " close_time, quote_asset_volume, number_of_trades,"
        " taker_buy_base_asset_volume, taker_buy_quote_asset_volume FROM klines"
        " WHERE interval = '1h' AND symbol IN ('BTCUSDT', 'ETHUSDT')"
        " ORDER BY symbol, open_time"
    )


def test_期間指定がある場合は開始時刻以降に絞り込む() -> None:
    query = build_klines_query("1d", ("BTCUSDT",), 1_500_000_000_000)

    assert " AND open_time >= 1500000000000 ORDER BY symbol, open_time" in query


def test_指標値は内部状態の列を取得しない() -> None:
    query = build_indicator_values_query("4h", ("SOLUSDT",))

    assert "FROM indicator_values" in query
    assert "rsi_avg_gain14" not in query
    assert "rsi_avg_loss14" not in query


def test_想定外のインターバルを拒否する() -> None:
    with pytest.raises(ValueError, match="インターバル"):
        validate_interval("2h")


def test_銘柄が空の場合を拒否する() -> None:
    with pytest.raises(ValueError, match="1 件以上"):
        validate_symbols(())


def test_形式が正しくない銘柄を拒否する() -> None:
    with pytest.raises(ValueError, match="形式"):
        validate_symbols(("BTCUSDT'; DROP TABLE klines; --",))


def test_負の開始時刻を拒否する() -> None:
    with pytest.raises(ValueError, match="0 以上"):
        validate_start_time(-1)


def test_文字列の小数列を数値へ変換し欠損を保持する() -> None:
    frame = pl.DataFrame(
        {
            "symbol": ["BTCUSDT", "BTCUSDT"],
            "open": ["43210.5000000000", "43211.0000000000"],
            "high": ["43300.0000000000", None],
        }
    )

    converted = convert_decimal_columns(frame, ("open", "high"))

    assert converted.schema["open"] == pl.Float64
    assert converted.schema["high"] == pl.Float64
    assert converted.get_column("open").to_list() == [43210.5, 43211.0]
    assert converted.get_column("high").to_list() == [43300.0, None]
    assert converted.schema["symbol"] == pl.String


def test_変換対象の列は保存対象の小数列に一致する() -> None:
    assert KLINE_DECIMAL_COLUMNS == (
        "open",
        "high",
        "low",
        "close",
        "volume",
        "quote_asset_volume",
        "taker_buy_base_asset_volume",
        "taker_buy_quote_asset_volume",
    )


def test_接続できない場合は接続の例外を送出する() -> None:
    with pytest.raises(OperationalError, match="Failed to connect"):
        list_active_symbols("postgresql://invalid:invalid@127.0.0.1:1/invalid")


def build_signal_frame() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "symbol": ["BTCUSDT"],
            "interval": ["1h"],
            "open_time": [1_500_000_000_000],
            "logic_version": ["ml-v1"],
            "direction": ["bullish"],
            "score": ["0.1234567890"],
            "components": ['{"p":0.5617283945,"m":"ml-v1-20260818"}'],
            "generated_at": ["2026-08-18T00:00:00.000Z"],
        }
    )


def test_主キーの衝突時に判定列を更新する問い合わせを組み立てる() -> None:
    query = build_signals_upsert_query("signals_staging")

    assert query == (
        "INSERT INTO signals (symbol, interval, open_time, logic_version,"
        " direction, score, components, generated_at)"
        " SELECT symbol, interval, open_time, logic_version, direction,"
        " score::numeric, components::jsonb, generated_at::timestamptz"
        " FROM signals_staging"
        " ON CONFLICT (symbol, interval, open_time, logic_version)"
        " DO UPDATE SET direction = EXCLUDED.direction, score = EXCLUDED.score,"
        " components = EXCLUDED.components, generated_at = EXCLUDED.generated_at"
    )


def test_列が不足する行の書き込みを拒否する() -> None:
    frame = build_signal_frame().drop("score")

    with pytest.raises(ValueError, match="score"):
        validate_signal_frame(frame)


def test_想定外の列を含む行の書き込みを拒否する() -> None:
    frame = build_signal_frame().with_columns(pl.lit(1).alias("extra"))

    with pytest.raises(ValueError, match="extra"):
        validate_signal_frame(frame)


def test_他のロジックバージョンの書き込みを拒否する() -> None:
    frame = build_signal_frame().with_columns(pl.lit("rule-v1").alias("logic_version"))

    with pytest.raises(ValueError, match="ml-v1"):
        validate_signal_frame(frame)


def test_検証済みの行は定義順の列で返す() -> None:
    frame = build_signal_frame().select(reversed(build_signal_frame().columns))

    validated = validate_signal_frame(frame)

    assert validated.columns == list(SIGNAL_COLUMNS)


def test_空の行の書き込みは接続せずに0を返す() -> None:
    frame = build_signal_frame().clear()

    assert (
        update_signals("postgresql://invalid:invalid@127.0.0.1:1/invalid", frame) == 0
    )
