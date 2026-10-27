import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-24 text-center">
      <h1 className="text-4xl font-bold">Página no encontrada (404)</h1>
      <p className="mt-4 max-w-xl text-lg text-neutral-600">
        No encontramos la página que buscas. Puede que la ciudad no exista o
        que el enlace esté desactualizado.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-lg border border-neutral-300 bg-white px-5 py-3 font-medium shadow-sm transition hover:border-neutral-400 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
