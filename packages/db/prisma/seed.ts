import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const SYMBOLS = [
  {
    symbol: "BTCUSDT",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    onboardDate: new Date("2017-08-17T00:00:00.000Z"),
    isActive: true,
  },
  {
    symbol: "ETHUSDT",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    onboardDate: new Date("2017-08-17T00:00:00.000Z"),
    isActive: true,
  },
  {
    symbol: "XRPUSDT",
    baseAsset: "XRP",
    quoteAsset: "USDT",
    onboardDate: new Date("2018-05-04T00:00:00.000Z"),
    isActive: true,
  },
  {
    symbol: "BNBUSDT",
    baseAsset: "BNB",
    quoteAsset: "USDT",
    onboardDate: new Date("2017-11-06T00:00:00.000Z"),
    isActive: true,
  },
  {
    symbol: "SOLUSDT",
    baseAsset: "SOL",
    quoteAsset: "USDT",
    onboardDate: new Date("2020-08-11T00:00:00.000Z"),
    isActive: true,
  },
  {
    symbol: "DOGEUSDT",
    baseAsset: "DOGE",
    quoteAsset: "USDT",
    onboardDate: new Date("2019-07-05T00:00:00.000Z"),
    isActive: true,
  },
];

const connectionString = process.env.DIRECT_URL;
if (connectionString === undefined) {
  throw new Error("DIRECT_URL が設定されていません");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const { symbol, ...data } of SYMBOLS) {
    await prisma.symbol.upsert({
      where: { symbol },
      update: data,
      create: { symbol, ...data },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
