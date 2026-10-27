// Shared Tailwind classes for the admin form controls. Kept in one place so
// every panel form renders the same control height, border and focus ring
// (the focus ring is the visible keyboard affordance axe checks).

/** Text input, select and datetime-local control. */
export const inputClass =
  "w-full rounded-md border border-neutral-400 bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

/** One label + control + error group. */
export const fieldGroupClass = "flex flex-col gap-1";

/** Field label. */
export const labelClass = "text-sm font-medium";

/** Helper text under a control. */
export const hintClass = "text-xs text-neutral-600";

/** Primary submit button. */
export const submitButtonClass =
  "w-fit rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

/** Secondary/inline button (close a lot, filter a list). */
export const inlineButtonClass =
  "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
