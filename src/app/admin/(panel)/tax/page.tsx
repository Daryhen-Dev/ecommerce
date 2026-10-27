// VAT (IVA) section of the panel (S2, S3, S7): the rate in force for each
// category with its date, the rate scheduled for the future (clearly labelled
// as not applying yet) and the full append-only history, plus the form that
// appends a rate change.
//
// The page is a Server Component and reads the current instant once: the same
// `at` decides the in-force rate (through `resolveVatRates`, S4) and the status
// of every history row. Dynamic on purpose: the panel always reads the current
// operation state.
//
// Nothing here can edit or delete a rate: the history is rendered read-only and
// the Server Action only appends.

import type { Metadata } from "next";
import Link from "next/link";

import { registerTaxRate } from "@/app/admin/(panel)/tax/actions";
import AdminCard from "@/components/admin/AdminCard";
import TaxRateForm from "@/components/admin/TaxRateForm";
import { formatEcuadorDateTime, formatPercentFromBps } from "@/lib/format";
import {
  NO_RATE_IN_FORCE_MESSAGE,
  RATE_SCHEDULED_NOTICE,
  summarizeTaxRates,
  taxRateStatus,
  taxRateStatusLabel,
  type TaxRateHistoryEntry,
  type TaxRateStatus,
} from "@/lib/admin-tax";
import { listTaxRatesForAdmin } from "@/server/admin-tax";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "IVA | Pesca Artesanal Galápagos",
};

type TaxPageProps = {
  searchParams: Promise<{ created?: string }>;
};

/**
 * Percentage text of one stored rate. A corrupted row (outside 0..100 %) is
 * reported as invalid instead of crashing the history: the panel must still
 * show what the table holds.
 */
function rateLabel(rateBps: number): string {
  if (!Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > 10000) {
    return "inválida";
  }
  return formatPercentFromBps(rateBps);
}

/** Text badge: the status is always written, never colour-only. */
function RateStatusBadge({ status }: { status: TaxRateStatus }) {
  const label = taxRateStatusLabel(status);
  const tone =
    status === "IN_FORCE"
      ? "border-green-700 bg-green-100 text-green-950"
      : status === "SCHEDULED"
        ? "border-blue-700 bg-blue-100 text-blue-950"
        : "border-neutral-500 bg-neutral-100 text-neutral-800";
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

export default async function AdminTaxPage({ searchParams }: TaxPageProps) {
  const { created } = await searchParams;

  const at = new Date();
  const rates = await listTaxRatesForAdmin();
  const summary = summarizeTaxRates({ rates, at });
  const inForceFromByCategory = new Map(
    summary.map((row) => [row.category, row.inForce?.effectiveFrom ?? null] as const),
  );
  const hasScheduled = summary.some((row) => row.scheduled !== null);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">IVA</h1>
        <Link href="/admin" className="font-medium underline underline-offset-4">
          Panel
        </Link>
      </div>
      <p className="mt-3 max-w-2xl text-neutral-700">
        El IVA que cobra la tienda sale de esta tabla. Un cambio de tarifa es una
        fila nueva con la fecha desde la que se aplica: el historial no se edita
        ni se borra, y los pedidos ya hechos conservan el IVA con el que se
        cobraron.
      </p>

      <p role="status" aria-live="polite" className="mt-4 text-sm font-medium text-green-800">
        {created === "1" ? "Tarifa registrada." : ""}
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <AdminCard title="Tarifa vigente">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Tarifa de IVA vigente por categoría, con la fecha desde la que se
                aplica y la próxima tarifa programada.
              </caption>
              <thead>
                <tr className="border-b border-neutral-300">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Categoría
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    IVA vigente
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Vigente desde
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Tarifa programada
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.category} className="border-b border-neutral-200 align-top">
                    <td className="py-3 pr-3 font-medium">{row.label}</td>
                    <td className="py-3 pr-3">
                      {row.inForce === null ? (
                        <span className="text-red-800">
                          {row.formError ?? NO_RATE_IN_FORCE_MESSAGE}
                        </span>
                      ) : (
                        <span className="font-medium">
                          {rateLabel(row.inForce.rateBps)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      {row.inForce === null
                        ? "—"
                        : formatEcuadorDateTime(row.inForce.effectiveFrom)}
                    </td>
                    <td className="py-3">
                      {row.scheduled === null ? (
                        <span className="text-neutral-500">—</span>
                      ) : (
                        <>
                          <RateStatusBadge status="SCHEDULED" />
                          <span className="mt-1 block font-medium">
                            {rateLabel(row.scheduled.rateBps)}
                          </span>
                          <span className="block text-xs text-neutral-600">
                            desde {formatEcuadorDateTime(row.scheduled.effectiveFrom)}
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasScheduled ? (
            <p className="mt-4 text-sm text-neutral-700">{RATE_SCHEDULED_NOTICE}</p>
          ) : null}
        </AdminCard>

        <AdminCard title="Historial de tarifas">
          {rates.length === 0 ? (
            <p className="text-neutral-700">
              Todavía no hay tarifas registradas. La tienda no puede cotizar IVA
              sin una tarifa vigente por categoría.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Historial completo de tarifas de IVA, por categoría y de la más
                  reciente a la más antigua.
                </caption>
                <thead>
                  <tr className="border-b border-neutral-300">
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Categoría
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Tarifa
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Vigente desde
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Estado
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      Nota
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((rate) => {
                    const entry: TaxRateHistoryEntry = {
                      category: rate.category,
                      rateBps: rate.rateBps,
                      effectiveFrom: rate.effectiveFrom,
                    };
                    const status = taxRateStatus({
                      rate: entry,
                      at,
                      inForceEffectiveFrom: inForceFromByCategory.get(rate.category) ?? null,
                    });
                    const categoryLabel =
                      summary.find((row) => row.category === rate.category)?.label ??
                      rate.category;
                    return (
                      <tr key={rate.id} className="border-b border-neutral-200 align-top">
                        <td className="py-3 pr-3">{categoryLabel}</td>
                        <td className="py-3 pr-3 font-medium">{rateLabel(rate.rateBps)}</td>
                        <td className="py-3 pr-3">
                          {formatEcuadorDateTime(rate.effectiveFrom)}
                        </td>
                        <td className="py-3 pr-3">
                          <RateStatusBadge status={status} />
                        </td>
                        <td className="py-3 text-neutral-700">{rate.note ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-sm text-neutral-600">
            Las tarifas no se editan ni se borran: si hay que corregir el IVA, se
            registra una tarifa nueva desde la fecha de la corrección.
          </p>
        </AdminCard>

        <AdminCard title="Registrar cambio de tarifa">
          <TaxRateForm action={registerTaxRate} />
        </AdminCard>
      </div>
    </div>
  );
}
