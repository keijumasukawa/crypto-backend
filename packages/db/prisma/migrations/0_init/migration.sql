-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "symbols" (
    "symbol" TEXT NOT NULL,
    "base_asset" TEXT NOT NULL,
    "quote_asset" TEXT NOT NULL,
    "onboard_date" TIMESTAMPTZ(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL,

    CONSTRAINT "symbols_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "klines" (
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "open_time" BIGINT NOT NULL,
    "open" DECIMAL(30,10) NOT NULL,
    "high" DECIMAL(30,10) NOT NULL,
    "low" DECIMAL(30,10) NOT NULL,
    "close" DECIMAL(30,10) NOT NULL,
    "volume" DECIMAL(30,10) NOT NULL,
    "close_time" BIGINT NOT NULL,
    "quote_asset_volume" DECIMAL(30,10) NOT NULL,
    "number_of_trades" INTEGER NOT NULL,
    "taker_buy_base_asset_volume" DECIMAL(30,10) NOT NULL,
    "taker_buy_quote_asset_volume" DECIMAL(30,10) NOT NULL,

    CONSTRAINT "klines_pkey" PRIMARY KEY ("symbol","interval","open_time")
);

-- CreateTable
CREATE TABLE "indicator_values" (
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "open_time" BIGINT NOT NULL,
    "sma20" DECIMAL(30,10),
    "sma50" DECIMAL(30,10),
    "sma200" DECIMAL(30,10),
    "ema12" DECIMAL(30,10),
    "ema26" DECIMAL(30,10),
    "rsi14" DECIMAL(30,10),
    "macd" DECIMAL(30,10),
    "macd_signal" DECIMAL(30,10),
    "macd_hist" DECIMAL(30,10),
    "bb_upper" DECIMAL(30,10),
    "bb_middle" DECIMAL(30,10),
    "bb_lower" DECIMAL(30,10),
    "rsi_avg_gain14" DECIMAL(30,10),
    "rsi_avg_loss14" DECIMAL(30,10),

    CONSTRAINT "indicator_values_pkey" PRIMARY KEY ("symbol","interval","open_time")
);

-- CreateTable
CREATE TABLE "signals" (
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "open_time" BIGINT NOT NULL,
    "logic_version" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "score" DECIMAL(30,10) NOT NULL,
    "components" JSONB NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("symbol","interval","open_time","logic_version")
);
