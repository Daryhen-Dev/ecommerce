"use client";

// Species form shared by the create (A5) and edit pages. One form, two modes:
// the create mode also submits the slug (which is the species URL from then on)
// and the edit mode shows it read-only.
//
// The tier editor is rendered as `children` inside this form so the whole
// species — data and tier set — is submitted in one request and saved in one
// transaction. Seasons are NOT part of this form: they are their own actions on
// the edit page, because adding a window is an independent decision from
// changing the price.

import { useActionState, useState } from "react";

import {
  DISCOUNT_POLICY_OPTIONS,
  type SpeciesCreateFormState,
  type SpeciesCreateRawFields,
  type SpeciesEditRawFields,
  type SpeciesFieldErrors,
  type SpeciesFormState,
  type TierRawRow,
  discountPolicyLabel,
  vatCategoryLabel,
  VAT_CATEGORY_OPTIONS,
} from "@/lib/admin-species";

import FieldError from "./FieldError";
import FormAlert from "./FormAlert";
import SpeciesTierEditor from "./SpeciesTierEditor";
import {
  fieldGroupClass,
  hintClass,
  inputClass,
  labelClass,
  submitButtonClass,
} from "./form-styles";

/** What either action returns; both shapes are render-compatible. */
type AnySpeciesState = SpeciesFormState | SpeciesCreateFormState;

export interface SpeciesFormProps<State extends AnySpeciesState> {
  action: (state: State, formData: FormData) => Promise<State>;
  mode: "create" | "edit";
  initial: State;
  /** Slug of the species being edited (rendered read-only, submitted hidden). */
  slug?: string;
  /**
   * Tiers to prefill the editor with. The editor lives inside this form so the
   * species and its tier set are submitted in one request and saved in one
   * transaction.
   */
  tierRows?: TierRawRow[];
}

/** Either raw shape: the create shape is the edit shape plus the slug. */
type AnyRaw = SpeciesEditRawFields | SpeciesCreateRawFields;

/** Reads one field from either raw shape without caring which mode it is. */
function rawValue(raw: AnyRaw, field: keyof SpeciesEditRawFields): string {
  return raw[field] ?? "";
}

