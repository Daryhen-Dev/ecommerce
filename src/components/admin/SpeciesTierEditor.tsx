"use client";

// Tier editor shared by the create and edit species forms (A5).
//
// A tier is a pair of inputs (threshold in kg, discount in percent) and the
// pair is repeated, so rows are client state: the operator adds and removes
// rows before submitting, and the whole set is replaced atomically on save.
// Two parallel field names (`tierMinTotalKg`, `tierDiscountPercent`) keep the
// Server Action able to read the submission with `formData.getAll`.
//
// The rows are only rendered while the species policy is CUSTOM: a species
// with global or no discount has no tiers of its own, and showing editable rows
// there would imply a setting that does not exist.

import { useState } from "react";

import type { SpeciesFieldErrors, TierRawRow } from "@/lib/admin-species";

import FieldError from "./FieldError";
import { hintClass, inlineButtonClass, inputClass, labelClass } from "./form-styles";

export interface SpeciesTierEditorProps {
  initialRows: TierRawRow[];
  fieldErrors: SpeciesFieldErrors;
  visible: boolean;
}

/** One blank row the operator can fill in when adding a tier. */
const BLANK_ROW: TierRawRow = { minTotalKg: "", discountPercent: "" };

export default function SpeciesTierEditor({
  initialRows,
  fieldErrors,
  visible,
}: SpeciesTierEditorProps) {
  const [rows, setRows] = useState<TierRawRow[]>(initialRows);

  if (!visible) {
    return null;
  }

  function updateRow(index: number, patch: Partial<TierRawRow>): void {
    setRows((current) =>
      current.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold">Tramos de descuento</h3>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          El descuento se elige por el peso total del pedido, sumando todas las
          especies. El tramo de 0 kg se aplica desde el primer kilo.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-700">
          Esta especie todavía no tiene tramos. La política de tramos propios
          necesita al menos uno.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row, index) => {
            const minError = fieldErrors[`tier-${index}-minTotalKg`];
            const percentError = fieldErrors[`tier-${index}-discountPercent`];
            return (
              <li key={index} className="rounded-md border border-neutral-200 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex w-40 flex-col gap-1">
                    <label htmlFor={`tier-${index}-minTotalKg`} className={labelClass}>
                      Desde (kg)
                    </label>
                    <input
                      id={`tier-${index}-minTotalKg`}
                      name="tierMinTotalKg"
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={row.minTotalKg}
                      onChange={(event) =>
                        updateRow(index, { minTotalKg: event.target.value })
                      }
                      aria-invalid={minError ? true : undefined}
                      aria-describedby={
                        minError ? `tier-${index}-minTotalKg-error` : undefined
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="flex w-40 flex-col gap-1">
                    <label
                      htmlFor={`tier-${index}-discountPercent`}
                      className={labelClass}
                    >
                      Descuento (%)
                    </label>
                    <input
                      id={`tier-${index}-discountPercent`}
                      name="tierDiscountPercent"
                      type="text"
                      inputMode="decimal"
                      placeholder="5"
                      value={row.discountPercent}
                      onChange={(event) =>
                        updateRow(index, { discountPercent: event.target.value })
                      }
                      aria-invalid={percentError ? true : undefined}
                      aria-describedby={
                        percentError ? `tier-${index}-discountPercent-error` : undefined
                      }
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    className={inlineButtonClass}
                    onClick={() =>
                      setRows((current) =>
                        current.filter((_row, position) => position !== index),
                      )
                    }
                  >
                    Quitar tramo {index + 1}
                  </button>
                </div>
                <FieldError
                  field={`tier-${index}-minTotalKg`}
                  message={minError}
                />
                <FieldError
                  field={`tier-${index}-discountPercent`}
                  message={percentError}
                />
              </li>
            );
          })}
        </ol>
      )}

      <button
        type="button"
        className={inlineButtonClass + " w-fit"}
        onClick={() => setRows((current) => [...current, BLANK_ROW])}
      >
        Agregar tramo
      </button>
      <p className={hintClass}>
        Usa punto para decimales, ej. 2.5. El descuento va entre 0 y 100. Deja
        una fila vacía para no usarla.
      </p>
    </div>
  );
}
