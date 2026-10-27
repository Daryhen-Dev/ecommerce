// Edit one species (A5): its configuration and tier set in one form, plus its
// season windows in their own form.
//
// The page is a Server Component: it resolves the species from the URL slug and
// renders the two Client Components that own the action results. Dynamic on
// purpose: the panel always reads the current configuration.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { addSeason, removeSeason, updateSpecies } from "@/app/admin/(panel)/species/[slug]/actions";
import AdminCard from "@/components/admin/AdminCard";
import FormAlert from "@/components/admin/FormAlert";
import SpeciesForm from "@/components/admin/SpeciesForm";
import SpeciesSeasonForm from "@/components/admin/SpeciesSeasonForm";
import { inlineButtonClass } from "@/components/admin/form-styles";
import {
  EMPTY_SPECIES_FORM_STATE,
  seasonalWithoutSeasonMessage,
  toSpeciesEditRaw,
  toTierRawRows,
} from "@/lib/admin-species";
import { formatEcuadorDateTime } from "@/lib/format";
import { getSpeciesForAdmin } from "@/server/admin-species";

export const dynamic = "force-dynamic";

type SpeciesEditPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string; saved?: string }>;
};

export async function generateMetadata({
  params,
}: SpeciesEditPageProps): Promise<Metadata> {
  const { slug } = await params;
  const species = await getSpeciesForAdmin(slug);
  return {
    title: species === null
      ? "Especie | Pesca Artesanal Galápagos"
      : `${species.name} | Pesca Artesanal Galápagos`,
  };
}

export default async function EditSpeciesPage({
  params,
  searchParams,
}: SpeciesEditPageProps) {
  const { slug } = await params;
  const { created, saved } = await searchParams;
  const species = await getSpeciesForAdmin(slug);
  if (species === null) {
    notFound();
  }

  const seasonWarning = seasonalWithoutSeasonMessage({
    isSeasonal: species.isSeasonal,
    seasonCount: species.seasonCount,
  });

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold sm:text-4xl">{species.name}</h1>
        <Link href="/admin/species" className="font-medium underline underline-offset-4">
          Volver a especies
        </Link>
      </div>
      <p className="mt-3 max-w-2xl text-neutral-700">
        Los cambios se aplican al siguiente pedido. Los pedidos ya pagados
        conservan el precio y el descuento con los que se cobraron.
      </p>

      <p role="status" aria-live="polite" className="mt-4 text-sm font-medium text-green-800">
        {created === "1" ? "Especie creada." : saved === "1" ? "Cambios guardados." : ""}
      </p>

      {seasonWarning === null ? null : (
        <div className="mt-4">
          <FormAlert message={seasonWarning} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        <AdminCard title="Datos y tramos">
          <SpeciesForm
            action={updateSpecies}
            mode="edit"
            slug={species.slug}
            initial={{
              ...EMPTY_SPECIES_FORM_STATE,
              raw: toSpeciesEditRaw(species),
            }}
            tierRows={toTierRawRows(species.tiers)}
          />
        </AdminCard>

        <AdminCard title="Temporadas">
          {species.isSeasonal ? (
            <>
              {species.seasons.length === 0 ? (
                <p className="text-neutral-700">
                  Esta especie es de temporada y todavía no tiene ninguna
                  temporada registrada: la tienda no la ofrece hasta que agregues
                  una.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Temporadas registradas, de la más antigua a la más reciente.
                    </caption>
                    <thead>
                      <tr className="border-b border-neutral-300">
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          Inicio
                        </th>
                        <th scope="col" className="py-2 pr-3 font-semibold">
                          Fin
                        </th>
                        <th scope="col" className="py-2 font-semibold">
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {species.seasons.map((season) => (
                        <tr key={season.id} className="border-b border-neutral-200 align-top">
                          <td className="py-3 pr-3">{formatEcuadorDateTime(season.startsAt)}</td>
                          <td className="py-3 pr-3">{formatEcuadorDateTime(season.endsAt)}</td>
                          <td className="py-3">
                            <form action={removeSeason}>
                              <input type="hidden" name="speciesSlug" value={species.slug} />
                              <input type="hidden" name="seasonId" value={season.id} />
                              <button type="submit" className={inlineButtonClass}>
                                Quitar temporada
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-6 border-t border-neutral-200 pt-6">
                <h3 className="text-base font-semibold">Agregar temporada</h3>
                <div className="mt-3">
                  <SpeciesSeasonForm action={addSeason} speciesSlug={species.slug} />
                </div>
              </div>
            </>
          ) : (
            <p className="text-neutral-700">
              Esta especie no es de temporada: se vende todo el año mientras tenga
              kilos disponibles. Marca «Especie de temporada» y guarda los cambios
              para administrar temporadas.
            </p>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
