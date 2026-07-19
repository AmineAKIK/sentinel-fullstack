export const DIGITS_ONLY_PATTERN = /^[0-9]+$/;

export function isDigitsOnly(value: string): boolean {
  return DIGITS_ONLY_PATTERN.test(value);
}
