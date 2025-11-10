import { ServerStore } from "../core/server-store.ts";
import { colors } from "../utils/colors.ts";

export async function handleInitSsl(
  filePath: string,
  serverId: string,
  domain: string
): Promise<void> {
  const store = new ServerStore(filePath);
  const server = await store.get(serverId);

  if (!server) {
    console.error(colors.red(`Error: Server '${serverId}' not found`));
    console.error(colors.dim("Please add the server first using: wb config add <id>"));
    Deno.exit(1);
  }

  const subdomain = `${serverId}.${domain}`;
  
  console.log(colors.cyan(`Setting up SSL certificate for ${serverId}...`));
  console.log(colors.dim(`Domain: ${subdomain}`));
  console.log(colors.yellow(`\nNote: Nginx must be configured and the domain must be pointing to this server`));

  console.log(colors.cyan(`\nRunning certbot for ${subdomain}...`));
  
  const cmd = new Deno.Command("certbot", {
    args: ["--nginx", "-d", subdomain],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  
  const child = cmd.spawn();
  const output = await child.output();
  
  if (!output.success) {
    console.error(colors.red(`\nFailed to setup SSL certificate`));
    console.error(colors.dim("Make sure:"));
    console.error(colors.dim("  1. Certbot is installed"));
    console.error(colors.dim("  2. Nginx is configured for this domain"));
    console.error(colors.dim(`  3. DNS is pointing ${subdomain} to this server`));
    console.error(colors.dim("  4. Port 80 is accessible from the internet"));
    Deno.exit(1);
  }
  
  console.log(colors.green(`\n✓ SSL certificate setup complete for ${serverId}`));
  console.log(colors.dim(`Site is now available at: https://${subdomain}`));
}

export async function handleRemoveSsl(
  filePath: string,
  serverId: string,
  domain: string
): Promise<void> {
  const store = new ServerStore(filePath);
  const server = await store.get(serverId);

  if (!server) {
    console.error(colors.red(`Error: Server '${serverId}' not found`));
    Deno.exit(1);
  }

  const subdomain = `${serverId}.${domain}`;
  
  console.log(colors.cyan(`Removing SSL certificate for ${serverId}...`));
  console.log(colors.dim(`Domain: ${subdomain}`));
  
  console.log(colors.yellow(`\n⚠️  WARNING: This will revoke and delete the SSL certificate for ${subdomain}`));
  console.log(colors.cyan(`Type "revoke ${serverId}" to confirm, or anything else to cancel:`));
  
  const confirmation = prompt("> ");
  
  if (confirmation !== `revoke ${serverId}`) {
    console.log(colors.green("✓ Revocation cancelled"));
    Deno.exit(0);
  }

  console.log(colors.cyan(`\nRevoking certificate with certbot...`));
  
  const cmd = new Deno.Command("certbot", {
    args: ["revoke", "--cert-name", subdomain, "--delete-after-revoke"],
    stdin: "inherit",
    stdout: "inherit", 
    stderr: "inherit",
  });
  
  const child = cmd.spawn();
  const output = await child.output();
  
  if (!output.success) {
    console.log(colors.yellow(`\nCertificate revocation may have failed or certificate may not exist`));
    console.log(colors.dim("You can check existing certificates with: sudo certbot certificates"));
  } else {
    console.log(colors.green(`\n✓ SSL certificate removed for ${serverId}`));
  }
}