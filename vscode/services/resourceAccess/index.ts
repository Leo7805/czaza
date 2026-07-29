/**
 * Exposes the shared CZaza resource-access boundary.
 */

export {
  evaluateCzazaResourceAccess,
  getCzazaResourceAccessDenialMessage,
  requireCzazaResourceAccess,
  type AllowedCzazaResourceAccess,
  type CzazaResourceAccessDenialReason,
  type CzazaResourceAccessResult,
  type DeniedCzazaResourceAccess,
} from "./CzazaResourceAccessGate";
