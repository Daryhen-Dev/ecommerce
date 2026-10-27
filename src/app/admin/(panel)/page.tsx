// Dashboard placeholder for A1: the panel exists and is authenticated, but
// the operational sections arrive in the following tasks (A3 to A6).

export const dynamic = "force-dynamic";

const UPCOMING_SECTIONS = [
  {
    name: "Desembarques",
    description: "Registrar desembarques por lote y cerrar los que se agotan.",
  },
  {
    name: "Vuelos",
    description: "Programar vuelos por aeropuerto y su ventana de pedidos.",
  },
  {
    name: "Especies",
    description: "Precios por kilo, mínimos, políticas y temporadas.",
  },
  {
    name: "Pedidos",
    description: "Revisar los pedidos de cada vuelo y su estado.",
  },
] as const;

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold sm:text-4xl">Panel de la cooperativa</h1>
      <p className="mt-3 max-w-2xl text-neutral-700">
        Desde aquí se opera la venta diaria: desembarques, vuelos, especies y
        pedidos. Las secciones se habilitan a medida que estén listas.
      </p>

      <section aria-labelledby="proximamente" className="mt-10">
        <h2 id="proximamente" className="text-xl font-semibold">
          Próximamente
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {UPCOMING_SECTIONS.map((section) => (
            <li
              key={section.name}
              className="rounded-lg border border-dashed border-neutral-300 bg-white p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-neutral-500">{section.name}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                  Próximamente
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">{section.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
