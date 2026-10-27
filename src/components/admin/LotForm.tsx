"use client";

// Create-landing form (A3). A Client Component only because it owns the
// action result: the Server Action re-validates every field and returns the
// per-field Spanish messages plus the values the operator typed, so a failed
// submission never loses the form.
//
// The action is passed in as a prop, so this component stays testable and the
// `server-only` kit is never imported into the client bundle.

import { useActionState } from "react";

import { EMPTY_LOT_FORM_STATE, type LotFormState } from "@/lib/admin-lots";
import type { SpeciesOption } from "@/server/admin-lots";

import FieldError from "./FieldError";
import FormAlert from "./FormAlert";
import {
  fieldGroupClass,
  hintClass,
  inputClass,
  labelClass,
  submitButtonClass,
} from "./form-styles";

export interface LotFormProps {
  action: (state: LotFormState, formData: FormData) => Promise<LotFormState>;
  species: SpeciesOption[];
  /** Ecuador `datetime-local` value prefilled with "now". */
  defaultLandedAt: string;
}

export default function LotForm({ action, species, defaultLandedAt }: LotFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    ...EMPTY_LOT_FORM_STATE,
    raw: { ...EMPTY_LOT_FORM_STATE.raw, landedAt: defaultLandedAt },
  });

  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormAlert message={state.formError} />

      <div className={fieldGroupClass}>
        <label htmlFor="species" className={labelClass}>
          Especie
        </label>
        <select
          id="species"
          name="species"
          defaultValue={state.raw.species}
          aria-describedby={errors.species ? "species-error" : undefined}
          aria-invalid={errors.species ? true : undefined}
          className={inputClass}
        >
          <option value="">Elige una especie</option>
          {species.map((option) => (
            <option key={option.id} value={option.slug}>
              {option.name}
            </option>
          ))}
        </select>
        <FieldError field="species" message={errors.species} />
      </div>

      <div className={fieldGroupClass}>
        <label htmlFor="landedAt" className={labelClass}>
          Fecha de desembarque
        </label>
        <input
          id="landedAt"
          name="landedAt"
          type="datetime-local"
          defaultValue={state.raw.landedAt}
          aria-describedby={errors.landedAt ? "landedAt-error" : "landedAt-hint"}
          aria-invalid={errors.landedAt ? true : undefined}
          className={inputClass}
        />
        <p id="landedAt-hint" className={hintClass}>
          Hora de Ecuador (America/Guayaquil).
        </p>
        <FieldError field="landedAt" message={errors.landedAt} />
      </div>

      <div className={fieldGroupClass}>
        <label htmlFor="totalKg" className={labelClass}>
          Peso total (kg)
        </label>
        <input
          id="totalKg"
          name="totalKg"
          type="text"
          inputMode="decimal"
          placeholder="12.5"
          defaultValue={state.raw.totalKg}
          aria-describedby={errors.totalKg ? "totalKg-hint totalKg-error" : "totalKg-hint"}
          aria-invalid={errors.totalKg ? true : undefined}
          className={inputClass}
        />
        <p id="totalKg-hint" className={hintClass}>
          Usa punto para decimales, ej. 7.5. Mínimo 0.5 kg.
        </p>
        <FieldError field="totalKg" message={errors.totalKg} />
      </div>

      <div className={fieldGroupClass}>
        <label htmlFor="notes" className={labelClass}>
          Comentario (opcional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={500}
          defaultValue={state.raw.notes}
          aria-describedby={errors.notes ? "notes-hint notes-error" : "notes-hint"}
          aria-invalid={errors.notes ? true : undefined}
          className={inputClass}
        />
        <p id="notes-hint" className={hintClass}>
          Hasta 500 caracteres. Sirve para identificar el desembarque en la lista.
        </p>
        <FieldError field="notes" message={errors.notes} />
      </div>

      <button type="submit" disabled={pending} className={submitButtonClass}>
        {pending ? "Guardando…" : "Registrar desembarque"}
      </button>
    </form>
  );
}
