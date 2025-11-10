import { ServerStore } from "../../core/server-store.ts";
import { colors } from "../../utils/colors.ts";

export async function handleConfigShow(
  filePath: string,
  id: string,
  options: { json?: boolean }
): Promise<void> {
  const store = new ServerStore(filePath);
  const server = await store.get(id);

  if (!server) {
    console.error(colors.red(`Error: Server '${id}' not found`));
    Deno.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(server, null, 2));
  } else {
    console.log(`
${colors.bold("Server Details:")}
  ${colors.cyan("ID:")}             ${server.id}
  ${colors.cyan("Label:")}          ${server.label}
  ${colors.cyan("Port:")}           ${server.port}
  ${colors.cyan("Instance Dir:")}   ${server.instanceDir || server.id}
  ${colors.cyan("Server Version:")} ${server.serverVersion || "latest"}
  ${colors.cyan("Admin Version:")}  ${server.adminVersion || "None"}
  ${colors.cyan("French:")}         ${server.french ? "Yes" : "No"}
  ${colors.cyan("Ethiopian:")}      ${server.ethiopian ? "Yes" : "No"}
  ${colors.cyan("Open Access:")}    ${server.openAccess ? "Yes" : "No"}
`);
  }
}