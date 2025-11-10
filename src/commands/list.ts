import { colors } from "../utils/colors.ts";
import { extractPortFromNginxFile } from "../utils/nginx-parser.ts";

export async function handleListSsl(): Promise<void> {
  console.log(colors.cyan("Listing SSL certificates..."));
  console.log(colors.dim("Using: certbot certificates\n"));
  
  const cmd = new Deno.Command("certbot", {
    args: ["certificates"],
    stdout: "piped",
    stderr: "piped",
  });
  
  try {
    const { stdout, stderr, success } = await cmd.output();
    
    if (!success) {
      const errorText = new TextDecoder().decode(stderr);
      if (errorText.includes("command not found")) {
        console.error(colors.red("Error: Certbot is not installed"));
        console.error(colors.dim("Install with: sudo apt install certbot python3-certbot-nginx"));
      } else if (errorText.includes("Permission denied") || errorText.includes("root")) {
        console.error(colors.red("Error: This command requires sudo privileges"));
        console.error(colors.dim("Try running: sudo wb list-ssl"));
      } else {
        console.error(colors.red("Error running certbot:"));
        console.error(errorText);
      }
      Deno.exit(1);
    }
    
    const output = new TextDecoder().decode(stdout);
    console.log(output);
    
    // Parse and highlight relevant info
    const certificates = output.split("Certificate Name:");
    if (certificates.length > 1) {
      console.log(colors.green(`\n✓ Found ${certificates.length - 1} certificate(s)`));
    } else {
      console.log(colors.yellow("\nNo certificates found"));
    }
  } catch (error) {
    console.error(colors.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    Deno.exit(1);
  }
}

async function getServerIdFromFilename(filename: string, domain: string): Promise<string | null> {
  if (filename.endsWith(`.${domain}`)) {
    return filename.slice(0, -(domain.length + 1));
  }
  return null;
}


export async function handleListNginx(
  sitesAvailablePath: string,
  sitesEnabledPath: string,
  domain: string
): Promise<void> {
  console.log(colors.cyan("Listing nginx configurations..."));
  console.log(colors.dim(`Domain: ${domain}\n`));

  // List sites-available
  console.log(colors.bold("Sites Available:"));
  try {
    const availableEntries = [];
    for await (const entry of Deno.readDir(sitesAvailablePath)) {
      if (entry.isFile && entry.name.includes(domain)) {
        const _serverId = await getServerIdFromFilename(entry.name, domain);
        const filePath = `${sitesAvailablePath}/${entry.name}`;
        const port = await extractPortFromNginxFile(filePath);
        availableEntries.push({ name: entry.name, port });
      }
    }

    if (availableEntries.length === 0) {
      console.log(colors.dim("  No sites found"));
    } else {
      for (const site of availableEntries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (site.port) {
          console.log(`  ${colors.cyan(site.name)} ${colors.dim("→")} ${colors.yellow(`port ${site.port}`)}`);
        } else {
          console.log(`  ${colors.cyan(site.name)}`);
        }
      }
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(colors.yellow(`  Directory not found: ${sitesAvailablePath}`));
    } else {
      console.error(colors.red(`  Error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  // List sites-enabled
  console.log(colors.bold("\nSites Enabled:"));
  try {
    const enabledEntries = [];
    for await (const entry of Deno.readDir(sitesEnabledPath)) {
      if (entry.name.includes(domain)) {
        // Check if it's a symlink
        const linkPath = `${sitesEnabledPath}/${entry.name}`;
        try {
          const linkInfo = await Deno.lstat(linkPath);
          let target = null;

          if (linkInfo.isSymlink) {
            target = await Deno.readLink(linkPath);
          }

          const _serverId = await getServerIdFromFilename(entry.name, domain);
          const filePath = target || `${sitesEnabledPath}/${entry.name}`;
          const port = await extractPortFromNginxFile(filePath);

          enabledEntries.push({ name: entry.name, target, port });
        } catch {
          enabledEntries.push({ name: entry.name, target: null, port: null });
        }
      }
    }

    if (enabledEntries.length === 0) {
      console.log(colors.dim("  No sites found"));
    } else {
      for (const site of enabledEntries.sort((a, b) => a.name.localeCompare(b.name))) {
        const portInfo = site.port ? ` ${colors.dim("→")} ${colors.yellow(`port ${site.port}`)}` : "";
        if (site.target) {
          console.log(`  ${colors.green(site.name)}${portInfo} ${colors.dim("(symlink)")}`);
        } else {
          console.log(`  ${colors.green(site.name)}${portInfo}`);
        }
      }
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(colors.yellow(`  Directory not found: ${sitesEnabledPath}`));
    } else {
      console.error(colors.red(`  Error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  
  // Show all nginx sites (not just our domain)
  console.log(colors.bold("\nAll Nginx Sites:"));
  const cmd = new Deno.Command("ls", {
    args: ["-la", sitesEnabledPath],
    stdout: "piped",
    stderr: "piped",
  });
  
  try {
    const { stdout, success } = await cmd.output();
    if (success) {
      const output = new TextDecoder().decode(stdout);
      const lines = output.split("\n").slice(1); // Skip total line
      let count = 0;
      for (const line of lines) {
        if (line.trim() && !line.includes(".") && !line.includes("..")) {
          count++;
        }
      }
      console.log(colors.dim(`  Total: ${count} site(s) configured`));
    }
  } catch {
    // Ignore errors for this optional check
  }
  
  console.log(colors.green(`\n✓ Nginx configuration list complete`));
}