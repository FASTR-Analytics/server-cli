import { getConfig } from "../core/config.ts";

/** Work in progress on an instance that a restart or stop would kill.
 *  keyRejected: the instance refused the status key, so its work is unknown
 *  and it is treated as busy (restart/stop skip it unless --force). */
export type InstanceBusy = { generatingRuns: number; runningImports: string[]; keyRejected?: boolean };

// null = not busy. Only the `busy` field is read: an instance that does not
// report it (pre-v2) is never busy, so the gate does not protect it.
export function readBusy(payload: Record<string, unknown>): InstanceBusy | null {
  const busy = payload.busy as Partial<InstanceBusy> | null | undefined;
  if (busy && typeof busy === "object") {
    const generatingRuns = typeof busy.generatingRuns === "number" ? busy.generatingRuns : 0;
    const runningImports = Array.isArray(busy.runningImports)
      ? busy.runningImports.filter((s): s is string => typeof s === "string")
      : [];
    return generatingRuns > 0 || runningImports.length > 0
      ? { generatingRuns, runningImports }
      : null;
  }
  return null;
}

// null = not busy, or the instance cannot be asked (down or timed out). A
// server that cannot answer is often the reason for the restart, so it never
// blocks one.
export async function getInstanceBusy(port: number): Promise<InstanceBusy | null> {
  try {
    const response = await fetch(`http://localhost:${port}/health_check`, {
      headers: { "status-api-key": getConfig().statusApiKey },
      signal: AbortSignal.timeout(5000),
    });
    // Up but refusing the key: its work is unknown, so it counts as busy.
    if (response.status === 401) {
      await response.body?.cancel();
      return { generatingRuns: 0, runningImports: [], keyRejected: true };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const payload = await response.json();
    if (!payload || typeof payload !== "object") return null;
    return readBusy(payload as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** e.g. "generating 1 results package, importing hmis" */
export function describeBusy(busy: InstanceBusy): string {
  if (busy.keyRejected) {
    return "status key rejected, so running work could not be checked (rebuild wb with the current STATUS_API_KEY)";
  }
  const parts: string[] = [];
  if (busy.generatingRuns > 0) {
    parts.push(
      `generating ${busy.generatingRuns} results package${busy.generatingRuns === 1 ? "" : "s"}`,
    );
  }
  if (busy.runningImports.length > 0) {
    parts.push(`importing ${busy.runningImports.join(" and ")}`);
  }
  return parts.join(", ");
}
