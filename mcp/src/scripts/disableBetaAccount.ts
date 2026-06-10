#!/usr/bin/env node
/**
 * Disable an invite-only hosted MCP beta account.
 */

import { config as loadEnv } from "dotenv";
import { api, asId, convexMutation } from "../lib/convex-client.js";

loadEnv({ path: "../.env.local" });
loadEnv({ path: ".env.local" });

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  npm run beta:disable -- --accountId=ACCOUNT_ID [--reason=\"...\"]",
      "",
      "Required env:",
      "  CONVEX_URL",
    ].join("\n")
  );
  process.exit(1);
}

async function main() {
  const accountId = getArg("accountId")?.trim();
  const reason = getArg("reason")?.trim();

  if (!accountId) usage();

  const result = await convexMutation(api.betaAccess.disableBetaAccount, {
    accountId: asId<"betaAccounts">(accountId),
    reason,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

