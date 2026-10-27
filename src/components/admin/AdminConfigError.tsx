// Rendered by the admin layout when the panel cannot work at all (missing
// AUTH_SECRET): a clear, non-crashing explanation instead of a 500 page.
// It names the variable, never a value, and is only reachable under /admin.

export default function AdminConfigError({ message }: { message: string }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-bold">El panel no está configurado</h1>
      <p className="mt-3 text-neutral-700">
        La sesión del panel no se puede firmar, así que no es posible ingresar.
      </p>
      <p
        role="alert"
        className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
      >
        {message}
      </p>
      <p className="mt-6 text-sm text-neutral-600">
        Configura las variables de entorno del panel (ver la sección «Admin
        panel» del README) y reinicia el servidor.
      </p>
    </main>
  );
}
