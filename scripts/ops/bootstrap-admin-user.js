#!/usr/bin/env node
/**
 * Bootstrap an admin user in the production database.
 *
 * Usage:
 *   NODE_ENV=production DATABASE_URL=file:/var/lib/prostyle/prostyle.prod.db \
 *     node scripts/ops/bootstrap-admin-user.js <user-sub>
 *
 * <user-sub> is the Cognito subject (user_id) for the account to promote.
 * Retrieve it from the /api/auth/session endpoint while logged in:
 *   curl -s https://app.cheekymohnkey.com/api/auth/session  # requires session cookie
 *   or check the browser DevTools → Application → Cookies after login and hit the endpoint
 *
 * The script upserts the user row as role=admin / status=active.
 * It is idempotent — safe to run more than once.
 */

"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

function runSql(dbPath, sql, opts = {}) {
  const args = [];
  if (opts.json) args.push("-json");
  args.push(dbPath, sql);
  const result = spawnSync("sqlite3", args, { encoding: "utf8" });
  if (result.error) {
    throw new Error(`sqlite3 spawn error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "sqlite3 command failed").trim());
  }
  return result.stdout.trim();
}

function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl || !databaseUrl.startsWith("file:")) {
    throw new Error(`DATABASE_URL must be a SQLite file: URL, got: ${databaseUrl}`);
  }
  const value = databaseUrl.slice("file:".length);
  return path.isAbsolute(value) ? value : path.resolve(__dirname, "../..", value);
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function main() {
  const userId = (process.argv[2] || "").trim();
  if (!userId) {
    console.error("Usage: node scripts/ops/bootstrap-admin-user.js <cognito-sub>");
    console.error("");
    console.error("  Get your sub from: https://app.cheekymohnkey.com/api/auth/session");
    console.error("  Look for the 'subject' field in the JSON response.");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL environment variable is required.");
    console.error("  Example: DATABASE_URL=file:/var/lib/prostyle/prostyle.prod.db node ...");
    process.exit(1);
  }

  const dbPath = parseDatabaseUrl(databaseUrl);
  const now = new Date().toISOString();

  console.log(`Database : ${dbPath}`);
  console.log(`User ID  : ${userId}`);
  console.log("");

  // Upsert the user as admin/active — creates the row if it doesn't exist yet,
  // or upgrades an existing consumer/contributor row.
  runSql(
    dbPath,
    `INSERT INTO users (user_id, role, status, created_at, updated_at)
     VALUES (${quote(userId)}, 'admin', 'active', ${quote(now)}, ${quote(now)})
     ON CONFLICT(user_id) DO UPDATE SET
       role = 'admin',
       status = 'active',
       updated_at = ${quote(now)};`
  );

  // Confirm by reading back the row
  const result = runSql(
    dbPath,
    `SELECT user_id, role, status, created_at, updated_at
     FROM users
     WHERE user_id = ${quote(userId)};`,
    { json: true }
  );

  const rows = JSON.parse(result || "[]");
  if (rows.length === 0) {
    console.error("ERROR: User row not found after upsert. Check DB path and table schema.");
    process.exit(1);
  }

  const row = rows[0];
  console.log("Success! User provisioned as admin:");
  console.log(`  user_id  : ${row.user_id}`);
  console.log(`  role     : ${row.role}`);
  console.log(`  status   : ${row.status}`);
  console.log(`  updated  : ${row.updated_at}`);
}

main();
