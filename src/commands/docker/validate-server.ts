import { join } from "@std/path/join";
import { Config } from "../../core/config.ts";
import { Server } from "../../core/types.ts";
import { colors } from "../../utils/colors.ts";
import { extractPortFromNginxFile } from "../../utils/nginx-parser.ts";

export async function validateServerSetup(
  serverInfo: Server,
  config: Config,
): Promise<void> {
  const subdomain = `${serverInfo.id}.${config.domain}`;
  const port = serverInfo.port;

  console.log(colors.cyan("Validating server setup..."));

  // Check nginx configuration exists and matches port
  const nginxConfigPath = `${config.sitesAvailablePath}/${subdomain}`;
  try {
    const nginxPort = await extractPortFromNginxFile(nginxConfigPath);

    if (nginxPort !== null) {
      if (nginxPort === port) {
        console.log(colors.green(`✓ Nginx configuration matches port ${port}`));
      } else {
        console.log(
          colors.red(
            `✗ Nginx port mismatch: config has ${nginxPort}, server uses ${port}`,
          ),
        );
        console.log(
          colors.dim(`   Run: wb nginx ${serverInfo.id} to fix configuration`),
        );
        throw new Error(
          `Nginx configuration port mismatch for ${serverInfo.id}`,
        );
      }
    } else {
      console.log(
        colors.yellow(`⚠️  Warning: Cannot parse port from nginx config`),
      );
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(
        colors.yellow(
          `⚠️  Warning: No nginx configuration found for ${subdomain}`,
        ),
      );
      console.log(
        colors.dim(`   Run: wb nginx ${serverInfo.id} to create one`),
      );
    } else if (
      error instanceof Error &&
      error.message?.includes("port mismatch")
    ) {
      throw error; // Re-throw port mismatch errors to stop container startup
    } else {
      console.log(
        colors.yellow(`⚠️  Warning: Cannot check nginx configuration`),
      );
    }
  }

  // Check SSL certificate exists
  try {
    const certCmd = new Deno.Command("certbot", {
      args: ["certificates"],
      stdout: "piped",
      stderr: "piped",
    });
    const certResult = await certCmd.output();

    if (certResult.success) {
      const output = new TextDecoder().decode(certResult.stdout);
      if (!output.includes(`Certificate Name: ${subdomain}`)) {
        console.log(
          colors.yellow(
            `⚠️  Warning: No SSL certificate found for ${subdomain}`,
          ),
        );
        console.log(
          colors.dim(`   Run: wb ssl-init ${serverInfo.id} to create one`),
        );
      } else {
        console.log(colors.green(`✓ SSL certificate found for ${subdomain}`));
      }
    } else {
      console.log(
        colors.yellow(
          `⚠️  Warning: Cannot check SSL certificates (certbot not available)`,
        ),
      );
    }
  } catch {
    console.log(
      colors.yellow(
        `⚠️  Warning: Cannot check SSL certificates (certbot not available)`,
      ),
    );
  }

  // Check nginx is enabled
  const nginxEnabledPath = join(config.sitesEnabledPath, subdomain);
  try {
    await Deno.lstat(nginxEnabledPath);
    console.log(colors.green(`✓ Nginx site enabled for ${subdomain}`));
  } catch {
    console.log(
      colors.yellow(`⚠️  Warning: Nginx site not enabled for ${subdomain}`),
    );
    console.log(
      colors.dim(`   Run: wb nginx-init ${serverInfo.id} to enable it`),
    );
  }

  console.log(colors.dim(""));
}
