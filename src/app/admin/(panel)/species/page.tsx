// Species (especies) list for the panel (A5): every species with the
// configuration the cooperative edits — price, minimum, step, discount policy,
// VAT category and season — plus the edit link and the create button.
//
// Dynamic on purpose: the panel always reads the current operation state.

import type { Metadata } from "next";
import Link from "next/link";

import AdminCard from "@/components/admin/AdminCard";
import { inlineButtonClass } from "@/components/admin/form-styles";
import {
  discountPolicyLabel,
  seasonalWithoutSeasonMessage,
  vatCategoryLabel,
} from "@/lib/admin-species";
import { formatWeightLabel } from "@/lib/admin-lots";
import { cents, formatUsd } from "@/domain/money";
import { listSpeciesForAdmin } from "@/server/admin-species";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Especies | Pesca Artesanal Galápagos",
};

type SpeciesPageProps = {
  searchParams: Promise<{ saved?: string }>;
};

export default async function AdminSpeciesPage({ searchParams }: SpeciesPageProps) {
  const { saved } = await searchParams;
  const species = await listSpeciesForAdmin();

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">Especies</h1>
        <Link href="/admin" className="font-medium underline underline-offset-4">
          Panel
        </Link>
      </div>
      <p className="mt-3 max-w-2xl text-neutral-700">
        El precio por kilo y los tramos de descuento son los que la tienda cobra
        en el siguiente pedido. Cambiar un precio no cambia los pedidos ya
        hechos: cada uno guarda el precio con el que se pagó.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <p role="status" aria-live="polite" className="text-sm font-medium text-green-800">
          {saved === "1" ? "Cambios guardados." : ""}
        </p>
        <Link
          href="/admin/species/new"
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Nueva especie
        </Link>
      </div>

      <div className="mt-6">
        <AdminCard>
          {species.length === 0 ? (
            <p className="text-neutral-700">
              Todavía no hay especies. Crea la primera para empezar a vender.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Especies configuradas, en orden alfabético.
                </caption>
                <thead>
                  <tr className="border-b border-neutral-300">
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Especie
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Precio por kilo
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Pedido mínimo
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Paso
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Descuento
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      IVA
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Temporada
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {species.map((row) => {
                    const seasonWarning = seasonalWithoutSeasonMessage({
                      isSeasonal: row.isSeasonal,
                      seasonCount: row.seasonCount,
                    });
                    return (
                      <tr key={row.id} className="border-b border-neutral-200 align-top">
                        <td className="py-3 pr-3">
                          <span className="font-medium">{row.name}</span>
                          <span className="block text-xs text-neutral-600">
                            {row.slug}
                          </span>
                          {row.active ? null : (
                            <span className="mt-1 inline-block rounded border border-neutral-500 bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-800">
                              Inactiva
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          {formatUsd(cents(row.pricePerKgCents))}
                        </td>
                        <td className="py-3 pr-3">
                          {formatWeightLabel(row.minOrderGrams)}
                        </td>
                        <td className="py-3 pr-3">
                          {formatWeightLabel(row.orderStepGrams)}
                        </td>
                        <td className="py-3 pr-3">
                          {discountPolicyLabel(row.discountPolicy)}
                        </td>
                        <td className="py-3 pr-3">{vatCategoryLabel(row.vatCategory)}</td>
                        <td className="py-3 pr-3">
                          {row.isSeasonal ? (
                            <>
                              <span className="font-medium">Sí</span>
                              <span className="block text-xs text-neutral-600">
                                {row.seasonCount === 1
                                  ? "1 temporada"
                                  : `${row.seasonCount} temporadas`}
                              </span>
                              {seasonWarning === null ? null : (
                                <span className="mt-1 block text-xs font-medium text-red-800">
                                  Sin temporada: no se vende
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-neutral-700">No</span>
                          )}
                        </td>
                        <td className="py-3">
                          <Link
                            href={`/admin/species/${row.slug}`}
                            className={inlineButtonClass + " inline-block"}
                          >
                            Editar
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>

      <p className="mt-4 text-sm text-neutral-600">
        Las especies no se borran: los pedidos las referencian. Una especie de
        temporada sin temporada registrada no se ofrece en la tienda.
      </p>
    </div>
  );
}
