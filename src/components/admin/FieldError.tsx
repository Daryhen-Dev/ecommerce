// Inline error line for one admin form field. Rendered by the forms next to
// their inputs with `aria-describedby={`${field}-error`}`: the id is derived
// from the field name so the two never drift apart.
//
// A falsy message renders nothing, so forms can always render the component
// instead of branching on "is there an error?".

export default function FieldError({
  field,
  message,
}: {
  field: string;
  message?: string | null;
}) {
  if (!message) {
    return null;
  }
  return (
    <p id={`${field}-error`} role="alert" className="text-sm text-red-800">
      {message}
    </p>
  );
}
