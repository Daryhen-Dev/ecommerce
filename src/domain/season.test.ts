// Pure season-availability rules: pre-sale of seasonal species only inside
// the season window. No clock access (the instant is a parameter); inputs
// are never mutated.

import { describe, it, expect } from "vitest";
import {
  isSpeciesAvailable,
  findCurrentSeason,
  nextSeasonStart,
  SeasonError,
  type SeasonWindow,
} from "./season";

// Lobster season: 2025-08-01 .. 2025-11-30 (Ecuador time, UTC-5).
const LOBSTER: SeasonWindow = {
  startsAt: new Date("2025-08-01T00:00:00-05:00"),
  endsAt: new Date("2025-11-30T00:00:00-05:00"),
};

// Second window overlapping the first: 2025-09-10 .. 2025-09-20.
const EARLY_OVERLAP: SeasonWindow = {
  startsAt: new Date("2025-09-10T00:00:00-05:00"),
  endsAt: new Date("2025-09-20T00:00:00-05:00"),
};

// A later season, for nextSeasonStart.
const NEXT_SEASON: SeasonWindow = {
  startsAt: new Date("2026-08-01T00:00:00-05:00"),
  endsAt: new Date("2026-11-30T00:00:00-05:00"),
};

const snapshotOf = (windows: SeasonWindow[]): number[] => windows.map((w) => w.startsAt.getTime() * 31 + w.endsAt.getTime());

describe("isSpeciesAvailable", () => {
  it("is available at any instant when the species is not seasonal", () => {
    const input = { isSeasonal: false, seasons: [LOBSTER] };
    expect(isSpeciesAvailable(input, new Date("2025-01-01T12:00:00-05:00"))).toBe(true);
    expect(isSpeciesAvailable(input, new Date("2025-09-15T12:00:00-05:00"))).toBe(true);
    expect(isSpeciesAvailable(input, new Date("2026-05-01T12:00:00-05:00"))).toBe(true);
  });

  it("is available for a non-seasonal species with an empty seasons list", () => {
    expect(isSpeciesAvailable({ isSeasonal: false, seasons: [] }, new Date("2025-09-15T12:00:00-05:00"))).toBe(true);
  });

  it("is available inside the season window", () => {
    const input = { isSeasonal: true, seasons: [LOBSTER] };
    expect(isSpeciesAvailable(input, new Date("2025-09-15T12:00:00-05:00"))).toBe(true);
  });

  it("is available exactly at both boundary instants (inclusive)", () => {
    const input = { isSeasonal: true, seasons: [LOBSTER] };
    expect(isSpeciesAvailable(input, new Date("2025-08-01T00:00:00-05:00"))).toBe(true);
    expect(isSpeciesAvailable(input, new Date("2025-11-30T00:00:00-05:00"))).toBe(true);
  });

  it("is unavailable 1 ms before the window starts and 1 ms after it ends", () => {
    const input = { isSeasonal: true, seasons: [LOBSTER] };
    expect(isSpeciesAvailable(input, new Date(LOBSTER.startsAt.getTime() - 1))).toBe(false);
    expect(isSpeciesAvailable(input, new Date(LOBSTER.endsAt.getTime() + 1))).toBe(false);
  });

  it("is available when any overlapping window covers the instant", () => {
    const input = { isSeasonal: true, seasons: [LOBSTER, EARLY_OVERLAP] };
    expect(isSpeciesAvailable(input, new Date("2025-09-15T12:00:00-05:00"))).toBe(true);
  });

  it("is unavailable for a seasonal species outside every window", () => {
    const input = { isSeasonal: true, seasons: [LOBSTER] };
    expect(isSpeciesAvailable(input, new Date("2025-07-31T23:59:59-05:00"))).toBe(false);
    expect(isSpeciesAvailable(input, new Date("2025-12-01T00:00:00-05:00"))).toBe(false);
  });

  it("is unavailable for a seasonal species with an empty seasons list", () => {
    expect(isSpeciesAvailable({ isSeasonal: true, seasons: [] }, new Date("2025-09-15T12:00:00-05:00"))).toBe(false);
  });
});

