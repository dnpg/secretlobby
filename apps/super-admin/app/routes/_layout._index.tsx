import { useLoaderData } from "react-router";
import type { Route } from "./+types/_layout._index";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Super Admin - Dashboard" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Get stats
  const [accountCount, userCount, domainCount, planCount, subscriptionCount] = await Promise.all([
    prisma.account.count(),
    prisma.user.count(),
    prisma.domain.count(),
    prisma.subscriptionPlan.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
  ]);

  return {
    stats: {
      accounts: accountCount,
      users: userCount,
      domains: domainCount,
      plans: planCount,
      activeSubscriptions: subscriptionCount,
    },
  };
}

export default function SuperAdminDashboard() {
  const { stats } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-8">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        <div className="card p-6">
          <h3 className="text-theme-secondary text-sm font-medium uppercase tracking-wider">
            Total Accounts
          </h3>
          <p className="text-4xl font-bold mt-2">{stats.accounts}</p>
        </div>

        <div className="card p-6">
          <h3 className="text-theme-secondary text-sm font-medium uppercase tracking-wider">
            Total Users
          </h3>
          <p className="text-4xl font-bold mt-2">{stats.users}</p>
        </div>

        <div className="card p-6">
          <h3 className="text-theme-secondary text-sm font-medium uppercase tracking-wider">
            Custom Domains
          </h3>
          <p className="text-4xl font-bold mt-2">{stats.domains}</p>
        </div>

        <div className="card p-6">
          <h3 className="text-theme-secondary text-sm font-medium uppercase tracking-wider">
            Active Subscriptions
          </h3>
          <p className="text-4xl font-bold mt-2">{stats.activeSubscriptions}</p>
        </div>

        <div className="card p-6">
          <h3 className="text-theme-secondary text-sm font-medium uppercase tracking-wider">
            Subscription Plans
          </h3>
          <p className="text-4xl font-bold mt-2">{stats.plans}</p>
        </div>
      </div>
    </div>
  );
}
