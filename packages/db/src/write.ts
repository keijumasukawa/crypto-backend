import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";

export type SqlExecutor = {
  $executeRaw: (query: Prisma.Sql) => Promise<number>;
};

export type KlineRow = {
  symbol: string;
  interval: string;
  openTime: bigint;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: bigint;
  quoteAssetVolume: string;
  numberOfTrades: number;
  takerBuyBaseAssetVolume: string;
  takerBuyQuoteAssetVolume: string;
};

export type IndicatorValueRow = {
  symbol: string;
  interval: string;
  openTime: bigint;
  sma20: string | null;
  sma50: string | null;
  sma200: string | null;
  ema12: string | null;
  ema26: string | null;
  rsi14: string | null;
  macd: string | null;
  macdSignal: string | null;
  macdHist: string | null;
  bbUpper: string | null;
  bbMiddle: string | null;
  bbLower: string | null;
  rsiAvgGain14: string | null;
  rsiAvgLoss14: string | null;
};

export type SignalRow = {
  symbol: string;
  interval: string;
  openTime: bigint;
  logicVersion: string;
  direction: string;
  score: string;
  components: unknown;
  generatedAt: Date;
};

const BATCH_SIZE = 1000;

function buildBatches<T>(rows: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let start = 0; start < rows.length; start += size) {
    batches.push(rows.slice(start, start + size));
  }
  return batches;
}

export async function updateKlines(
  executor: SqlExecutor,
  rows: KlineRow[],
): Promise<void> {
  for (const batch of buildBatches(rows, BATCH_SIZE)) {
    const values = Prisma.join(
      batch.map(
        (row) =>
          Prisma.sql`(${row.symbol}, ${row.interval}, ${row.openTime}, ${row.open}::numeric, ${row.high}::numeric, ${row.low}::numeric, ${row.close}::numeric, ${row.volume}::numeric, ${row.closeTime}, ${row.quoteAssetVolume}::numeric, ${row.numberOfTrades}, ${row.takerBuyBaseAssetVolume}::numeric, ${row.takerBuyQuoteAssetVolume}::numeric)`,
      ),
    );
    await executor.$executeRaw(Prisma.sql`
      INSERT INTO klines (symbol, interval, open_time, open, high, low, close, volume, close_time, quote_asset_volume, number_of_trades, taker_buy_base_asset_volume, taker_buy_quote_asset_volume)
      VALUES ${values}
      ON CONFLICT (symbol, interval, open_time) DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        close_time = EXCLUDED.close_time,
        quote_asset_volume = EXCLUDED.quote_asset_volume,
        number_of_trades = EXCLUDED.number_of_trades,
        taker_buy_base_asset_volume = EXCLUDED.taker_buy_base_asset_volume,
        taker_buy_quote_asset_volume = EXCLUDED.taker_buy_quote_asset_volume
    `);
  }
}

export async function updateIndicatorValues(
  executor: SqlExecutor,
  rows: IndicatorValueRow[],
): Promise<void> {
  for (const batch of buildBatches(rows, BATCH_SIZE)) {
    const values = Prisma.join(
      batch.map(
        (row) =>
          Prisma.sql`(${row.symbol}, ${row.interval}, ${row.openTime}, ${row.sma20}::numeric, ${row.sma50}::numeric, ${row.sma200}::numeric, ${row.ema12}::numeric, ${row.ema26}::numeric, ${row.rsi14}::numeric, ${row.macd}::numeric, ${row.macdSignal}::numeric, ${row.macdHist}::numeric, ${row.bbUpper}::numeric, ${row.bbMiddle}::numeric, ${row.bbLower}::numeric, ${row.rsiAvgGain14}::numeric, ${row.rsiAvgLoss14}::numeric)`,
      ),
    );
    await executor.$executeRaw(Prisma.sql`
      INSERT INTO indicator_values (symbol, interval, open_time, sma20, sma50, sma200, ema12, ema26, rsi14, macd, macd_signal, macd_hist, bb_upper, bb_middle, bb_lower, rsi_avg_gain14, rsi_avg_loss14)
      VALUES ${values}
      ON CONFLICT (symbol, interval, open_time) DO UPDATE SET
        sma20 = EXCLUDED.sma20,
        sma50 = EXCLUDED.sma50,
        sma200 = EXCLUDED.sma200,
        ema12 = EXCLUDED.ema12,
        ema26 = EXCLUDED.ema26,
        rsi14 = EXCLUDED.rsi14,
        macd = EXCLUDED.macd,
        macd_signal = EXCLUDED.macd_signal,
        macd_hist = EXCLUDED.macd_hist,
        bb_upper = EXCLUDED.bb_upper,
        bb_middle = EXCLUDED.bb_middle,
        bb_lower = EXCLUDED.bb_lower,
        rsi_avg_gain14 = EXCLUDED.rsi_avg_gain14,
        rsi_avg_loss14 = EXCLUDED.rsi_avg_loss14
    `);
  }
}

export async function updateSignals(
  executor: SqlExecutor,
  rows: SignalRow[],
): Promise<void> {
  for (const batch of buildBatches(rows, BATCH_SIZE)) {
    const values = Prisma.join(
      batch.map(
        (row) =>
          Prisma.sql`(${row.symbol}, ${row.interval}, ${row.openTime}, ${row.logicVersion}, ${row.direction}, ${row.score}::numeric, ${JSON.stringify(row.components)}::jsonb, ${row.generatedAt})`,
      ),
    );
    await executor.$executeRaw(Prisma.sql`
      INSERT INTO signals (symbol, interval, open_time, logic_version, direction, score, components, generated_at)
      VALUES ${values}
      ON CONFLICT (symbol, interval, open_time, logic_version) DO UPDATE SET
        direction = EXCLUDED.direction,
        score = EXCLUDED.score,
        components = EXCLUDED.components,
        generated_at = EXCLUDED.generated_at
    `);
  }
}

export async function deleteSignalsFrom(
  db: PrismaClient,
  symbol: string,
  interval: string,
  openTime: bigint,
): Promise<void> {
  await db.signal.deleteMany({
    where: { symbol, interval, openTime: { gte: openTime } },
  });
}

export async function deleteIndicatorValuesFrom(
  db: PrismaClient,
  symbol: string,
  interval: string,
  openTime: bigint,
): Promise<void> {
  await db.indicatorValue.deleteMany({
    where: { symbol, interval, openTime: { gte: openTime } },
  });
}
