/**
 * RGS Ledger Financial Minor Unit (Paise) Precision Utilities
 * Strict integer arithmetic prevents IEEE-754 floating point inaccuracies.
 */

export interface CurrencyConfig {
  code: string;
  minorUnitFactor: number; // 100 for INR (1 Rupee = 100 Paise)
  symbol: string;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyConfig> = {
  INR: { code: 'INR', minorUnitFactor: 100, symbol: '₹' },
  USD: { code: 'USD', minorUnitFactor: 100, symbol: '$' },
  EUR: { code: 'EUR', minorUnitFactor: 100, symbol: '€' }
};

/**
 * Converts decimal amount (e.g. 150.75) to integer minor units (15075 paise)
 */
export function toMinorUnit(amount: number | string, currency: string = 'INR'): number {
  const config = SUPPORTED_CURRENCIES[currency.toUpperCase()] || SUPPORTED_CURRENCIES.INR;
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) {
    throw new Error(`Invalid numeric amount: ${amount}`);
  }
  // Math.round after multiplying to avoid floating point representation quirks
  return Math.round(num * config.minorUnitFactor);
}

/**
 * Converts minor unit integer (paise) to human readable decimal string ("150.75")
 */
export function toMajorUnitString(minorAmount: number, currency: string = 'INR'): string {
  if (!Number.isInteger(minorAmount)) {
    minorAmount = Math.round(minorAmount);
  }
  const config = SUPPORTED_CURRENCIES[currency.toUpperCase()] || SUPPORTED_CURRENCIES.INR;
  const major = minorAmount / config.minorUnitFactor;
  return major.toFixed(2);
}

/**
 * Formats minor units into Indian Rupee locale display (e.g. "₹1,25,000.50")
 */
export function formatCurrency(minorAmount: number, currency: string = 'INR'): string {
  if (!Number.isInteger(minorAmount)) {
    minorAmount = Math.round(minorAmount);
  }
  const config = SUPPORTED_CURRENCIES[currency.toUpperCase()] || SUPPORTED_CURRENCIES.INR;
  const major = minorAmount / config.minorUnitFactor;
  
  if (currency.toUpperCase() === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(major);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(major);
}

/**
 * Safe integer additions, subtractions and percentage calculations for ledger
 */
export function addMinorUnits(...amounts: number[]): number {
  return amounts.reduce((sum, curr) => {
    if (!Number.isInteger(curr)) {
      throw new Error(`Non-integer minor amount encountered in financial addition: ${curr}`);
    }
    return sum + curr;
  }, 0);
}

export function subtractMinorUnits(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    throw new Error(`Non-integer minor amount encountered in financial subtraction: ${a}, ${b}`);
  }
  return a - b;
}

/**
 * Calculates basis points fee (e.g. 200 bps = 2.00%) strictly as integer paise
 */
export function calculateBasisPoints(amountMinor: number, basisPoints: number): number {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Non-integer amount: ${amountMinor}`);
  }
  // (Amount * bps) / 10,000 with integer rounding
  return Math.round((amountMinor * basisPoints) / 10000);
}
