// Presentation formatters for the storefront. Pure functions, no data
// access: dates are rendered in mainland Ecuador time (America/Guayaquil,
// UTC-5, no DST) because customers pick up their orders at UIO/GYE/CUE, and
// percentages come from integer basis points (owner number standard: "."
// decimal, no trailing zeros).

const ECUADOR_TIME_ZONE = "America/Guayaquil";
const ECUADOR_LOCALE = "es-EC";

// ICU may insert non-breaking or narrow no-break spaces (e.g. before the
// time); we normalize them so tests and UI stay stable across runtimes.
const SPACES_PATTERN = /[\u00a0\u202f]/g;

function partsOf(
  date: Date,
  options: Intl.DateTimeFormatOptions,
): Map<string, string> {
  // hourCycle "h23" forces a 00-23 clock (hour12: false can yield "24:00"
  // at midnight on some ICU versions).
  const formatter = new Intl.DateTimeFormat(ECUADOR_LOCALE, {
    timeZone: ECUADOR_TIME_ZONE,
    hourCycle: "h23",
    ...options,
  });
  const parts = new Map<string, string>();
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      parts.set(part.type, part.value.replace(SPACES_PATTERN, " "));
    }
  }
  return parts;
}

/**
 * Formats an instant as an Ecuador local date and 24h time in Spanish,
 * e.g. 2025-10-08T23:00Z -> "miércoles 8 de octubre, 18:00". Composed from
 * formatToParts (not the locale's full-format literal) so punctuation is
 * stable across ICU versions.
 */
export function formatEcuadorDateTime(date: Date): string {
  const parts = partsOf(date, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${parts.get("weekday")} ${parts.get("day")} de ${parts.get("month")}, ${parts.get("hour")}:${parts.get("minute")}`;
}

/**
 * Formats an instant as an Ecuador local day and month in Spanish, without
 * year or time, e.g. -> "15 de noviembre".
 */
export function formatEcuadorDate(date: Date): string {
  const parts = partsOf(date, { day: "numeric", month: "long" });
  return `${parts.get("day")} de ${parts.get("month")}`;
}

/**
 * Formats basis points as a percentage using integer arithmetic only:
 * 500 -> "5%", 250 -> "2.5%", 1225 -> "12.25%". Dot decimal separator and
 * no trailing zeros (owner number standard).
 */
export function formatPercentFromBps(bps: number): string {
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000) {
    throw new RangeError(
      `formatPercentFromBps: bps must be an integer in 0..10000, got ${String(bps)}`,
    );
  }
  const whole = Math.floor(bps / 100);
  const remainder = bps % 100;
  if (remainder === 0) {
    return `${whole}%`;
  }
  const fraction = String(remainder).padStart(2, "0").replace(/0+$/, "");
  return `${whole}.${fraction}%`;
}
