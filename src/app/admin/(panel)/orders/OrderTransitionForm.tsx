"use client";

// Status actions of one order (A6). The panel offers exactly two manual
// transitions, so this component renders one small form per transition button
// and owns the action result: an allowed change returns empty state and the
// revalidated page shows the stored status, a refused one renders the Spanish
// message as a form alert inside the order it belongs to.
//
// The current status is submitted with the request (hidden field) and is the
// value the server matches on, so this component is what makes a stale page
// safe: if the order changed in another tab, the update matches nothing and the
// server refuses.

import { useActionState } from "react";

import FormAlert from "@/components/admin/FormAlert";
import { inlineButtonClass, submitButtonClass } from "@/components/admin/form-styles";
import {
  EMPTY_ORDER_TRANSITION_STATE,
  ORDER_TRANSITION_TARGETS,
  orderTransitionLabel,
  type OrderStatus,
  type OrderTransitionState,
} from "@/lib/admin-orders";

export interface OrderTransitionFormProps {
  action: (
    state: OrderTransitionState,
    formData: FormData,
  ) => Promise<OrderTransitionState>;
  orderId: string;
  /** The status the page rendered: what the server matches the update on. */
  currentStatus: OrderStatus;
}

export default function OrderTransitionForm({
  action,
  orderId,
  currentStatus,
}: OrderTransitionFormProps) {
  const [state, formAction, pending] = useActionState<
    OrderTransitionState,
    FormData
  >(action, EMPTY_ORDER_TRANSITION_STATE);

  return (
    <div className="mt-4 flex flex-col gap-2">
      <FormAlert message={state.formError} />
      <div className="flex flex-wrap gap-2">
        {ORDER_TRANSITION_TARGETS.map((target) => (
          <form key={target} action={formAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="expectedStatus" value={currentStatus} />
            <input type="hidden" name="nextStatus" value={target} />
            <button
              type="submit"
              disabled={pending}
              className={
                target === "PAID" ? submitButtonClass : inlineButtonClass
              }
            >
              {orderTransitionLabel(target)}
            </button>
          </form>
        ))}
      </div>
      <p className="text-xs text-neutral-600">
        Solo cambia el estado. Los ítems, los datos del cliente y los montos
        quedan como se registraron.
      </p>
    </div>
  );
}
