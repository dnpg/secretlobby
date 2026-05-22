import { useLoaderData } from "react-router";
import type { Route } from "./+types/_layout.accounts.$accountId._index";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Account Details - Super Admin" }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { accountId } = params;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      _count: {
        select: {
          users: true,
          lobbies: true,
          media: true,
        },
      },
      domains: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!account) {
    throw new Response("Account not found", { status: 404 });
  }

  // Read-only view of subscription state for this account. Includes the
  // canonical Subscription row (the one ACTIVE/TRIALING/PAST_DUE, if
  // any) plus the last 10 payments. Super-admin can use this to
  // diagnose dunning issues without poking the production Stripe
  // dashboard.
  const [subscription, recentPayments] = await Promise.all([
    prisma.subscription.findFirst({
      where: {
        accountId,
        status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] },
      },
      orderBy: { updatedAt: "desc" },
      include: { plan: true },
    }),
    prisma.paymentHistory.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Get base domain from environment
  const baseDomain = process.env.CORE_DOMAIN || "secretlobby.co";

  // Detect if we're in local development
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const isLocalDev = hostname.includes("localhost") || hostname.includes(".local");
  const protocol = isLocalDev ? "http" : "https";

  return {
    account,
    baseDomain,
    protocol,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          billingPeriod: subscription.billingPeriod,
          currentPeriodStart: subscription.currentPeriodStart.toISOString(),
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          gatewayId: subscription.gatewayId,
          gatewaySubscriptionId: subscription.gatewaySubscriptionId,
          gatewayCustomerId: subscription.gatewayCustomerId,
          gatewayPriceId: subscription.gatewayPriceId,
          planName: subscription.plan?.name ?? subscription.tier,
          planSlug: subscription.plan?.slug ?? subscription.tier,
          lastEventAt: subscription.lastEventAt?.toISOString() ?? null,
          createdAt: subscription.createdAt.toISOString(),
          updatedAt: subscription.updatedAt.toISOString(),
        }
      : null,
    recentPayments: recentPayments.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      gatewayPaymentId: p.gatewayPaymentId,
      description: p.description,
      createdAt: p.createdAt.toISOString(),
      invoiceUrl: p.invoiceUrl,
    })),
  };
}

function formatCurrency(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export default function AccountDetails() {
  const { account, baseDomain, protocol, subscription, recentPayments } =
    useLoaderData<typeof loader>();

  const primaryDomain = account.domains.find(d => d.status === "VERIFIED")?.domain
    || `${account.slug}.${baseDomain}`;

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-2xl font-bold">{account._count.users}</div>
          <div className="text-sm text-theme-secondary">Users</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold">{account._count.lobbies}</div>
          <div className="text-sm text-theme-secondary">Lobbies</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold">{account._count.media}</div>
          <div className="text-sm text-theme-secondary">Media Files</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold">{account.domains.length}</div>
          <div className="text-sm text-theme-secondary">Domains</div>
        </div>
      </div>

      {/* Account Information */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Account Information</h3>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-theme-secondary">Account ID</dt>
            <dd className="font-mono text-sm">{account.id}</dd>
          </div>
          <div>
            <dt className="text-sm text-theme-secondary">Name</dt>
            <dd>{account.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-theme-secondary">Slug</dt>
            <dd className="font-mono">{account.slug}</dd>
          </div>
          <div>
            <dt className="text-sm text-theme-secondary">Subscription Tier</dt>
            <dd>
              <span className="px-2 py-1 text-xs rounded-full bg-theme-tertiary">
                {account.subscriptionTier}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-theme-secondary">Primary Domain</dt>
            <dd>
              <a
                href={`${protocol}://${primaryDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link-primary transition"
              >
                {primaryDomain}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-theme-secondary">Created</dt>
            <dd>{new Date(account.createdAt).toLocaleString()}</dd>
          </div>
          {account.stripeCustomerId && (
            <div>
              <dt className="text-sm text-theme-secondary">Stripe Customer ID</dt>
              <dd className="font-mono text-sm">{account.stripeCustomerId}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Subscription (read-only diagnostic view) */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Subscription</h3>
        {subscription ? (
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-theme-secondary">Plan</dt>
              <dd>
                {subscription.planName}{" "}
                <span className="text-xs text-theme-muted font-mono">
                  ({subscription.planSlug})
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-theme-secondary">Status</dt>
              <dd>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    subscription.status === "ACTIVE"
                      ? "bg-green-500/20 text-green-400"
                      : subscription.status === "PAST_DUE"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-yellow-500/20 text-yellow-400"
                  }`}
                >
                  {subscription.status}
                </span>
                {subscription.cancelAtPeriodEnd && (
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400">
                    Cancelling
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-theme-secondary">Billing Period</dt>
              <dd>{subscription.billingPeriod || "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-theme-secondary">Current Period Ends</dt>
              <dd>{new Date(subscription.currentPeriodEnd).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-sm text-theme-secondary">Gateway Subscription</dt>
              <dd className="font-mono text-xs break-all">
                {subscription.gatewaySubscriptionId}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-theme-secondary">Gateway Customer</dt>
              <dd className="font-mono text-xs break-all">
                {subscription.gatewayCustomerId}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-theme-secondary">Gateway Price</dt>
              <dd className="font-mono text-xs break-all">
                {subscription.gatewayPriceId || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-theme-secondary">Last Event Applied</dt>
              <dd>
                {subscription.lastEventAt
                  ? new Date(subscription.lastEventAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-theme-secondary text-sm">
            No active subscription (account is on the Free tier).
          </p>
        )}

        {recentPayments.length > 0 && (
          <>
            <h4 className="text-sm font-semibold mt-6 mb-2">
              Recent Payments
            </h4>
            <div className="space-y-2">
              {recentPayments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 bg-theme-tertiary rounded text-sm"
                >
                  <div>
                    <div>{p.description || "Subscription Payment"}</div>
                    <div className="text-xs text-theme-muted font-mono">
                      {p.gatewayPaymentId} ·{" "}
                      {new Date(p.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        p.status === "SUCCEEDED"
                          ? "bg-green-500/20 text-green-400"
                          : p.status === "FAILED"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {p.status}
                    </span>
                    <span className="font-semibold">
                      {formatCurrency(p.amount, p.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Domains */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Domains</h3>
        {account.domains.length > 0 ? (
          <div className="space-y-3">
            {account.domains.map((domain) => (
              <div
                key={domain.id}
                className="flex items-center justify-between p-3 bg-theme-tertiary rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono">{domain.domain}</span>
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      domain.status === "VERIFIED"
                        ? "bg-green-500/20 text-green-400"
                        : domain.status === "PENDING"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {domain.status}
                  </span>
                </div>
                <div className="text-sm text-theme-secondary">
                  {domain.verifiedAt
                    ? `Verified ${new Date(domain.verifiedAt).toLocaleDateString()}`
                    : "Not verified"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-theme-secondary text-sm">No custom domains configured.</p>
        )}
      </div>
    </div>
  );
}
