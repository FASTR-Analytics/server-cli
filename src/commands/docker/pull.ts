import { getConfig } from "../../core/config.ts";
import { IMAGES_TO_PULL } from "../../core/constants.ts";
import { loadServersFile } from "../../core/load-servers.ts";

export async function handlePull(): Promise<void> {
  const config = getConfig();
  const servers = await loadServersFile(config.serversFilePath);
  
  console.log("Pull containers");

  // Pull base images
  for await (const imageToPull of IMAGES_TO_PULL) {
    console.log(`Pulling: ${imageToPull}`);
    const cmd = new Deno.Command("docker", {
      args: ["pull", imageToPull],
    });
    const chd = cmd.spawn();
    await chd.output();
  }

  // Pull specific server versions from config
  const uniqueServerVersions = new Set<string>();
  const uniqueAdminVersions = new Set<string>();

  function getServerImageName(version: string): string {
    const [major, minor] = version.split('.').map(Number);
    const isNewVersion = major > 1 || (major === 1 && minor >= 6);
    const imageFamily = isNewVersion ? 'wb-fastr-server' : 'wb-hmis-server';
    return `timroberton/comb:${imageFamily}-v${version}`;
  }

  for (const server of servers) {
    if (server.serverVersion) {
      uniqueServerVersions.add(getServerImageName(server.serverVersion));
    }
    if (server.adminVersion) {
      // Admin is only for old versions (< 1.6), so always use wb-hmis-server-admin
      uniqueAdminVersions.add(
        `timroberton/comb:wb-hmis-server-admin-v${server.adminVersion}`
      );
    }
  }

  for (const versionedImage of uniqueServerVersions) {
    console.log(`Pulling server version: ${versionedImage}`);
    const cmd = new Deno.Command("docker", {
      args: ["pull", versionedImage],
    });
    const chd = cmd.spawn();
    await chd.output();
  }

  for (const versionedImage of uniqueAdminVersions) {
    console.log(`Pulling admin version: ${versionedImage}`);
    const cmd = new Deno.Command("docker", {
      args: ["pull", versionedImage],
    });
    const chd = cmd.spawn();
    await chd.output();
  }
}