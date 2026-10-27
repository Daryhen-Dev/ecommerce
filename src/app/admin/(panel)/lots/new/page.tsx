// Create-landing page (A3). The species list, the default landing instant and
// the metadata are resolved on the server; the form itself is a Client
// Component so the action's per-field errors can be rendered.

import type { Metadata } from "next";
import Link from "next/link";

import { createLot } from "@/app/admin/(panel)/lots/new/actions";
import AdminCard from "@/components/admin/AdminCard";
import LotForm from "@/components/admin/LotForm";
import { toEcuadorDateTimeLocalValue } from "@/lib/admin-lots";
import { listSpeciesOptions } from "@/server/admin-lots";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nuevo desembarque | Pesca Artesanal Galápagos",
};

export default async function NewLotPage() {
  const species = await listSpeciesOptions();
  // "Now" in Ecuador wall-clock time, so the operator only adjusts it when the
  // landing happened earlier.
  const defaultLandedAt = toEcuadorDateTimeLocalValue(new Date());

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">Nuevo desembarque</h1>
        <Link href="/admin/lots" className="font-medium underline underline-offset-4">
          Volver a desembarques
        </Link>
      </div>
      <p className="mt-3 max-w-2xl text-neutral-700">
        Registra el lote que acaba de llegar. Empieza abierto y sin kilos
        reservados: los kilos reservados solo aumentan con pedidos pagados.
      </p>

      <div className="mt-8">
        <AdminCard>
          {species.length === 0 ? (
            <p className="text-neutral-700">
              No hay especies activas para registrar un desembarque.
            </p>
          ) : (
            <LotForm
              action={createLot}
              species={species}
              defaultLandedAt={defaultLandedAt}
            />
          )}
        </AdminCard>
      </div>
    </div>
  );
}
