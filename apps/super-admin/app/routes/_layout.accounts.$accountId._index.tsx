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

  // Get base domain from environment
  const baseDomain = process.env.CORE_DOMAIN || "secretlobby.co";

  // Detect if we're in local development
  const url = new URL(request.url);
  const hostname = request.headers.get("host") || url.hostname;
  const isLocalDev = hostname.includes("localhost") || hostname.includes(".local");
  const protocol = isLocalDev ? "http" : "https";

  return { account, baseDomain, protocol };
}

export default function AccountDetails() {
  const { account, baseDomain, protocol } = useLoaderData<typeof loader>();

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
