import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const DEFAULT_DAILY_LIMIT = 20;
const DEFAULT_HOURLY_LIMIT = 5;
const DEFAULT_ACTIVE_LIMIT = 1;
const GLOBAL_DAILY_LIMIT = 200;

function startOfUtcDay(now: number): number {
  const date = new Date(now);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
}

function previewQuestion(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
}

async function countAccountEventsSince(
  ctx: any,
  accountId: any,
  since: number
): Promise<number> {
  const rows = await ctx.db
    .query("betaUsageEvents")
    .withIndex("by_account_startedAt", (q: any) =>
      q.eq("accountId", accountId).gte("startedAt", since)
    )
    .collect();

  return rows.filter((row: any) => row.status !== "rejected").length;
}

async function countGlobalEventsSince(ctx: any, since: number): Promise<number> {
  const rows = await ctx.db
    .query("betaUsageEvents")
    .withIndex("by_startedAt", (q: any) => q.gte("startedAt", since))
    .collect();

  return rows.filter((row: any) => row.status !== "rejected").length;
}

async function countActiveAccountEvents(ctx: any, accountId: any): Promise<number> {
  const rows = await ctx.db
    .query("betaUsageEvents")
    .withIndex("by_account_status", (q: any) =>
      q.eq("accountId", accountId).eq("status", "active")
    )
    .collect();

  return rows.length;
}

async function recordRejected(
  ctx: any,
  args: {
    accountId?: any;
    projectId?: any;
    toolName: string;
    requestId: string;
    tokenPrefix?: string;
    questionPreview?: string;
    rejectionReason: string;
    now: number;
  }
) {
  await ctx.db.insert("betaUsageEvents", {
    accountId: args.accountId,
    projectId: args.projectId,
    toolName: args.toolName,
    requestId: args.requestId,
    tokenPrefix: args.tokenPrefix,
    questionPreview: previewQuestion(args.questionPreview),
    status: "rejected",
    rejectionReason: args.rejectionReason,
    startedAt: args.now,
  });
}

function publicAccount(account: any) {
  return {
    accountId: String(account._id),
    email: account.email,
    displayName: account.displayName,
    status: account.status,
    projectId: account.projectId ? String(account.projectId) : undefined,
    limits: {
      daily: account.dailyLimit,
      hourly: account.hourlyLimit,
      active: account.activeLimit,
      globalDaily: GLOBAL_DAILY_LIMIT,
    },
  };
}

export const createBetaAccount = mutation({
  args: {
    email: v.string(),
    displayName: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    projectId: v.optional(v.id("projects")),
    dailyLimit: v.optional(v.number()),
    hourlyLimit: v.optional(v.number()),
    activeLimit: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("betaAccounts")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    if (existing) {
      throw new Error("A beta account already exists for this token hash.");
    }

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) throw new Error(`Project not found: ${args.projectId}`);
    }

    const accountId = await ctx.db.insert("betaAccounts", {
      email: args.email.trim().toLowerCase(),
      displayName: args.displayName.trim(),
      tokenHash: args.tokenHash,
      tokenPrefix: args.tokenPrefix,
      status: "active",
      projectId: args.projectId,
      dailyLimit: args.dailyLimit ?? DEFAULT_DAILY_LIMIT,
      hourlyLimit: args.hourlyLimit ?? DEFAULT_HOURLY_LIMIT,
      activeLimit: args.activeLimit ?? DEFAULT_ACTIVE_LIMIT,
      createdAt: Date.now(),
      createdBy: args.createdBy,
      notes: args.notes,
    });

    return { accountId };
  },
});

export const validateBetaToken = query({
  args: {
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("betaAccounts")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    if (!account || account.status !== "active") {
      return { valid: false as const };
    }

    return { valid: true as const, account: publicAccount(account) };
  },
});

