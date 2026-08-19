import re
from collections.abc import Sequence
from typing import Final

import polars as pl
from adbc_driver_postgresql.dbapi import connect

KLINE_INTERVALS: Final = ("1h", "4h", "1d")
SYMBOL_PATTERN: Final = re.compile(r"[A-Z0-9]+")

KLINE_COLUMNS: Final = (
    "symbol",
    "interval",
    "open_time",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "close_time",
    "quote_asset_volume",
    "number_of_trades",
    "taker_buy_base_asset_volume",
    "taker_buy_quote_asset_volume",
)
KLINE_DECIMAL_COLUMNS: Final = (
    "open",
    "high",
    "low",
    "close",
    "volume",
    "quote_asset_volume",
    "taker_buy_base_asset_volume",
    "taker_buy_quote_asset_volume",
)

INDICATOR_VALUE_COLUMNS: Final = (
    "symbol",
    "interval",
    "open_time",
    "sma20",
    "sma50",
    "sma200",
    "ema12",
    "ema26",
    "rsi14",
    "macd",
    "macd_signal",
    "macd_hist",
    "bb_upper",
    "bb_middle",
    "bb_lower",
)
INDICATOR_VALUE_DECIMAL_COLUMNS: Final = INDICATOR_VALUE_COLUMNS[3:]

SIGNAL_COLUMNS: Final = (
    "symbol",
    "interval",
    "open_time",
    "logic_version",
    "direction",
    "score",
    "components",
    "generated_at",
)
SIGNAL_UPDATE_COLUMNS: Final = ("direction", "score", "components", "generated_at")
SIGNALS_STAGING_TABLE: Final = "signals_staging"
ML_LOGIC_VERSION: Final = "ml-v1"

ADBC_ENGINE: Final = "adbc"


def validate_interval(interval: str) -> str:
    if interval not in KLINE_INTERVALS:
        message = f"インターバルは {'、'.join(KLINE_INTERVALS)} のいずれかを指定してください。"
        raise ValueError(message)
    return interval


def validate_symbols(symbols: Sequence[str]) -> tuple[str, ...]:
    if not symbols:
        message = "銘柄を 1 件以上指定してください。"
        raise ValueError(message)
    for symbol in symbols:
        if SYMBOL_PATTERN.fullmatch(symbol) is None:
            message = f"銘柄 {symbol} の形式が正しくありません。英大文字と数字で指定してください。"
            raise ValueError(message)
    return tuple(symbols)


def validate_start_time(start_time: int) -> int:
    if start_time < 0:
        message = "開始時刻は 0 以上で指定してください。"
        raise ValueError(message)
    return start_time


def build_symbols_query() -> str:
    return "SELECT symbol FROM symbols WHERE is_active ORDER BY symbol"


def build_klines_query(
    interval: str,
    symbols: Sequence[str],
    start_time: int | None = None,
) -> str:
    return build_series_query("klines", KLINE_COLUMNS, interval, symbols, start_time)


def build_indicator_values_query(
    interval: str,
    symbols: Sequence[str],
    start_time: int | None = None,
) -> str:
    return build_series_query(
        "indicator_values",
        INDICATOR_VALUE_COLUMNS,
        interval,
        symbols,
        start_time,
    )


def build_series_query(
    table: str,
    columns: Sequence[str],
    interval: str,
    symbols: Sequence[str],
    start_time: int | None,
) -> str:
    validated_symbols = validate_symbols(symbols)
    symbol_list = ", ".join(f"'{symbol}'" for symbol in validated_symbols)
    conditions = [
        f"interval = '{validate_interval(interval)}'",
        f"symbol IN ({symbol_list})",
    ]
    if start_time is not None:
        conditions.append(f"open_time >= {validate_start_time(start_time)}")
    return (
        f"SELECT {', '.join(columns)} FROM {table}"
        f" WHERE {' AND '.join(conditions)}"
        " ORDER BY symbol, open_time"
    )


