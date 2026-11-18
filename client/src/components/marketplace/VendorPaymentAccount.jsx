import { useState } from "react";
import { Button, Feedback } from "./ui.jsx";
import { INPUT_CLASSES, LABEL_CLASSES } from "../auth/authStyles.js";
import { useAction } from "../../hooks/useAction.js";
import { linkVendorAccount } from "../../services/commerceService.js";
const VendorPaymentAccount = ({ vendorId }) => {
  const [accountId, setAccountId] = useState("");
  const action = useAction();
  const submit = async (e) => {
    e.preventDefault();
    await action.run(
      (options) => linkVendorAccount(vendorId, accountId.trim(), options),
      "Linked Razorpay test account saved.",
    );
  };
  return (
    <form onSubmit={submit} className="mt-5 border-t border-line pt-5">
      <h3 className="font-semibold">Razorpay Route test account (optional)</h3>
      <p className="mt-2 text-sm text-muted">
        Standard test checkout works without a linked account. Connect an
        activated linked test account here when Route is available and automatic
        vendor transfers are enabled.
      </p>
      <Feedback {...action.feedback} />
      <label
        htmlFor={`payment-${vendorId}`}
        className={`${LABEL_CLASSES} mt-4`}
      >
        Linked account ID
      </label>
      <div className="flex flex-wrap gap-3">
        <input
          id={`payment-${vendorId}`}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className={`${INPUT_CLASSES} max-w-md`}
          pattern="acc_[A-Za-z0-9]+"
          placeholder="acc_…"
          required
          disabled={action.busy}
        />
        <Button type="submit" disabled={action.busy}>
          {action.busy ? "Checking…" : "Connect test account"}
        </Button>
      </div>
    </form>
  );
};
export { VendorPaymentAccount };
