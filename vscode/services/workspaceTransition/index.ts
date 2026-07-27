/**
 * Exports Git workspace transition detection and protection services.
 */

export { GitWorkspaceTransitionGuard } from "./GitWorkspaceTransitionGuard";
export {
  GitAwareSourceChangeGate,
  type SourceChangeRevisionToken,
} from "./GitAwareSourceChangeGate";
export { registerGitWorkspaceTransition } from "./registerGitWorkspaceTransition";
