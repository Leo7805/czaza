/**
 * CZaza-styled form for creating a Personal Notes identity.
 */

import { useState } from "react";
import { ModalShell } from "./ModalShell";

/** Collects a display name and email for immediate identity hashing. */
export function PersonalIdentityModal({
  defaultName = "",
  defaultEmail = "",
  onCancel,
  onSubmit,
}: {
  defaultName?: string;
  defaultEmail?: string;
  onCancel: () => void;
  onSubmit: (displayName: string, email: string) => void;
}) {
  const [displayName, setDisplayName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const valid = Boolean(displayName.trim() && /^\S+@\S+\.\S+$/.test(email.trim()));

  return (
    <ModalShell
      title="Create Personal Identity"
      className="personal-identity-modal"
      onDismiss={onCancel}
      actions={(
        <>
          <button className="modal-shell__action modal-shell__action--secondary" type="button" onClick={onCancel}>Cancel</button>
          <button
            className="modal-shell__action modal-shell__action--primary"
            disabled={!valid}
            type="button"
            onClick={() => onSubmit(displayName.trim(), email.trim())}
          >Create</button>
        </>
      )}
    >
      <label className="personal-identity-modal__field">
        <span>Display name</span>
        <input autoFocus value={displayName} onChange={(event) => setDisplayName(event.currentTarget.value)} />
      </label>
      <label className="personal-identity-modal__field">
        <span>Email</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} />
      </label>
      <p>Email is used only to calculate a stable identity hash. It is not stored.</p>
    </ModalShell>
  );
}
