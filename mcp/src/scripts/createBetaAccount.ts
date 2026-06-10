#!/usr/bin/env node
/**
 * Create an invite-only hosted MCP beta account.
 *
 * The raw token is printed once. Convex stores only a SHA-256 hash.
 */

import { randomBytes, createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { api, asId, convexMutation } from "../lib/convex-client.js";

loadEnv({ path: "../.env.local" });
loadEnv({ path: ".env.local" });

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  npm run beta:create -- --email=user@example.com --name=\"User Name\" [--projectId=...] [--notes=...]",
      "",
      "Required env:",
      "  CONVEX_URL",
    ].join("\n")
  );
  process.exit(1);
}

async function main() {
  const email = getArg("email")?.trim().toLowerCase();
  const displayName = getArg("name")?.trim();
  const projectId = getArg("projectId")?.trim();
  const notes = getArg("notes")?.trim();

  if (!email || !displayName) usage();

  const token = `cm_beta_${randomBytes(32).toString("base64url")}`;
  const tokenHash = hashToken(token);

  const result = await convexMutation(api.betaAccess.createBetaAccount, {
    email,
    displayName,
    tokenHash,
    tokenPrefix: token.slice(0, 10),
    projectId: projectId ? asId<"projects">(projectId) : undefined,
    notes,
    createdBy: "script",
  });

  console.log(
    JSON.stringify(
      {
        accountId: String(result.accountId),
        email,
        displayName,
        token,
        note: "Save this token now. Convex stores only its hash and it cannot be recovered later.",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
