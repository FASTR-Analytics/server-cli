import { dirname, join } from "@std/path";
import { ServerStore } from "../core/server-store.ts";
import { colors } from "../utils/colors.ts";

export async function handleInitNginx(
  filePath: string,
  serverId: string,
  domain: string,
  sitesAvailablePath: string,
  sitesEnabledPath: string
): Promise<void> {
  const store = new ServerStore(filePath);
  const server = await store.get(serverId);

  if (!server) {
    console.error(colors.red(`Error: Server '${serverId}' not found`));
    console.error(colors.dim("Please add the server first using: wb config add <id>"));
    Deno.exit(1);
  }

  const subdomain = `${serverId}.${domain}`;
  const port = server.port;
  const nginxFileText = `server {
  listen 80;
  server_name ${subdomain};
  location / {
    proxy_pass http://localhost:${port};
    proxy_buffering off;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  error_page 502 503 504 /502.html;
  location = /502.html {
    alias /var/www/html/502.html;
    internal;
  }
}
`;

  console.log(colors.cyan(`Setting up nginx for ${serverId}...`));
  console.log(colors.dim(`Domain: ${subdomain}`));

  // Ensure the WebSocket upgrade map exists (must live in the http context, so
  // it goes in conf.d). The Upgrade/Connection headers in the location block
  // above reference $connection_upgrade, which this map defines. Idempotent.
  const confDPath = join(dirname(sitesAvailablePath), "conf.d");
  const wsMapPath = join(confDPath, "websocket_upgrade.conf");
  const wsMapText = `map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
`;
  try {
    await Deno.lstat(wsMapPath);
    console.log(colors.yellow(`✓ WebSocket upgrade map already exists`));
  } catch {
    try {
      await Deno.mkdir(confDPath, { recursive: true });
    } catch {
      // conf.d already exists
    }
    await Deno.writeTextFile(wsMapPath, wsMapText);
    console.log(colors.green(`✓ Created WebSocket upgrade map (conf.d)`));
  }

  const maintenancePagePath = "/var/www/html/502.html";
  const maintenancePageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Under Maintenance</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      color: #1f2937;
      background: #fff;
    }
    .wrap { display: flex; height: 100%; width: 100%; }
    .panel-left {
      position: relative;
      width: 40%;
      background: #ebf3f1;
      overflow: hidden;
      display: none;
    }
    .panel-left .circle-1 {
      position: absolute; bottom: -25%; left: -25%;
      width: 80%; aspect-ratio: 1;
      border-radius: 50%; background: #d6e8e4;
    }
    .panel-left .circle-2 {
      position: absolute; top: -25%; right: -25%;
      width: 60%; aspect-ratio: 1;
      border-radius: 50%; background: #ddecea;
    }
    .panel-left .inner {
      position: relative; z-index: 1;
      display: flex; flex-direction: column;
      justify-content: space-between;
      width: 100%; height: 100%;
      padding: 2.5rem;
    }
    .brand { font-weight: 800; font-size: 1rem; letter-spacing: 0.02em; color: #1f2937; }
    .headline { font-weight: 800; font-size: 3rem; line-height: 1.1; color: #1f2937; }
    .subhead { margin-top: 0.75rem; font-size: 1.125rem; color: rgba(31, 41, 55, 0.5); }
    .footer-text { font-size: 0.75rem; color: #6b7280; }
    .panel-right {
      flex: 1;
      display: flex; align-items: center; justify-content: center;
      padding: 2rem; overflow-y: auto;
    }
    .card { width: 100%; max-width: 28rem; text-align: center; }
    .card .mobile-brand { display: block; margin-bottom: 2rem; }
    .card .mobile-brand .title { font-weight: 700; font-size: 1.25rem; color: #1f2937; }
    .card .mobile-brand .sub { font-size: 0.875rem; color: #6b7280; }
    .card h1 { font-weight: 800; font-size: 1.75rem; color: #1f2937; margin-bottom: 0.75rem; }
    .card p { font-size: 1rem; line-height: 1.6; color: #6b7280; margin-bottom: 0.5rem; }
    .divider {
      height: 3px; width: 48px;
      background: #9ac8bd; border-radius: 2px;
      margin: 0 auto 1.5rem;
    }
    @media (min-width: 1024px) {
      .panel-left { display: flex; }
      .card .mobile-brand { display: none; }
      .card { text-align: left; }
      .divider { margin-left: 0; margin-right: 0; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="panel-left">
      <div class="circle-1"></div>
      <div class="circle-2"></div>
      <div class="inner">
        <div class="brand">FASTR</div>
        <div>
          <div class="headline">Back in a few minutes</div>
          <div class="subhead">We'll be back shortly</div>
        </div>
        <div class="footer-text">Powered by FASTR</div>
      </div>
    </div>
    <div class="panel-right">
      <div class="card">
        <div class="mobile-brand">
          <div class="title">FASTR</div>
          <div class="sub">Analytics platform</div>
        </div>
        <div class="divider"></div>
        <h1>Back in a few minutes</h1>
        <p>This site is temporarily unavailable while we make improvements.</p>
        <p>Please check back and refresh in a few minutes.</p>
      </div>
    </div>
  </div>
</body>
</html>
`;

  try {
    await Deno.lstat(maintenancePagePath);
    console.log(colors.yellow(`✓ Maintenance page already exists`));
  } catch {
    await Deno.writeTextFile(maintenancePagePath, maintenancePageHtml);
    console.log(colors.green(`✓ Created maintenance page`));
  }

  const nginxFilePath = join(sitesAvailablePath, subdomain);
  
  try {
    await Deno.lstat(nginxFilePath);
    console.log(colors.yellow(`✓ Nginx config already exists`));
  } catch {
    await Deno.writeTextFile(nginxFilePath, nginxFileText);
    console.log(colors.green(`✓ Created nginx config`));
  }

  const nginxSymlinkPath = join(sitesEnabledPath, subdomain);
  
  try {
    await Deno.lstat(nginxSymlinkPath);
    await Deno.remove(nginxSymlinkPath);
    console.log(colors.yellow(`✓ Removed existing symlink`));
  } catch {
    // Symlink doesn't exist
  }
  
  await Deno.symlink(nginxFilePath, nginxSymlinkPath);
  console.log(colors.green(`✓ Created symlink in sites-enabled`));

  console.log(colors.cyan(`\nRestarting nginx...`));
  const cmd = new Deno.Command("service", {
    args: ["nginx", "restart"],
  });
  const child = cmd.spawn();
  const output = await child.output();
  
  if (!output.success) {
    console.error(colors.red("Failed to restart nginx"));
    console.error(colors.dim("You may need to restart nginx manually: sudo service nginx restart"));
  } else {
    console.log(colors.green(`✓ Nginx restarted successfully`));
  }
  
  console.log(colors.green(`\n✓ Nginx setup complete for ${serverId}`));
  console.log(colors.dim(`Site will be available at: http://${subdomain}`));
}

export async function handleRemoveNginx(
  filePath: string,
  serverId: string,
  domain: string,
  sitesAvailablePath: string,
  sitesEnabledPath: string
): Promise<void> {
  const store = new ServerStore(filePath);
  const server = await store.get(serverId);

  if (!server) {
    console.error(colors.red(`Error: Server '${serverId}' not found`));
    Deno.exit(1);
  }

  const subdomain = `${serverId}.${domain}`;
  
  console.log(colors.cyan(`Removing nginx configuration for ${serverId}...`));
  console.log(colors.dim(`Domain: ${subdomain}`));

  const nginxSymlinkPath = join(sitesEnabledPath, subdomain);
  try {
    await Deno.remove(nginxSymlinkPath);
    console.log(colors.green(`✓ Removed symlink from sites-enabled`));
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      console.error(colors.yellow(`Warning: Could not remove symlink: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  const nginxFilePath = join(sitesAvailablePath, subdomain);
  try {
    await Deno.remove(nginxFilePath);
    console.log(colors.green(`✓ Removed nginx config from sites-available`));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.log(colors.yellow(`Nginx config does not exist`));
    } else {
      console.error(colors.red(`Error removing nginx config: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  console.log(colors.cyan(`\nRestarting nginx...`));
  const cmd = new Deno.Command("service", {
    args: ["nginx", "restart"],
  });
  const child = cmd.spawn();
  const output = await child.output();
  
  if (!output.success) {
    console.error(colors.red("Failed to restart nginx"));
    console.error(colors.dim("You may need to restart nginx manually: sudo service nginx restart"));
  } else {
    console.log(colors.green(`✓ Nginx restarted successfully`));
  }
  
  console.log(colors.green(`\n✓ Nginx removal complete for ${serverId}`));
}