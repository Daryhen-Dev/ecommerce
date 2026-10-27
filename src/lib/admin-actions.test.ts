// Unit tests for the shared admin Server Action helpers: the action-result
// shape, multi-field collection with merged field errors, and the login
// redirect used when a Server Action runs without a valid session.
//
// `admin-actions` is `server-only` and imports `next/headers` /
// `next/navigation`, so the tests stub those modules: the modules under test
// are the pure helpers, and Next's `cookies()` is never exercised here (the
// cookie accessor takes an injected cookie store instead).

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import {
  adminLoginRedirectPath,
  collectFields,
  formErrorResult,
  type ActionResult,
  type FieldErrors,
} from "./admin-actions";
import type { ParseResult } from "./admin-fields";

/** Parser double: accepts exactly one value, fails every other input. */
function literal(value: string): (raw: string) => ParseResult<string> {
  return (raw) =>
    raw === value ? { ok: true, value } : { ok: false, error: `expected ${value}` };
}

/** Parser double: uppercases the raw value (always succeeds). */
function upper(raw: string): ParseResult<string> {
  return { ok: true, value: raw.toUpperCase() };
}

describe("collectFields", () => {
  it("returns every parsed value keyed by field name", () => {
    const result = collectFields(
      { name: "Pargo", code: "open" },
      { name: literal("Pargo"), code: upper },
    );

    expect(result).toEqual({ ok: true, values: { name: "Pargo", code: "OPEN" } });
  });

  it("merges the errors of every failing field instead of stopping at the first", () => {
    const result = collectFields(
      { name: "Atún", code: "bad", note: "" },
      { name: literal("Pargo"), code: literal("open"), note: literal("x") },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.fieldErrors).toEqual({
      name: "expected Pargo",
      code: "expected open",
      note: "expected x",
    });
  });

  it("reports only the offending fields when the rest parse", () => {
    const result = collectFields(
      { name: "Pargo", total: "abc" },
      { name: literal("Pargo"), total: (raw): ParseResult<string> => ({ ok: false, error: `bad ${raw}` }) },
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.fieldErrors).toEqual({ total: "bad abc" });
    expect(Object.keys(result.fieldErrors)).toHaveLength(1);
  });

  it("ignores submitted entries that have no parser", () => {
    const result = collectFields(
      { name: "Pargo", csrf: "abc", extra: "ignored" },
      { name: literal("Pargo") },
    );

    expect(result).toEqual({ ok: true, values: { name: "Pargo" } });
  });

  it("treats a missing entry as an empty string so required parsers fail", () => {
    const result = collectFields(
      { name: undefined },
      {
        name: (raw) =>
          raw === "" ? { ok: false, error: "El nombre es obligatorio." } : { ok: true, value: raw },
      },
    );

    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: "El nombre es obligatorio." },
    });
  });

  it("treats a non-text entry (a file) as an empty string", () => {
    const file = new File(["x"], "photo.png", { type: "image/png" });
    const result = collectFields(
      { name: file },
      { name: (raw): ParseResult<string> => (raw === "" ? { ok: false, error: "vacío" } : { ok: true, value: raw }) },
    );

    expect(result).toEqual({ ok: false, fieldErrors: { name: "vacío" } });
  });

  it("returns an empty values object when no parsers are given", () => {
    expect(collectFields({ anything: "value" }, {})).toEqual({ ok: true, values: {} });
  });
});

describe("formErrorResult", () => {
  it("builds a failure with a form-level message and no field errors", () => {
    expect(formErrorResult("Ese slug ya existe.")).toEqual({
      ok: false,
      fieldErrors: {},
      formError: "Ese slug ya existe.",
    });
  });

  it("is assignable to any typed action result", () => {
    const result: ActionResult<{ id: string }> = formErrorResult("Ese slug ya existe.");
    expect(result.ok).toBe(false);
  });

  it("keeps field errors as a plain record of messages", () => {
    const fieldErrors: FieldErrors = { total: "El total mínimo es 7.5 kg" };
    const result: ActionResult<number> = { ok: false, fieldErrors };
    expect(result).toEqual({ ok: false, fieldErrors: { total: "El total mínimo es 7.5 kg" } });
  });
});

describe("adminLoginRedirectPath", () => {
  it("keeps the admin path and query of the referring page", () => {
    expect(adminLoginRedirectPath("http://localhost:3000/admin/lotes?page=2")).toBe(
      "/admin/lotes?page=2",
    );
    expect(adminLoginRedirectPath("http://localhost:3000/admin")).toBe("/admin");
    expect(adminLoginRedirectPath("http://localhost:3000/admin/especies/pargo")).toBe(
      "/admin/especies/pargo",
    );
  });

  it("falls back to the dashboard for missing, unparsable or non-admin referers", () => {
    for (const referer of [
      null,
      undefined,
      "",
      "not a url",
      "http://localhost:3000/",
      "http://localhost:3000/uio",
      "http://localhost:3000//admin",
    ]) {
      expect(adminLoginRedirectPath(referer)).toBe("/admin");
    }
  });
});