describe("findCurrentSeason", () => {
  it("returns the covering window", () => {
    const result = findCurrentSeason([LOBSTER], new Date("2025-09-15T12:00:00-05:00"));
    expect(result).toBe(LOBSTER);
  });

  it("returns null outside every window", () => {
    expect(findCurrentSeason([LOBSTER], new Date("2025-07-15T12:00:00-05:00"))).toBeNull();
    expect(findCurrentSeason([LOBSTER], new Date("2025-12-15T12:00:00-05:00"))).toBeNull();
  });

  it("returns the latest-starting window when several cover the instant", () => {
    const result = findCurrentSeason([LOBSTER, EARLY_OVERLAP], new Date("2025-09-15T12:00:00-05:00"));
    expect(result).toBe(EARLY_OVERLAP);
  });

  it("returns the only covering window when the later one has not started yet", () => {
    const result = findCurrentSeason([LOBSTER, EARLY_OVERLAP], new Date("2025-09-05T12:00:00-05:00"));
    expect(result).toBe(LOBSTER);
  });

  it("accepts duplicate identical windows without failing", () => {
    const duplicate: SeasonWindow = { startsAt: new Date(LOBSTER.startsAt.getTime()), endsAt: new Date(LOBSTER.endsAt.getTime()) };
    const result = findCurrentSeason([LOBSTER, duplicate], new Date("2025-09-15T12:00:00-05:00"));
    expect([LOBSTER, duplicate]).toContain(result);
  });

  it("rejects a window with endsAt before startsAt", () => {
    const inverted: SeasonWindow = {
      startsAt: new Date("2025-09-20T00:00:00-05:00"),
      endsAt: new Date("2025-09-10T00:00:00-05:00"),
    };
    expect(() => findCurrentSeason([LOBSTER, inverted], new Date("2025-09-15T12:00:00-05:00")))
      .toThrow(expect.objectContaining({ name: "SeasonError", code: "INVALID_SEASON_WINDOW" }));
  });

  it("rejects a non-array seasons argument", () => {
    expect(() => findCurrentSeason(LOBSTER as unknown as SeasonWindow[], new Date("2025-09-15T12:00:00-05:00")))
      .toThrow(expect.objectContaining({ code: "INVALID_SEASON_WINDOW" }));
  });

  it("rejects an invalid instant", () => {
    expect(() => findCurrentSeason([LOBSTER], new Date("not-a-date")))
      .toThrow(expect.objectContaining({ code: "INVALID_INSTANT" }));
  });
});

describe("nextSeasonStart", () => {
  it("returns the earliest start strictly after the instant", () => {
    const result = nextSeasonStart([LOBSTER, NEXT_SEASON], new Date("2025-07-01T12:00:00-05:00"));
    expect(result).toEqual(new Date("2025-08-01T00:00:00-05:00"));
  });

  it("skips the window that already covers the instant (strictly after)", () => {
    const result = nextSeasonStart([LOBSTER, NEXT_SEASON], new Date("2025-09-15T12:00:00-05:00"));
    expect(result).toEqual(new Date("2026-08-01T00:00:00-05:00"));
  });

  it("treats a start exactly at the instant as not upcoming", () => {
    const result = nextSeasonStart([LOBSTER, NEXT_SEASON], new Date("2025-08-01T00:00:00-05:00"));
    expect(result).toEqual(new Date("2026-08-01T00:00:00-05:00"));
  });

  it("returns null when no window starts after the instant", () => {
    expect(nextSeasonStart([LOBSTER], new Date("2026-01-01T00:00:00-05:00"))).toBeNull();
    expect(nextSeasonStart([], new Date("2025-07-01T12:00:00-05:00"))).toBeNull();
  });

  it("rejects a window with endsAt before startsAt", () => {
    const inverted: SeasonWindow = {
      startsAt: new Date("2025-09-20T00:00:00-05:00"),
      endsAt: new Date("2025-09-10T00:00:00-05:00"),
    };
    expect(() => nextSeasonStart([inverted], new Date("2025-09-15T12:00:00-05:00")))
      .toThrow(expect.objectContaining({ code: "INVALID_SEASON_WINDOW" }));
  });

  it("rejects an invalid instant", () => {
    expect(() => nextSeasonStart([LOBSTER], new Date("not-a-date")))
      .toThrow(expect.objectContaining({ code: "INVALID_INSTANT" }));
  });
});

describe("isSpeciesAvailable input validation", () => {
  it("rejects an invalid window even when the species is seasonal", () => {
    const inverted: SeasonWindow = {
      startsAt: new Date("2025-09-20T00:00:00-05:00"),
      endsAt: new Date("2025-09-10T00:00:00-05:00"),
    };
    expect(() => isSpeciesAvailable({ isSeasonal: true, seasons: [inverted] }, new Date("2025-09-15T12:00:00-05:00")))
      .toThrow(expect.objectContaining({ code: "INVALID_SEASON_WINDOW" }));
  });

  it("rejects an invalid instant", () => {
    expect(() => isSpeciesAvailable({ isSeasonal: true, seasons: [LOBSTER] }, new Date("nope")))
      .toThrow(expect.objectContaining({ code: "INVALID_INSTANT" }));
  });
});

describe("input immutability", () => {
  it("never mutates the seasons array or its windows", () => {
    const seasons: SeasonWindow[] = [LOBSTER, EARLY_OVERLAP];
    const before = snapshotOf(seasons);
    isSpeciesAvailable({ isSeasonal: true, seasons }, new Date("2025-09-15T12:00:00-05:00"));
    findCurrentSeason(seasons, new Date("2025-09-15T12:00:00-05:00"));
    nextSeasonStart(seasons, new Date("2025-09-15T12:00:00-05:00"));
    expect(snapshotOf(seasons)).toEqual(before);
    expect(seasons).toHaveLength(2);
  });
});

describe("SeasonError", () => {
  it("carries a stable machine-readable code", () => {
    const error = new SeasonError("INVALID_SEASON_WINDOW", "test message");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("INVALID_SEASON_WINDOW");
    expect(error.message).toBe("test message");
  });
});
