import { Decimal as DecimalBase } from "decimal.js";

export const DECIMAL_PLACES = 10;

const PRECISION = 40;

export const Decimal = DecimalBase.clone({
  precision: PRECISION,
  rounding: DecimalBase.ROUND_HALF_UP,
});

export type Decimal = InstanceType<typeof Decimal>;

export function roundDecimal(value: Decimal): Decimal {
  return value.toDecimalPlaces(DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
}

export function convertToDecimal(value: string | null): Decimal | null {
  return value === null ? null : new Decimal(value);
}
