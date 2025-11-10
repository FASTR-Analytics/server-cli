import { Server } from "../core/types.ts";
import { colors } from "./colors.ts";
import { sortVersions } from "./version.ts";

export function formatServersTable(servers: Server[], runningContainers?: Set<string>): string {
  if (servers.length === 0) {
    return colors.dim("No servers configured.");
  }

  const headers = [
    "ID",
    "Label",
    "Server Version",
    "Admin Version",
    "Port",
    "Running",
    "Instance Dir",
    "French",
    "Ethiopian",
    "Open",
    "Tags",
  ];

  // Find column indices by header name
  const serverVersionIndex = headers.indexOf("Server Version");
  const adminVersionIndex = headers.indexOf("Admin Version");

  // Get unique versions and sort them semantically (descending for latest first)
  const serverVersions = sortVersions(
    [...new Set(servers.map((s) => s.serverVersion || ""))].filter(v => v),
    true
  );
  const adminVersions = sortVersions(
    [...new Set(servers.map((s) => s.adminVersion || ""))].filter(v => v),
    true
  );

  const getVersionColor = (version: string, versions: string[]) => {
    const index = versions.indexOf(version);

    if (versions.length === 1) {
      return colors.green; // Only one version, make it green
    } else if (versions.length === 2) {
      return index === 0 ? colors.green : colors.red; // Newest green, oldest red
    } else {
      // 3+ versions: newest green, second newest blue, oldest red, others dim (black-ish)
      if (index === 0) return colors.green; // Newest
      if (index === 1) return colors.blue; // Second newest
      if (index === versions.length - 1) return colors.red; // Oldest
      return colors.dim; // Middle versions (black-ish)
    }
  };

  const rows = servers.map((server) => [
    server.id,
    server.label,
    server.serverVersion || "",
    server.adminVersion || "",
    server.port?.toString() || "",
    runningContainers?.has(server.id) ? "✓" : "",
    server.instanceDir || server.id,
    server.french ? "✓" : "",
    server.ethiopian ? "✓" : "",
    server.openAccess ? "✓" : "",
    server.tags?.join(", ") || "",
  ]);

  const allRows = [headers, ...rows];

  const columnWidths = headers.map((_, colIndex) =>
    Math.max(...allRows.map((row) => row[colIndex].length))
  );

  const separator =
    "+" + columnWidths.map((w) => "-".repeat(w + 2)).join("+") + "+";

  const formatRow = (row: string[], isData = false) => {
    const formatted = row
      .map((cell, i) => {
        let formattedCell = cell;
        let paddingLength = columnWidths[i];

        // Apply colors to version columns if this is a data row
        if (isData && cell) {
          if (i === serverVersionIndex) {
            const colorFn = getVersionColor(cell, serverVersions);
            formattedCell = colorFn(cell);
            paddingLength =
              columnWidths[i] - cell.length + formattedCell.length;
          } else if (i === adminVersionIndex) {
            const colorFn = getVersionColor(cell, adminVersions);
            formattedCell = colorFn(cell);
            paddingLength =
              columnWidths[i] - cell.length + formattedCell.length;
          }
        }

        return ` ${formattedCell.padEnd(paddingLength)} `;
      })
      .join("|");
    return `|${formatted}|`;
  };

  const output = [
    separator,
    colors.bold(formatRow(headers)),
    separator,
    ...rows.map((row) => formatRow(row, true)),
    separator,
  ];

  return output.join("\n");
}
