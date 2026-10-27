import Link from "next/link";

import { listAirports } from "@/server/catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const airports = await listAirports();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-16 text-center">
      <h1 className="text-4xl font-bold sm:text-5xl">
        Pesca Artesanal Galápagos
      </h1>
      <p className="mt-4 max-w-xl text-lg text-neutral-600">
        Pescado fresco de Galápagos, con retiro en los aeropuertos de Quito,
        Guayaquil y Cuenca.
      </p>

      <section aria-labelledby="airport-heading" className="mt-12 w-full">
        <h2 id="airport-heading" className="text-2xl font-semibold">
          ¿En qué aeropuerto retiras tu pedido?
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {airports.map((airport) => (
            <li key={airport.code}>
              <Link
                href={`/${airport.code.toLowerCase()}`}
                className="flex h-full flex-col items-center justify-center rounded-lg border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="text-lg font-semibold">{airport.city}</span>
                <span className="mt-1 text-sm text-neutral-600">
                  {airport.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-neutral-600">
          Llevas tu pedido desde el aeropuerto; el retiro es responsabilidad
          del cliente.
        </p>
      </section>
    </main>
  );
}
