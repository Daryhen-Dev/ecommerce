"use client";

// Register-a-rate form (S2). One submit appends one row to the append-only
// history: the category, the percentage and the date it starts to apply. The
// page around it lists what is in force and the full history, so the form only
// owns the submission state.
//
// The client validation is a convenience, never the authority: the Server
// Action re-parses every field and re-applies the date rules against the
// stored history.

import { useActionState } from "react";

import {
  EMPTY_TAX_RATE_FORM_STATE,
  RATE_NOTE_MAX,
  type TaxRateFormState,
} from "@/lib/admin-tax";
import { VAT_CATEGORY_OPTIONS, vatCategoryLabel } from "@/lib/admin-species";

import FieldError from "./FieldError";
import FormAlert from "./FormAlert";
import {
  fieldGroupClass,
  hintClass,
  inputClass,
  labelClass,
  submitButtonClass,
} from "./form-styles";

export interface TaxRateFormProps {
  action: (state: TaxRateFormState, formData: FormData) => Promise<TaxRateFormState>;
}

export default function TaxRateForm({ action }: TaxRateFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    EMPTY_TAX_RATE_FORM_STATE,
  );
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormAlert message={state.formError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={fieldGroupClass}>
          <label htmlFor="category" className={labelClass}>
            Categoría de IVA
          </label>
          <select
            id="category"
            name="category"
            defaultValue={state.raw.category}
            aria-describedby={errors.category ? "category-error" : undefined}
            aria-invalid={errors.category ? true : undefined}
            className={inputClass}
          >
            {VAT_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {vatCategoryLabel(option)}
              </option>
            ))}
          </select>
          <FieldError field="category" message={errors.category} />
        </div>

        <div className={fieldGroupClass}>
          <label htmlFor="ratePercent" className={labelClass}>
            Porcentaje de IVA (%)
          </label>
          <input
            id="ratePercent"
            name="ratePercent"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={state.raw.ratePercent}
            aria-describedby={
              errors.ratePercent ? "ratePercent-error" : "ratePercent-hint"
            }
            aria-invalid={errors.ratePercent ? true : undefined}
            className={inputClass}
          />
          <span id="ratePercent-hint" className={hintClass}>
            Usa punto para decimales, ej. 15.
          </span>
          <FieldError field="ratePercent" message={errors.ratePercent} />
        </div>
      </div>

      <div className={fieldGroupClass}>
        <label htmlFor="effectiveFrom" className={labelClass}>
          Vigente desde
        </label>
        {/* A rate change can start at an announced second (the Server Action
            parses "HH:mm" and "HH:mm:ss" alike). Without `step=1` the control
            rejects every second other than 00 and the browser blocks the
            submit, which silently loses the operator's click. */}
        <input
          id="effectiveFrom"
          name="effectiveFrom"
          type="datetime-local"
          step={1}
          defaultValue={state.raw.effectiveFrom}
          aria-describedby={
            errors.effectiveFrom ? "effectiveFrom-error" : "effectiveFrom-hint"
          }
          aria-invalid={errors.effectiveFrom ? true : undefined}
          className={inputClass}
        />
        <span id="effectiveFrom-hint" className={hintClass}>
          Hora de Ecuador (America/Guayaquil). Debe ser posterior a la última
          tarifa de esa categoría: una tarifa pasada no se puede retirar.
        </span>
        <FieldError field="effectiveFrom" message={errors.effectiveFrom} />
      </div>

      <div className={fieldGroupClass}>
        <label htmlFor="note" className={labelClass}>
          Nota (opcional)
        </label>
        <input
          id="note"
          name="note"
          autoComplete="off"
          defaultValue={state.raw.note}
          aria-describedby={errors.note ? "note-error" : "note-hint"}
          aria-invalid={errors.note ? true : undefined}
          className={inputClass}
        />
        <span id="note-hint" className={hintClass}>
          Queda como línea de auditoría del cambio. Máximo {RATE_NOTE_MAX}{" "}
          caracteres.
        </span>
        <FieldError field="note" message={errors.note} />
      </div>

      <button type="submit" disabled={pending} className={submitButtonClass}>
        {pending ? "Registrando…" : "Registrar tarifa"}
      </button>
    </form>
  );
}
