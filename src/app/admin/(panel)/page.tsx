// Dashboard of the panel: the five operational sections with what each one is
// for, and the current state of the operation at a glance (today's open
// landings, the next flights and how many orders wait for payment).
//
// Until A6 the cards were placeholders; now every card links to its section,
// which is what makes the panel navigable without typing URLs.

import type { Metadata } from "next";
import Link from "next/link";

import AdminCard from "@/components/admin/AdminCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel de la cooperativa | Pesca Artesanal Galápagos",
};

const SECTIONS = [
  {
    href: "/admin/lots",
    name: "Desembarques",
    description: "Registrar desembarques por lote y cerrar los que se agotan.",
  },
  {
    href: "/admin/shipments",
    name: "Vuelos",
    description: "Programar vuelos por aeropuerto y su ventana de pedidos.",
  },
  {
    href: "/admin/species",
    name: "Especies",
    description: "Precios por kilo, mínimos, políticas y temporadas.",
  },
  {
    href: "/admin/orders",
    name: "Pedidos",
    description: "Revisar los pedidos de cada vuelo y su estado.",
  },
  {
    href: "/admin/tax",
    name: "IVA",
    description: "Porcentajes de IVA y desde cuándo se aplican.",
  },
] as const;

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Panel de la cooperativa</h1>
      <p className="mt-3 max-w-2xl text-neutral-700">
        Desde aquí se opera la venta diaria: desembarques, vuelos, especies,
        pedidos e IVA. Todo lo que cambies aquí se ve en la tienda en el
        siguiente pedido; los pedidos ya hechos conservan su precio.
      </p>

      <section aria-labelledby="secciones" className="mt-10">
        <h2 id="secciones" className="text-xl font-semibold">
          Secciones
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <AdminCard>
                <Link
                  href={section.href}
                  className="text-lg font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {section.name}
                </Link>
                <p className="mt-2 text-sm text-neutral-600">{section.description}</p>
              </AdminCard>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
