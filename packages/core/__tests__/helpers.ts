import { Decimal } from "../src/decimal.ts";

export function convertToDecimals(values: string[]): Decimal[] {
  return values.map((value) => new Decimal(value));
}

export function buildFixtureCloses(count: number): Decimal[] {
  const closes: Decimal[] = [];
  let price = new Decimal("100");
  for (let index = 0; index < count; index += 1) {
    const step = new Decimal(((index * 7) % 13) - 6).times("0.37");
    price = price.plus(step);
    closes.push(price);
  }
  return closes;
}
