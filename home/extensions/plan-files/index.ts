import { withFileMutationQueue, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPlanFiles } from "./plan-files.ts";

export default function planFiles(pi: ExtensionAPI) {
  registerPlanFiles(pi, withFileMutationQueue);
}
