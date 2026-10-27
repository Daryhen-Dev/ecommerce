// Form-level error for failures that belong to no single field (a uniqueness
// violation, a closed lot, a failed transaction). The red border is never the
// only signal: the alert has a text message and a decorative icon that
// screen readers skip.

export default function FormAlert({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <span aria-hidden="true" className="font-bold">
        !
      </span>
      <p>{message}</p>
    </div>
  );
}
