// Production start (Railway): make sure the app's own database exists on the
// shared Postgres server, apply migrations, then start the server.
// With --prepare <file> it stops before the server and writes the app database's URL to <file>
// (mode 600, never logged): the Dockerfile exports it as DATABASE_URL, deletes the file and
// starts react-router-serve with exec, so the server gets Railway's SIGTERM itself and exits
// cleanly on a redeploy.
//
// DATABASE_URL points at the server (any database on it); SHOPIFY_DB_NAME
// (default "shopify_supertext") is the database this app uses there.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import pg from "pg";

const base = process.env.DATABASE_URL;
if (!base) {
  console.error("[supertext] DATABASE_URL is not set.");
  process.exit(1);
}
const name = process.env.SHOPIFY_DB_NAME || "shopify_supertext";
if (!/^[a-z0-9_]+$/.test(name)) {
  console.error("[supertext] SHOPIFY_DB_NAME may only contain a-z, 0-9 and _.");
  process.exit(1);
}

const url = new URL(base);
const client = new pg.Client({ connectionString: base });
await client.connect();
const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
if (!rowCount) {
  await client.query(`CREATE DATABASE "${name}"`);
  console.log(`[supertext] created database ${name}`);
}
await client.end();

url.pathname = `/${name}`;
const env = { ...process.env, DATABASE_URL: url.toString() };
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run("npx", ["prisma", "migrate", "deploy"]);

// Translations run inside the server process, so a restart (e.g. a deploy)
// stops them. Mark them so the merchant sees it and can start them again.
const app = new pg.Client({ connectionString: env.DATABASE_URL });
await app.connect();
const interrupted = await app.query(
  `UPDATE "TranslationJob"
      SET status = 'failed',
          errors = '[{"resource":"","locale":"","code":"interrupted","message":"Interrupted by an app update. Please start the translation again; finished items are kept."}]',
          "updatedAt" = NOW()
    WHERE status IN ('queued', 'running')`,
);
if (interrupted.rowCount) console.log(`[supertext] marked ${interrupted.rowCount} interrupted translation(s)`);
await app.end();
const prepare = process.argv.indexOf("--prepare");
if (prepare === -1) run("npx", ["react-router-serve", "./build/server/index.js"]);
else {
  const file = process.argv[prepare + 1];
  if (!file) {
    console.error("[supertext] --prepare needs a file for the database URL.");
    process.exit(1);
  }
  writeFileSync(file, env.DATABASE_URL, { mode: 0o600 });
}
