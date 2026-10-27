// Season availability: pre-sale of seasonal species only inside the season
// window (preventa dentro de la temporada). Pure domain: no framework,
// database, I/O or clock access; the instant is a parameter; inputs are
// never mutated.

export interface SeasonWindow {
  startsAt: Date;
  endsAt: Date;
}

export type SeasonErrorCode = "INVALID_SEASON_WINDOW" | "INVALID_INSTANT";

export class SeasonError extends Error {
  readonly code: SeasonErrorCode;

  constructor(code: SeasonErrorCode, message: string) {
    super(message);
    this.name = "SeasonError";
    this.code = code;
  }
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** Validates one window in place-free fashion; boundaries may be equal (a zero-length window covers only its start). */
function validateWindow(raw: unknown, where: string): SeasonWindow {
  if (typeof raw !== "object" || raw === null) {
    throw new SeasonError("INVALID_SEASON_WINDOW", `${where}: malformed season window`);
  }
  const window = raw as SeasonWindow;
  if (!isValidDate(window.startsAt) || !isValidDate(window.endsAt)) {
    throw new SeasonError("INVALID_SEASON_WINDOW", `${where}: startsAt and endsAt must be valid Dates`);
  }
  if (window.endsAt.getTime() < window.startsAt.getTime()) {
    throw new SeasonError("INVALID_SEASON_WINDOW", `${where}: endsAt (${window.endsAt.toISOString()}) must not be earlier than startsAt (${window.startsAt.toISOString()})`);
  }
  return window;
}

function validateSeasonList(seasons: unknown): void {
  if (!Array.isArray(seasons)) {
    throw new SeasonError("INVALID_SEASON_WINDOW", "seasons must be an array");
  }
  seasons.forEach((window, index) => validateWindow(window, `seasons[${index}]`));
}

/**
 * True when the species can be ordered at `at`. Non-seasonal species are
 * always available; seasonal species are available exactly while a window
 * covers the instant (`startsAt <= at <= endsAt`, inclusive both ends).
 * Overlapping windows are allowed: any covering window makes it available.
 * Duplicate identical windows are accepted and harmless (no dedupe: the
 * selection is deterministic without one).
 */
export function isSpeciesAvailable(
  input: { isSeasonal: boolean; seasons: SeasonWindow[] },
  at: Date,
): boolean {
  if (!isValidDate(at)) {
    throw new SeasonError("INVALID_INSTANT", `at must be a valid Date, got ${String(at)}`);
  }
  if (!input.isSeasonal) {
    return true;
  }
  return findCurrentSeason(input.seasons, at) !== null;
}

/**
 * The window covering `at` (`startsAt <= at <= endsAt`), or null when
 * outside every window. When several windows cover the instant, returns
 * the one with the LATEST `startsAt` (the innermost/most specific window;
 * ties resolve to the first in input order). The returned window is one of
 * the input objects, never a copy.
 */
export function findCurrentSeason(seasons: SeasonWindow[], at: Date): SeasonWindow | null {
  if (!isValidDate(at)) {
    throw new SeasonError("INVALID_INSTANT", `at must be a valid Date, got ${String(at)}`);
  }
  validateSeasonList(seasons);
  const instant = at.getTime();
  let current: SeasonWindow | null = null;
  for (const window of seasons) {
    const covers = window.startsAt.getTime() <= instant && instant <= window.endsAt.getTime();
    if (covers && (current === null || window.startsAt.getTime() > current.startsAt.getTime())) {
      current = window;
    }
  }
  return current;
}

/**
 * The earliest `startsAt` strictly after `at` (for a storefront "vuelve el
 * ..."), or null when no window starts later.
 */
export function nextSeasonStart(seasons: SeasonWindow[], at: Date): Date | null {
  if (!isValidDate(at)) {
    throw new SeasonError("INVALID_INSTANT", `at must be a valid Date, got ${String(at)}`);
  }
  validateSeasonList(seasons);
  const instant = at.getTime();
  let earliest: Date | null = null;
  for (const window of seasons) {
    const start = window.startsAt.getTime();
    if (start > instant && (earliest === null || start < earliest.getTime())) {
      earliest = window.startsAt;
    }
  }
  return earliest;
}
