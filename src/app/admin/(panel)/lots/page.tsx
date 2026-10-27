// Landings (desembarques) list for the panel (A3): newest first, filterable
// by species, with a per-row "Cerrar" action for OPEN landings and the create
// button.
//
// Dynamic on purpose: the panel always reads the current operation state.

import type { Metadata } from "next";
import Link from "next/link";

import { closeLotAction } from "@/app/admin/(panel)/lots/actions";
import AdminCard from "@/components/admin/AdminCard";
import { inlineButtonClass, inputClass } from "@/components/admin/form-styles";
import { formatEcuadorDateTime } from "@/lib/format";
import { formatWeightLabel } from "@/lib/admin-lots";
import { listLotsForAdmin, listSpeciesOptions } from "@/server/admin-lots";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Desembarques | Pesca Artesanal Galápagos",
};

type LotsPageProps = {
  searchParams: Promise<{ species?: string; created?: string }>;
};

/** Text badge: the status is always written, never color-only. */
function LotStatusBadge({ status }: { status: "OPEN" | "CLOSED" }) {
  const open = status === "OPEN";
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${
        open
          ? "border-green-700 bg-green-100 text-green-950"
          : "border-neutral-500 bg-neutral-100 text-neutral-800"
      }`}
    >
      {open ? "Abierto" : "Cerrado"}
    </span>
  );
}

export default async function AdminLotsPage({ searchParams }: LotsPageProps) {
  const { species, created } = await searchParams;
  const filterSlug = typeof species === "string" && species !== "" ? species : undefined;

  const [speciesOptions, lots] = await Promise.all([
    listSpeciesOptions(),
    listLotsForAdmin(filterSlug),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">Desembarques</h1>
        <Link href="/admin" className="font-medium underline underline-offset-4">
          Panel
        </Link>
      </div>
      <p className="mt-3 max-w-2xl text-neutral-700">
        Cada desembarque es un lote de una especie. Mientras está abierto, sus
        kilos disponibles se venden en la tienda; al cerrarlo deja de venderse
        y conserva los kilos ya reservados.
      </p>

      <p role="status" aria-live="polite" className="mt-4 text-sm font-medium text-green-800">
        {created === "1" ? "Desembarque registrado." : ""}
      </p>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="species" className="text-sm font-medium">
              Filtrar por especie
            </label>
            <select
              id="species"
              name="species"
              defaultValue={filterSlug ?? ""}
              className={`${inputClass} w-56`}
            >
              <option value="">Todas las especies</option>
              {speciesOptions.map((option) => (
                <option key={option.id} value={option.slug}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={inlineButtonClass}>
            Filtrar
          </button>
          {filterSlug !== undefined && (
            <Link
              href="/admin/lots"
              className="text-sm font-medium underline underline-offset-4"
            >
              Ver todos
            </Link>
          )}
        </form>

        <Link
          href="/admin/lots/new"
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Registrar desembarque
        </Link>
      </div>

      <div className="mt-6">
        <AdminCard>
          {lots.length === 0 ? (
            <p className="text-neutral-700">
              No hay desembarques registrados con este filtro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Desembarques registrados, del más reciente al más antiguo.
                </caption>
                <thead>
                  <tr className="border-b border-neutral-300">
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Especie
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Desembarque
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Total
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Reservado
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Disponible
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Estado
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Comentario
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr key={lot.id} className="border-b border-neutral-200 align-top">
                      <td className="py-3 pr-3">{lot.speciesName}</td>
                      <td className="py-3 pr-3">{formatEcuadorDateTime(lot.landedAt)}</td>
                      <td className="py-3 pr-3">{formatWeightLabel(lot.totalGrams)}</td>
                      <td className="py-3 pr-3">{formatWeightLabel(lot.reservedGrams)}</td>
                      <td className="py-3 pr-3">{formatWeightLabel(lot.availableGrams)}</td>
                      <td className="py-3 pr-3">
                        <LotStatusBadge status={lot.status} />
                      </td>
                      <td className="py-3 pr-3 text-neutral-700">{lot.notes ?? "—"}</td>
                      <td className="py-3">
                        {lot.status === "OPEN" ? (
                          <form action={closeLotAction}>
                            <input type="hidden" name="id" value={lot.id} />
                            <button type="submit" className={inlineButtonClass}>
                              Cerrar
                            </button>
                          </form>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>

      <p className="mt-4 text-sm text-neutral-600">
        Se muestran los últimos 50 desembarques. Los kilos reservados solo
        cambian por pedidos: el panel no los edita.
      </p>
    </div>
  );
}
