// Create-species page (A5). The metadata and the empty form state are resolved
// on the server; the form itself is a Client Component so the action's
// per-field errors can be rendered.
//
// The slug is asked for here and only here: after creation it is immutable,
// because the storefront URLs and the cart lines already point at it.

import type { Metadata } from "next";
import Link from "next/link";

import { createSpecies } from "@/app/admin/(panel)/species/new/actions";
import AdminCard from "@/components/admin/AdminCard";
import SpeciesForm from "@/components/admin/SpeciesForm";
import { EMPTY_SPECIES_CREATE_FORM_STATE } from "@/lib/admin-species";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nueva especie | Pesca Artesanal Galápagos",
};

export default function NewSpeciesPage() {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">Nueva especie</h1>
        <Link href="/admin/species" className="font-medium underline underline-offset-4">
          Volver a especies
        </Link>
      </div>
      <p className="mt-3 max-w-2xl text-neutral-700">
        La especie queda disponible en la tienda en cuanto tenga precio y al
        menos un desembarque abierto. Si es de temporada, agrega sus temporadas
        después de crearla.
      </p>

      <div className="mt-8">
        <AdminCard>
          <SpeciesForm
            action={createSpecies}
            mode="create"
            initial={EMPTY_SPECIES_CREATE_FORM_STATE}
          />
        </AdminCard>
      </div>
    </div>
  );
}
