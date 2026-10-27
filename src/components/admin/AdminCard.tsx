// Bordered section wrapper shared by the admin pages (same white card and
// neutral border the dashboard placeholders use). Optional title renders as
// the section heading, so a page reads as one heading per card.

import type { ReactNode } from "react";

export default function AdminCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
      <div className={title ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}
