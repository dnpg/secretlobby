/**
 * Read-side: "what plan is this account on" + "can they do X?"
 *
 * This is the SINGLE SOURCE OF TRUTH for plan-gating decisions across
 * the app. All limit-enforcement code paths must go through
 * `enforceAccountLimit` or `getCurrentSubscription` — never read
 * `Subscription` directly from feature code, because:
 *
 *   - There can be multiple Subscription rows per account (old cancelled
 *     ones, plus the active one). `getCurrentSubscription` picks the
 *     right one.
 *   - The "free" tier has no Subscription row at all. We synthesize a
 *     consistent shape for callers so they don't have to special-case.
 */

import { prisma, type SubscriptionPlan } from "@secretlobby/db";

export type LimitKind = "lobbies" | "songs";

export interface CurrentSubscription {
  /** The Subscription row id, or null for FREE accounts. */
  id: string | null;
  accountId: string;
  status:
    | "ACTIVE"
    | "TRIALING"
    | "PAST_DUE"
    | "CANCELLED"
    | "PAUSED"
    | "FREE";
  billingPeriod: "monthly" | "yearly" | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  plan: {
    id: string | null;
    slug: string; // 'FREE' for synthesized free plans
    name: string;
    priceMonthly: number;
    priceYearly: number;
    currency: string;
    maxSongs: number;
    maxLobbies: number;
    maxStorage: number;
    customDomain: boolean;
    apiAccess: boolean;
    features: string[];
  };
}

function planSelect(plan: SubscriptionPlan): CurrentSubscription["plan"] {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    currency: plan.currency,
    maxSongs: plan.maxSongs,
    maxLobbies: plan.maxLobbies,
    maxStorage: plan.maxStorage,
    customDomain: plan.customDomain,
    apiAccess: plan.apiAccess,
    features: Array.isArray(plan.features)
      ? (plan.features as string[])
      : [],
  };
}

/**
 * Hard-coded fallback for FREE-tier limits when no SubscriptionPlan
 * row with slug='FREE' exists in the database. Keeps the app
 * functional in fresh installs before the plan catalog is seeded.
 *
 * Once a FREE plan is created in super-admin, this fallback is no
 * longer used — the catalog wins.
 */
const FREE_FALLBACK: CurrentSubscription["plan"] = {
  id: null,
  slug: "FREE",
  name: "Free",
  priceMonthly: 0,
  priceYearly: 0,
  currency: "usd",
  maxSongs: 5,
  maxLobbies: 1,
  maxStorage: 100,
  customDomain: false,
  apiAccess: false,
  features: [],
};

/**
 * Resolve the canonical current subscription for an account.
 *
 * Selection rule: prefer an ACTIVE/TRIALING subscription; fall back to
 * PAST_DUE (we keep PAST_DUE accounts on their old plan until a
 * cancellation event arrives — Stripe dunning will eventually resolve
 * this either way). For all other statuses we treat the account as
 * FREE.
 */
export async function getCurrentSubscription(
  accountId: string
): Promise<CurrentSubscription> {
  const sub = await prisma.subscription.findFirst({
    where: {
      accountId,
      status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
    },
    orderBy: [
      // Most-recently-updated wins. Cancelled-then-resubscribed accounts
      // can have multiple rows; the one we mutated most recently is
      // the live one.
      { updatedAt: "desc" },
    ],
    include: { plan: true },
  });

  if (!sub) {
    const freePlan = await prisma.subscriptionPlan.findUnique({
      where: { slug: "FREE" },
    });
    return {
      id: null,
      accountId,
      status: "FREE",
      billingPeriod: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      plan: freePlan ? planSelect(freePlan) : FREE_FALLBACK,
    };
  }

  // The plan FK may be null on legacy rows; fall back to looking up by
  // the legacy `tier` enum. Worst case: we synthesize a FREE plan.
  let plan = sub.plan;
  if (!plan) {
    plan = await prisma.subscriptionPlan.findUnique({
      where: { slug: sub.tier },
    });
  }

  return {
    id: sub.id,
    accountId,
    status: sub.status,
    billingPeriod:
      sub.billingPeriod === "yearly"
        ? "yearly"
        : sub.billingPeriod === "monthly"
        ? "monthly"
        : null,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    plan: plan ? planSelect(plan) : FREE_FALLBACK,
  };
}

export interface LimitCheckResult {
  allowed: boolean;
  current: number;
  max: number; // -1 means unlimited
  kind: LimitKind;
  plan: CurrentSubscription["plan"];
}

/**
 * Plan-gating helper. Use this BEFORE creating a lobby/track to decide
 * whether the account is over their limit.
 *
 *   const limit = await enforceAccountLimit({ accountId, kind: "lobbies" });
 *   if (!limit.allowed) return { error: "Upgrade your plan", limit };
 *
 * NOTE: this is an advisory check, not a lock. Two simultaneous create
 * requests can both pass `allowed: true` and both insert. If you need
 * a hard limit you also need a row-count check inside the same
 * transaction as the insert. For lobbies/songs the cost of a single
 * over-limit insert is tolerable; we don't bother with the lock.
 */
export async function enforceAccountLimit(
  input: { accountId: string; kind: LimitKind }
): Promise<LimitCheckResult> {
  const { accountId, kind } = input;
  const sub = await getCurrentSubscription(accountId);

  const max =
    kind === "lobbies" ? sub.plan.maxLobbies : sub.plan.maxSongs;

  // -1 means unlimited per the schema convention.
  if (max === -1) {
    return { allowed: true, current: 0, max, kind, plan: sub.plan };
  }

  let current: number;
  if (kind === "lobbies") {
    current = await prisma.lobby.count({ where: { accountId } });
  } else {
    // songs = tracks across all lobbies of the account
    current = await prisma.track.count({
      where: { lobby: { accountId } },
    });
  }

  return {
    allowed: current < max,
    current,
    max,
    kind,
    plan: sub.plan,
  };
}
