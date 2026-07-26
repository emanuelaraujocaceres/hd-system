/**
 * Parse a Brazilian-formatted currency string to a number.
 * "R$ 1.234,56" → 1234.56
 */
export function parseCurrencyBR(value: string): number {
  if (!value) return 0;
  // Remove "R$ ", dots (thousands), replace comma with dot
  const cleaned = value
    .replace(/^R?\$?\s*/, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Format a number to Brazilian currency string.
 * 1234.56 → "R$ 1.234,56"
 */
export function formatCurrencyBR(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Format a number to a raw Brazilian numeral (no R$ prefix).
 * 1234.56 → "1.234,56"
 */
export function formatNumberBR(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Mask a raw digit string into Brazilian currency as the user types.
 * "123456" → "1.234,56"
 */
export function currencyMask(value: string): string {
  // Remove everything except digits
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return '';

  // Pad to at least 3 digits (cents)
  const padded = digits.padStart(3, '0');
  const integerPart = padded.slice(0, -2);
  const cents = padded.slice(-2);

  // Add thousands separators
  const intWithSep = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${intWithSep},${cents}`;
}

/**
 * Convert a currency-masked string back to a number.
 * "1.234,56" → 1234.56
 */
export function maskToNumber(masked: string): number {
  return parseCurrencyBR(masked);
}
