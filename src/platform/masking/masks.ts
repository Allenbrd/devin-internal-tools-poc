const FULL_MASK = "********";

/** "****1234". Values too short to safely show 4 characters are fully masked. */
export function maskLast4(value: string): string {
  const clean = value.replace(/\s+/g, "");
  if (clean.length < 8) return FULL_MASK;
  return `****${clean.slice(-4)}`;
}

export const masks = {
  last4: maskLast4,
  iban: maskLast4,
  full: () => FULL_MASK,
} as const;

// Pattern-based safety net for values that slip through without field metadata.
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g;
const CARD_PATTERN = /\b\d(?:[ -]?\d){12,18}\b/g;

/** Mask anything in free text that looks like an IBAN or card number. */
export function scrubSensitivePatterns(text: string): string {
  return text.replace(IBAN_PATTERN, (m) => maskLast4(m)).replace(CARD_PATTERN, (m) => maskLast4(m.replace(/[ -]/g, "")));
}
