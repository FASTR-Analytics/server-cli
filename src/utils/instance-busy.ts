/** Work in progress on an instance that a restart or stop would kill. */
export type InstanceBusy = { generatingRuns: number; runningImports: string[] };

// null = not busy. A v1 payload (1.76.x) reports only `hasRunningModules`: it
// can report a generation but never an import, so on v1 a running import is
// invisible to the gate. A payload with neither field is not busy.
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
  if (payload.hasRunningModules === true) {
    return { generatingRuns: 1, runningImports: [] };
  }
  return null;
}

// null = not busy, or the instance cannot be asked (down or timed out). A
// server that cannot answer is often the reason for the restart, so it never
// blocks one.
export async function getInstanceBusy(port: number): Promise<InstanceBusy | null> {
  try {
    const response = await fetch(`http://localhost:${port}/health_check`, {
      signal: AbortSignal.timeout(5000),
    });
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
