import { getConfig } from "../../core/config.ts";
import { ServerStore } from "../../core/server-store.ts";
import { resolveTargets } from "../../core/tag-resolver.ts";
import { colors } from "../../utils/colors.ts";

// Self-contained Deno script that runs inside each platform container.
// Reads PG_HOST/PG_PASSWORD/CLERK_SECRET_KEY from the container's env vars,
// fetches users with no name from the DB, looks them up in Clerk, and writes
// first_name/last_name back. Safe to re-run — WHERE first_name IS NULL means
// already-populated rows are never touched.
const BACKFILL_SCRIPT = `
import postgres from "npm:postgres@^3.4.5";

const PG_HOST = Deno.env.get("PG_HOST");
const PG_PORT = Number(Deno.env.get("PG_PORT") ?? "5432");
const PG_PASSWORD = Deno.env.get("PG_PASSWORD");
const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY");

if (!PG_HOST || !PG_PASSWORD || !CLERK_SECRET_KEY) {
  console.error("Missing required env vars: PG_HOST, PG_PASSWORD, CLERK_SECRET_KEY");
  Deno.exit(1);
}

const sql = postgres({
  user: "postgres",
  hostname: PG_HOST,
  password: PG_PASSWORD,
  port: PG_PORT,
  database: "main",
});

const rows = await sql\`SELECT email FROM users WHERE first_name IS NULL\`;

if (rows.length === 0) {
  console.log("No users with missing names. Done.");
  await sql.end();
  Deno.exit(0);
}

console.log(\`Found \${rows.length} user(s) to backfill...\`);

const BATCH_SIZE = 100;
let updated = 0;
let notFound = 0;

// Build a map of email -> clerk user by fetching one at a time.
// Clerk's bulk email filter (?email_address[]=...) does not filter reliably —
// it ignores the filter and returns arbitrary users. Fetching individually is
// slower but guarantees we only update the right rows.
for (const row of rows) {
  const params = new URLSearchParams();
  params.set("email_address", row.email);
  params.set("limit", "1");

  const res = await fetch(
    \`https://api.clerk.com/v1/users?\${params}\`,
    { headers: { Authorization: \`Bearer \${CLERK_SECRET_KEY}\` } },
  );

  if (!res.ok) {
    console.error(\`Clerk API error for \${row.email}: \${res.status} \${await res.text()}\`);
    continue;
  }

  const clerkUsers = await res.json();
  const clerkUser = clerkUsers[0];

  if (!clerkUser) {
    console.log(\`  - \${row.email} → not in Clerk (skipped)\`);
    notFound++;
    continue;
  }

  const result = await sql\`
    UPDATE users
    SET first_name = \${clerkUser.first_name}, last_name = \${clerkUser.last_name}
    WHERE email = \${row.email} AND first_name IS NULL
  \`;

  if (result.count > 0) {
    console.log(\`  ✓ \${row.email} → \${clerkUser.first_name} \${clerkUser.last_name}\`);
    updated++;
  } else {
    console.log(\`  ~ \${row.email} → already set (skipped)\`);
  }
}

console.log(\`Done. Updated: \${updated}, not in Clerk: \${notFound}\`);
await sql.end();
`;

export async function handleBackfillNames(targets: string[]): Promise<void> {
  const config = getConfig();
  const store = new ServerStore(config.serversFilePath);

  if (targets.length === 0) {
    console.error(colors.red("Error: Server ID(s) required"));
    console.error(colors.dim("Usage: wb backfill-names <id1> [id2 ...] | @tag | all"));
    Deno.exit(1);
  }

  const resolvedIds = await resolveTargets(store, targets);
  console.log(colors.bold(`Backfilling user names for ${resolvedIds.length} instance(s)...`));

  // Write the script to a temp file on the host once, then cp into each container
  const tmpPath = `/tmp/_backfill_user_names_${Date.now()}.ts`;
  await Deno.writeTextFile(tmpPath, BACKFILL_SCRIPT);

  try {
    for (const id of resolvedIds) {
      console.log(`\n${colors.cyan(`=== ${id} ===`)}`);

      const cp = new Deno.Command("docker", {
        args: ["cp", tmpPath, `${id}:/tmp/backfill_user_names.ts`],
        stdout: "piped",
        stderr: "piped",
      });
      const cpOut = await cp.output();
      if (!cpOut.success) {
        console.error(colors.red(`  docker cp failed: ${new TextDecoder().decode(cpOut.stderr).trim()}`));
        continue;
      }

      const exec = new Deno.Command("docker", {
        args: ["exec", id, "deno", "run", "--allow-net", "--allow-env", "/tmp/backfill_user_names.ts"],
        stdout: "inherit",
        stderr: "inherit",
      });
      await exec.output();

      const rm = new Deno.Command("docker", {
        args: ["exec", id, "rm", "/tmp/backfill_user_names.ts"],
        stdout: "piped",
        stderr: "piped",
      });
      await rm.output();
    }
  } finally {
    await Deno.remove(tmpPath).catch(() => {});
  }

  console.log(`\n${colors.bold("All done.")}`);
}