def convert_decimal_columns(
    frame: pl.DataFrame,
    columns: Sequence[str],
) -> pl.DataFrame:
    return frame.with_columns(pl.col(column).cast(pl.Float64) for column in columns)


def list_active_symbols(uri: str) -> list[str]:
    frame = pl.read_database_uri(build_symbols_query(), uri, engine=ADBC_ENGINE)
    return [str(symbol) for symbol in frame.get_column("symbol").to_list()]


def list_klines(
    uri: str,
    interval: str,
    symbols: Sequence[str],
    start_time: int | None = None,
) -> pl.DataFrame:
    query = build_klines_query(interval, symbols, start_time)
    frame = pl.read_database_uri(query, uri, engine=ADBC_ENGINE)
    return convert_decimal_columns(frame, KLINE_DECIMAL_COLUMNS)


def list_indicator_values(
    uri: str,
    interval: str,
    symbols: Sequence[str],
    start_time: int | None = None,
) -> pl.DataFrame:
    query = build_indicator_values_query(interval, symbols, start_time)
    frame = pl.read_database_uri(query, uri, engine=ADBC_ENGINE)
    return convert_decimal_columns(frame, INDICATOR_VALUE_DECIMAL_COLUMNS)


def build_latest_signal_query(interval: str) -> str:
    return (
        "SELECT max(open_time) AS latest_open_time FROM signals"
        f" WHERE interval = '{validate_interval(interval)}'"
        f" AND logic_version = '{ML_LOGIC_VERSION}'"
    )


def get_latest_signal_open_time(uri: str, interval: str) -> int | None:
    query = build_latest_signal_query(interval)
    frame = pl.read_database_uri(query, uri, engine=ADBC_ENGINE)
    latest_open_time = frame.get_column("latest_open_time").to_list()[0]
    if latest_open_time is None:
        return None
    return int(latest_open_time)


def validate_signal_frame(frame: pl.DataFrame) -> pl.DataFrame:
    missing_columns = [
        column for column in SIGNAL_COLUMNS if column not in frame.columns
    ]
    if missing_columns:
        message = f"signals の列 {'、'.join(missing_columns)} がありません。"
        raise ValueError(message)
    extra_columns = [column for column in frame.columns if column not in SIGNAL_COLUMNS]
    if extra_columns:
        message = f"signals にない列 {'、'.join(extra_columns)} が含まれています。"
        raise ValueError(message)
    logic_versions = frame.get_column("logic_version").unique().to_list()
    if logic_versions and logic_versions != [ML_LOGIC_VERSION]:
        message = f"logic_version は {ML_LOGIC_VERSION} のみ書き込めます。"
        raise ValueError(message)
    return frame.select(SIGNAL_COLUMNS)


def build_signals_upsert_query(staging_table: str) -> str:
    update_assignments = ", ".join(
        f"{column} = EXCLUDED.{column}" for column in SIGNAL_UPDATE_COLUMNS
    )
    return (
        f"INSERT INTO signals ({', '.join(SIGNAL_COLUMNS)})"
        " SELECT symbol, interval, open_time, logic_version, direction,"
        " score::numeric, components::jsonb, generated_at::timestamptz"
        f" FROM {staging_table}"
        " ON CONFLICT (symbol, interval, open_time, logic_version)"
        f" DO UPDATE SET {update_assignments}"
    )


def update_signals(uri: str, frame: pl.DataFrame) -> int:
    validated = validate_signal_frame(frame)
    if validated.is_empty():
        return 0
    with connect(uri) as connection, connection.cursor() as cursor:
        cursor.adbc_ingest(
            SIGNALS_STAGING_TABLE,
            validated,
            mode="create_append",
            temporary=True,
        )
        cursor.execute(build_signals_upsert_query(SIGNALS_STAGING_TABLE))
        connection.commit()
    return validated.height
