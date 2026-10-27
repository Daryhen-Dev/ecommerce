"use client";

// Add-season form for one seasonal species (A5). Seasons are their own form
// and their own Server Action: registering a window is an independent decision
// from editing the price, and mixing them would make one failed submit discard
// the other.
//
// The list of existing windows and their remove buttons live in the page: they
// are plain forms, so this component only owns the "add" submission state.

import { useActionState } from "react";

import {
  EMPTY_SEASON_FORM_STATE,
  type SeasonFormState,
} from "@/lib/admin-species";

import FieldError from "./FieldError";
import FormAlert from "./FormAlert";
import {
  fieldGroupClass,
  hintClass,
  inputClass,
  labelClass,
  submitButtonClass,
} from "./form-styles";

export interface SpeciesSeasonFormProps {
  action: (state: SeasonFormState, formData: FormData) => Promise<SeasonFormState>;
  speciesSlug: string;
}

export default function SpeciesSeasonForm({
  action,
  speciesSlug,
}: SpeciesSeasonFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    EMPTY_SEASON_FORM_STATE,
  );
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormAlert message={state.formError} />
      <input type="hidden" name="speciesSlug" value={speciesSlug} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={fieldGroupClass}>
          <label htmlFor="startsAt" className={labelClass}>
            Inicio de temporada
          </label>
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={state.raw.startsAt}
            aria-describedby={errors.startsAt ? "startsAt-error" : undefined}
            aria-invalid={errors.startsAt ? true : undefined}
            className={inputClass}
          />
          <FieldError field="startsAt" message={errors.startsAt} />
        </div>

        <div className={fieldGroupClass}>
          <label htmlFor="endsAt" className={labelClass}>
            Fin de temporada
          </label>
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            defaultValue={state.raw.endsAt}
            aria-describedby={errors.endsAt ? "endsAt-error" : undefined}
            aria-invalid={errors.endsAt ? true : undefined}
            className={inputClass}
          />
          <FieldError field="endsAt" message={errors.endsAt} />
        </div>
      </div>

      <p className={hintClass}>Hora de Ecuador (America/Guayaquil).</p>

      <button type="submit" disabled={pending} className={submitButtonClass}>
        {pending ? "Agregando…" : "Agregar temporada"}
      </button>
    </form>
  );
}