export default function SpeciesForm<State extends AnySpeciesState>({
  action,
  mode,
  initial,
  slug,
  tierRows,
}: SpeciesFormProps<State>) {
  // `useActionState` types its reducer as `Awaited<State>`; the two admin
  // actions return their own state shape (create carries the extra slug), so
  // the generic parameter is spelled out instead of inferred.
  const [state, formAction, pending] = useActionState<State, FormData>(
    action as (state: Awaited<State>, payload: FormData) => State | Promise<State>,
    initial as Awaited<State>,
  );
  // Local policy state only decides whether the tier editor is visible; the
  // submitted value is what the Server Action parses and trusts.
  const [policy, setPolicy] = useState(rawValue(initial.raw, "discountPolicy"));
  const errors: SpeciesFieldErrors = state.fieldErrors;
  const raw = state.raw;

  const isCreate = mode === "create";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormAlert message={state.formError} />

      {isCreate ? (
        <div className={fieldGroupClass}>
          <label htmlFor="slug" className={labelClass}>
            Slug
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            placeholder="yellowfin-tuna"
            defaultValue={(raw as SpeciesCreateRawFields).slug}
            aria-describedby={errors.slug ? "slug-hint slug-error" : "slug-hint"}
            aria-invalid={errors.slug ? true : undefined}
            className={inputClass}
          />
          <p id="slug-hint" className={hintClass}>
            Identifica la especie en la tienda y en el carrito. No se puede
            cambiar después de crearla.
          </p>
          <FieldError field="slug" message={errors.slug} />
        </div>
      ) : (
        <div className={fieldGroupClass}>
          <p className={labelClass}>Slug</p>
          <input type="hidden" name="speciesSlug" value={slug ?? ""} />
          <p className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-neutral-800">
            {slug}
          </p>
          <p className={hintClass}>
            El slug no se puede cambiar: la tienda y los pedidos ya lo usan.
          </p>
        </div>
      )}

      <div className={fieldGroupClass}>
        <label htmlFor="name" className={labelClass}>
          Nombre
        </label>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={rawValue(raw, "name")}
          aria-describedby={errors.name ? "name-error" : undefined}
          aria-invalid={errors.name ? true : undefined}
          className={inputClass}
        />
        <FieldError field="name" message={errors.name} />
      </div>

      <div className={fieldGroupClass}>
        <label htmlFor="description" className={labelClass}>
          Descripción (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={rawValue(raw, "description")}
          aria-describedby={
            errors.description ? "description-error" : undefined
          }
          aria-invalid={errors.description ? true : undefined}
          className={inputClass}
        />
        <FieldError field="description" message={errors.description} />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className={fieldGroupClass}>
          <label htmlFor="pricePerKg" className={labelClass}>
            Precio por kilo (USD)
          </label>
          <input
            id="pricePerKg"
            name="pricePerKg"
            type="text"
            inputMode="decimal"
            placeholder="12.50"
            defaultValue={rawValue(raw, "pricePerKg")}
            aria-describedby={
              errors.pricePerKg ? "pricePerKg-hint pricePerKg-error" : "pricePerKg-hint"
            }
            aria-invalid={errors.pricePerKg ? true : undefined}
            className={inputClass}
          />
          <p id="pricePerKg-hint" className={hintClass}>
            Usa punto para decimales.
          </p>
          <FieldError field="pricePerKg" message={errors.pricePerKg} />
        </div>

        <div className={fieldGroupClass}>
          <label htmlFor="minOrderKg" className={labelClass}>
            Pedido mínimo (kg)
          </label>
          <input
            id="minOrderKg"
            name="minOrderKg"
            type="text"
            inputMode="decimal"
            placeholder="1"
            defaultValue={rawValue(raw, "minOrderKg")}
            aria-describedby={errors.minOrderKg ? "minOrderKg-error" : undefined}
            aria-invalid={errors.minOrderKg ? true : undefined}
            className={inputClass}
          />
          <FieldError field="minOrderKg" message={errors.minOrderKg} />
        </div>

        <div className={fieldGroupClass}>
          <label htmlFor="orderStepKg" className={labelClass}>
            Paso del pedido (kg)
          </label>
          <input
            id="orderStepKg"
            name="orderStepKg"
            type="text"
            inputMode="decimal"
            placeholder="0.5"
            defaultValue={rawValue(raw, "orderStepKg")}
            aria-describedby={errors.orderStepKg ? "orderStepKg-error" : undefined}
            aria-invalid={errors.orderStepKg ? true : undefined}
            className={inputClass}
          />
          <FieldError field="orderStepKg" message={errors.orderStepKg} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className={fieldGroupClass}>
          <label htmlFor="discountPolicy" className={labelClass}>
            Política de descuento
          </label>
          <select
            id="discountPolicy"
            name="discountPolicy"
            value={policy}
            onChange={(event) => setPolicy(event.target.value)}
            aria-describedby={
              errors.discountPolicy ? "discountPolicy-error" : undefined
            }
            aria-invalid={errors.discountPolicy ? true : undefined}
            className={inputClass}
          >
            {DISCOUNT_POLICY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {discountPolicyLabel(option)}
              </option>
            ))}
          </select>
          <FieldError field="discountPolicy" message={errors.discountPolicy} />
        </div>

        <div className={fieldGroupClass}>
          <label htmlFor="vatCategory" className={labelClass}>
            Categoría de IVA
          </label>
          <select
            id="vatCategory"
            name="vatCategory"
            defaultValue={rawValue(raw, "vatCategory")}
            aria-describedby={errors.vatCategory ? "vatCategory-error" : undefined}
            aria-invalid={errors.vatCategory ? true : undefined}
            className={inputClass}
          >
            {VAT_CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {vatCategoryLabel(option)}
              </option>
            ))}
          </select>
          <FieldError field="vatCategory" message={errors.vatCategory} />
        </div>
      </div>

      <div className={fieldGroupClass}>
        <label htmlFor="isSeasonal" className="flex items-center gap-2 text-sm font-medium">
          <input
            id="isSeasonal"
            name="isSeasonal"
            type="checkbox"
            defaultChecked={rawValue(raw, "isSeasonal") === "on"}
            className="h-4 w-4 rounded border-neutral-400"
          />
          Especie de temporada
        </label>
        <p className={hintClass}>
          Una especie de temporada solo se vende dentro de sus temporadas. Sin al
          menos una temporada, la tienda no la ofrece.
        </p>
      </div>

      <SpeciesTierEditor
        initialRows={tierRows ?? []}
        fieldErrors={errors}
        visible={policy === "CUSTOM"}
      />

      <button type="submit" disabled={pending} className={submitButtonClass}>
        {pending
          ? "Guardando…"
          : isCreate
            ? "Crear especie"
            : "Guardar cambios"}
      </button>
    </form>
  );
}