export const authenticateAndStartRequest = mutation({
  args: {
    tokenHash: v.string(),
    tokenPrefix: v.optional(v.string()),
    toolName: v.string(),
    requestId: v.string(),
    projectId: v.optional(v.id("projects")),
    questionPreview: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const account = await ctx.db
      .query("betaAccounts")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    if (!account) {
      await recordRejected(ctx, {
        toolName: args.toolName,
        requestId: args.requestId,
        tokenPrefix: args.tokenPrefix,
        questionPreview: args.questionPreview,
        rejectionReason: "invalid_token",
        now,
      });
      return { allowed: false as const, reason: "invalid_token" };
    }

    if (account.status !== "active") {
      await recordRejected(ctx, {
        accountId: account._id,
        projectId: account.projectId ?? args.projectId,
        toolName: args.toolName,
        requestId: args.requestId,
        tokenPrefix: account.tokenPrefix,
        questionPreview: args.questionPreview,
        rejectionReason: "account_disabled",
        now,
      });
      return { allowed: false as const, reason: "account_disabled" };
    }

    const projectId = account.projectId ?? args.projectId;
    if (!projectId) {
      await recordRejected(ctx, {
        accountId: account._id,
        toolName: args.toolName,
        requestId: args.requestId,
        tokenPrefix: account.tokenPrefix,
        questionPreview: args.questionPreview,
        rejectionReason: "project_not_configured",
        now,
      });
      return { allowed: false as const, reason: "project_not_configured" };
    }

    const [hourlyCount, dailyCount, globalDailyCount, activeCount] =
      await Promise.all([
        countAccountEventsSince(ctx, account._id, now - 60 * 60 * 1000),
        countAccountEventsSince(ctx, account._id, startOfUtcDay(now)),
        countGlobalEventsSince(ctx, startOfUtcDay(now)),
        countActiveAccountEvents(ctx, account._id),
      ]);

    const reject = async (reason: string) => {
      await recordRejected(ctx, {
        accountId: account._id,
        projectId,
        toolName: args.toolName,
        requestId: args.requestId,
        tokenPrefix: account.tokenPrefix,
        questionPreview: args.questionPreview,
        rejectionReason: reason,
        now,
      });
      return {
        allowed: false as const,
        reason,
        account: publicAccount(account),
        usage: {
          hourlyCount,
          dailyCount,
          globalDailyCount,
          activeCount,
        },
      };
    };

    if (activeCount >= account.activeLimit) {
      return await reject("active_limit_exceeded");
    }
    if (hourlyCount >= account.hourlyLimit) {
      return await reject("hourly_limit_exceeded");
    }
    if (dailyCount >= account.dailyLimit) {
      return await reject("daily_limit_exceeded");
    }
    if (globalDailyCount >= GLOBAL_DAILY_LIMIT) {
      return await reject("global_daily_limit_exceeded");
    }

    const usageEventId = await ctx.db.insert("betaUsageEvents", {
      accountId: account._id,
      projectId,
      toolName: args.toolName,
      requestId: args.requestId,
      tokenPrefix: account.tokenPrefix,
      questionPreview: previewQuestion(args.questionPreview),
      status: "active",
      startedAt: now,
    });

    await ctx.db.patch(account._id, { lastUsedAt: now });

    return {
      allowed: true as const,
      usageEventId,
      projectId,
      account: publicAccount(account),
      usage: {
        hourlyCount: hourlyCount + 1,
        dailyCount: dailyCount + 1,
        globalDailyCount: globalDailyCount + 1,
        activeCount: activeCount + 1,
      },
    };
  },
});

export const finishRequest = mutation({
  args: {
    usageEventId: v.id("betaUsageEvents"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    responseChars: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.usageEventId);
    if (!event) throw new Error(`Usage event not found: ${args.usageEventId}`);

    await ctx.db.patch(args.usageEventId, {
      status: args.status,
      completedAt: Date.now(),
      responseChars: args.responseChars,
      errorMessage: args.errorMessage,
    });

    return { usageEventId: args.usageEventId, status: args.status };
  },
});

export const listBetaAccounts = query({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("betaAccounts").collect();
    return accounts.map(publicAccount);
  },
});

export const disableBetaAccount = mutation({
  args: {
    accountId: v.id("betaAccounts"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new Error(`Beta account not found: ${args.accountId}`);

    await ctx.db.patch(args.accountId, {
      status: "disabled",
      notes: args.reason
        ? [account.notes, `Disabled: ${args.reason}`].filter(Boolean).join("\n")
        : account.notes,
    });

    return {
      accountId: args.accountId,
      status: "disabled",
    };
  },
});
