"use client";

// Create-flight form (A4). A Client Component for the same reason `LotForm`
// is one: the Server Action returns per-field messages and the values the
// operator typed, so a rejected window never clears the form.
//
// The five datetime fields are prefilled server-side with the agreed offsets
// (cutoff two days ahead at 18:00, departure +14 h, arrival +2 h, pickup
// arrival → arrival + 3 h); the operator adjusts them and the server
// re-validates the whole window.

import { useActionState } from "react";

import {
  EMPTY_SHIPMENT_FORM_STATE,
  type ShipmentFormState,
} from "@/lib/admin-shipments";
import type { AirportIdOption } from "@/server/admin-shipments";

import FieldError from "./FieldError";
import FormAlert from "./FormAlert";
import {
  fieldGroupClass,
  hintClass,
  inputClass,
  labelClass,
  submitButtonClass,
} from "./form-styles";

/** The five window fields, in the order the operation reads them. */
const DATE_FIELDS = [
  { name: "orderCutoffAt", label: "Cierre de pedidos" },
  { name: "departsAt", label: "Salida" },
  { name: "estimatedArrivalAt", label: "Llegada estimada" },
  { name: "pickupStartsAt", label: "Inicio de retiro" },
  { name: "pickupEndsAt", label: "Fin de retiro" },
] as const;

export interface ShipmentFormProps {
  action: (state: ShipmentFormState, formData: FormData) => Promise<ShipmentFormState>;
  airports: AirportIdOption[];
  /** Ecuador `datetime-local` defaults, one per window field. */
  defaults: {
    orderCutoffAt: string;
    departsAt: string;
    estimatedArrivalAt: string;
    pickupStartsAt: string;
    pickupEndsAt: string;
  };
}

export default function ShipmentForm({
  action,
  airports,
  defaults,
}: ShipmentFormProps) {
  const [state, formAction, pending] = useActionState(action, {
    ...EMPTY_SHIPMENT_FORM_STATE,
    raw: {
      ...EMPTY_SHIPMENT_FORM_STATE.raw,
      airportCode: airports[0]?.code ?? "",
      ...defaults,
    },
  });
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormAlert message={state.formError} />

      <div className={fieldGroupClass}>
        <label htmlFor="airportCode" className={labelClass}>
          Aeropuerto
        </label>
        <select
          id="airportCode"
          name="airportCode"
          defaultValue={state.raw.airportCode}
          aria-describedby={errors.airportCode ? "airportCode-error" : undefined}
          aria-invalid={errors.airportCode ? true : undefined}
          className={inputClass}
        >
          {airports.map((airport) => (
            <option key={airport.id} value={airport.code}>
              {airport.city} ({airport.code})
            </option>
          ))}
        </select>
        <FieldError field="airportCode" message={errors.airportCode} />
      </div>

      <div className={fieldGroupClass}>
        <label htmlFor="flightNumber" className={labelClass}>
          Número de vuelo (opcional)
        </label>
        <input
          id="flightNumber"
          name="flightNumber"
          type="text"
          maxLength={40}
          placeholder="E2E-TEST-1"
          defaultValue={state.raw.flightNumber}
          aria-describedby={errors.flightNumber ? "flightNumber-error" : undefined}
          aria-invalid={errors.flightNumber ? true : undefined}
          className={inputClass}
        />
        <FieldError field="flightNumber" message={errors.flightNumber} />
      </div>

      <div className={fieldGroupClass}>
        <label htmlFor="carrier" className={labelClass}>
          Transportista (opcional)
        </label>
        <input
          id="carrier"
          name="carrier"
          type="text"
          maxLength={120}
          defaultValue={state.raw.carrier}
          aria-describedby={errors.carrier ? "carrier-error" : undefined}
          aria-invalid={errors.carrier ? true : undefined}
          className={inputClass}
        />
        <FieldError field="carrier" message={errors.carrier} />
      </div>

      {DATE_FIELDS.map((field) => (
        <div key={field.name} className={fieldGroupClass}>
          <label htmlFor={field.name} className={labelClass}>
            {field.label}
          </label>
          <input
            id={field.name}
            name={field.name}
            type="datetime-local"
            defaultValue={state.raw[field.name]}
            aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
            aria-invalid={errors[field.name] ? true : undefined}
            className={inputClass}
          />
          <FieldError field={field.name} message={errors[field.name]} />
        </div>
      ))}

      <p className={hintClass}>
        Horas de Ecuador (America/Guayaquil). El cierre de pedidos debe ser
        anterior o igual a la salida, y la salida anterior a la llegada.
      </p>

      <button type="submit" disabled={pending} className={submitButtonClass}>
        {pending ? "Guardando…" : "Programar vuelo"}
      </button>
    </form>
  );
}
