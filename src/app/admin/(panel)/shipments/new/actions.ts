"use server";

// Create-flight Server Action (A4): parses the five datetimes plus the
// airport select and the optional texts, validates the window through the
// shared domain rules, rejects a past cutoff, then inserts a SCHEDULED flight.

import { redirect } from "next/navigation";

import { assertAdminSessionOrRedirect } from "@/lib/admin-actions";
import {
  parseShipmentForm,
  toShipmentInsert,
  validateShipmentWindow,
  type ShipmentFormState,
  type ShipmentRawFields,
} from "@/lib/admin-shipments";
import { createShipmentRecord, listAirportIdOptions } from "@/server/admin-shipments";

/** Reads one submitted text field, `""` when absent (files included). */
function readTextField(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** Raw strings of the create form, in the shape the pure parser expects. */
function readShipmentFields(formData: FormData): ShipmentRawFields {
  return {
    airportCode: readTextField(formData, "airportCode"),
    flightNumber: readTextField(formData, "flightNumber"),
    carrier: readTextField(formData, "carrier"),
    orderCutoffAt: readTextField(formData, "orderCutoffAt"),
    departsAt: readTextField(formData, "departsAt"),
    estimatedArrivalAt: readTextField(formData, "estimatedArrivalAt"),
    pickupStartsAt: readTextField(formData, "pickupStartsAt"),
    pickupEndsAt: readTextField(formData, "pickupEndsAt"),
  };
}

export async function createShipment(
  _previous: ShipmentFormState,
  formData: FormData,
): Promise<ShipmentFormState> {
  await assertAdminSessionOrRedirect();

  const raw = readShipmentFields(formData);

  const airports = await listAirportIdOptions();
  const parsed = parseShipmentForm(raw, {
    airportCodes: airports.map((airport) => airport.code),
  });
  if (!parsed.ok) {
    return { fieldErrors: parsed.fieldErrors, raw };
  }

  const airport = airports.find((option) => option.code === parsed.values.airportCode);
  if (airport === undefined) {
    return {
      fieldErrors: {},
      formError: "Ese aeropuerto ya no está activo. Elige otro.",
      raw,
    };
  }

  // Window invariants come from the domain (the storefront uses the same
  // rules); the future-cutoff rule is admin-only.
  const windowError = validateShipmentWindow(parsed.values, new Date());
  if (windowError !== null) {
    return { fieldErrors: {}, formError: windowError, raw };
  }

  await createShipmentRecord(toShipmentInsert(parsed.values, airport.id));
  redirect("/admin/shipments?created=1");
}
