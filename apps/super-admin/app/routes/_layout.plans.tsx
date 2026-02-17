import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/_layout.plans";
import { prisma } from "@secretlobby/db";

export function meta() {
  return [{ title: "Subscription Plans - Super Admin" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { position: "asc" },
  });

  return { plans };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const name = formData.get("name") as string;
    const slug = (formData.get("slug") as string).toUpperCase();
    const description = formData.get("description") as string;
    const priceMonthly = parseInt(formData.get("priceMonthly") as string) || 0;
    const priceYearly = parseInt(formData.get("priceYearly") as string) || 0;
    const maxSongs = parseInt(formData.get("maxSongs") as string) || 5;
    const maxLobbies = parseInt(formData.get("maxLobbies") as string) || 1;
    const maxStorage = parseInt(formData.get("maxStorage") as string) || 100;
    const customDomain = formData.get("customDomain") === "true";
    const apiAccess = formData.get("apiAccess") === "true";
    const highlighted = formData.get("highlighted") === "true";
    const featuresText = formData.get("features") as string;
    const features = featuresText ? featuresText.split("\n").filter(f => f.trim()) : [];

    // Stripe price IDs
    const stripePriceMonthly = formData.get("stripePriceMonthly") as string || null;
    const stripePriceYearly = formData.get("stripePriceYearly") as string || null;

    // Get next position
    const lastPlan = await prisma.subscriptionPlan.findFirst({
      orderBy: { position: "desc" },
    });
    const position = (lastPlan?.position ?? -1) + 1;

    await prisma.subscriptionPlan.create({
      data: {
        name,
        slug,
        description,
        priceMonthly,
        priceYearly,
        maxSongs,
        maxLobbies,
        maxStorage,
        customDomain,
        apiAccess,
        highlighted,
        features,
        stripePriceMonthly,
        stripePriceYearly,
        position,
      },
    });

    return { success: true, message: "Plan created" };
  }

  if (intent === "update") {
    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const priceMonthly = parseInt(formData.get("priceMonthly") as string) || 0;
    const priceYearly = parseInt(formData.get("priceYearly") as string) || 0;
    const maxSongs = parseInt(formData.get("maxSongs") as string) || 5;
    const maxLobbies = parseInt(formData.get("maxLobbies") as string) || 1;
    const maxStorage = parseInt(formData.get("maxStorage") as string) || 100;
    const customDomain = formData.get("customDomain") === "true";
    const apiAccess = formData.get("apiAccess") === "true";
    const highlighted = formData.get("highlighted") === "true";
    const isActive = formData.get("isActive") === "true";
    const featuresText = formData.get("features") as string;
    const features = featuresText ? featuresText.split("\n").filter(f => f.trim()) : [];

    // Stripe price IDs
    const stripePriceMonthly = formData.get("stripePriceMonthly") as string || null;
    const stripePriceYearly = formData.get("stripePriceYearly") as string || null;

    await prisma.subscriptionPlan.update({
      where: { id },
      data: {
        name,
        description,
        priceMonthly,
        priceYearly,
        maxSongs,
        maxLobbies,
        maxStorage,
        customDomain,
        apiAccess,
        highlighted,
        isActive,
        features,
        stripePriceMonthly,
        stripePriceYearly,
      },
    });

    return { success: true, message: "Plan updated" };
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    await prisma.subscriptionPlan.delete({ where: { id } });
    return { success: true, message: "Plan deleted" };
  }

  if (intent === "reorder") {
    const planIds = (formData.get("planIds") as string).split(",");

    await Promise.all(
      planIds.map((id, index) =>
        prisma.subscriptionPlan.update({
          where: { id },
          data: { position: index },
        })
      )
    );

    return { success: true, message: "Plans reordered" };
  }

  return { success: false, message: "Unknown action" };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  maxSongs: number;
  maxLobbies: number;
  maxStorage: number;
  customDomain: boolean;
  apiAccess: boolean;
  highlighted: boolean;
  isActive: boolean;
  features: unknown;
  stripePriceMonthly: string | null;
  stripePriceYearly: string | null;
}

export default function PlansPage() {
  const { plans } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const isSubmitting = fetcher.state === "submitting";

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-bold">Subscription Plans</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 btn-primary rounded-lg"
        >
          Create Plan
        </button>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`card p-6 ${
              plan.highlighted
                ? "border-red-500"
                : plan.isActive
                ? "border-theme"
                : "border-theme opacity-60"
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-xs text-theme-muted font-mono">{plan.slug}</p>
              </div>
              <div className="flex gap-1">
                {plan.highlighted && (
                  <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">
                    Popular
                  </span>
                )}
                {!plan.isActive && (
                  <span className="px-2 py-0.5 text-xs bg-theme-tertiary/50 text-theme-secondary rounded-full">
                    Inactive
                  </span>
                )}
              </div>
            </div>

            <p className="text-sm text-theme-secondary mb-4">{plan.description}</p>

            <div className="mb-4">
              <div className="text-2xl font-bold">
                {formatCurrency(plan.priceMonthly)}
                <span className="text-sm font-normal text-theme-secondary">/mo</span>
              </div>
              <div className="text-sm text-theme-muted">
                or {formatCurrency(plan.priceYearly)}/year
              </div>
            </div>

            <div className="text-sm text-theme-secondary space-y-1 mb-4">
              <div>{plan.maxSongs === -1 ? "Unlimited" : plan.maxSongs} songs</div>
              <div>{plan.maxLobbies === -1 ? "Unlimited" : plan.maxLobbies} lobbies</div>
              <div>{plan.maxStorage === -1 ? "Unlimited" : plan.maxStorage}MB storage</div>
              {plan.customDomain && <div className="text-green-400">Custom domain</div>}
              {plan.apiAccess && <div className="text-green-400">API access</div>}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setEditingPlan(plan as Plan)}
                className="flex-1 px-3 py-2 text-sm bg-theme-tertiary hover:bg-theme-secondary rounded-lg transition"
              >
                Edit
              </button>
              <fetcher.Form method="post" className="flex-1">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="id" value={plan.id} />
                <button
                  type="submit"
                  onClick={(e) => {
                    if (!confirm(`Delete "${plan.name}" plan?`)) {
                      e.preventDefault();
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-red-900/50 hover:bg-red-800/50 text-red-400 rounded-lg transition"
                >
                  Delete
                </button>
              </fetcher.Form>
            </div>
          </div>
        ))}
      </div>

      {plans.length === 0 && (
        <div className="card border-theme p-12 text-center">
          <p className="text-theme-secondary mb-4">No subscription plans yet</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 btn-primary rounded-lg"
          >
            Create Your First Plan
          </button>
        </div>
      )}

      {/* Create Plan Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card border-theme p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-6">Create Subscription Plan</h3>

            <fetcher.Form
              method="post"
              onSubmit={() => {
                setTimeout(() => setShowCreateForm(false), 100);
              }}
            >
              <input type="hidden" name="intent" value="create" />

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Plan Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="e.g., Starter"
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Slug (Internal ID)
                  </label>
                  <input
                    type="text"
                    name="slug"
                    required
                    placeholder="e.g., STARTER"
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] uppercase"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-theme-secondary mb-1">
                  Description
                </label>
                <input
                  type="text"
                  name="description"
                  placeholder="Short description for the plan"
                  className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Monthly Price (cents)
                  </label>
                  <input
                    type="number"
                    name="priceMonthly"
                    defaultValue="0"
                    min="0"
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Yearly Price (cents)
                  </label>
                  <input
                    type="number"
                    name="priceYearly"
                    defaultValue="0"
                    min="0"
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Stripe Monthly Price ID
                  </label>
                  <input
                    type="text"
                    name="stripePriceMonthly"
                    placeholder="price_..."
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Stripe Yearly Price ID
                  </label>
                  <input
                    type="text"
                    name="stripePriceYearly"
                    placeholder="price_..."
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Max Songs (-1 = unlimited)
                  </label>
                  <input
                    type="number"
                    name="maxSongs"
                    defaultValue="5"
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Max Lobbies
                  </label>
                  <input
                    type="number"
                    name="maxLobbies"
                    defaultValue="1"
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Max Storage (MB)
                  </label>
                  <input
                    type="number"
                    name="maxStorage"
                    defaultValue="100"
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div className="flex gap-6 mb-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="customDomain"
                    value="true"
                    className="h-4 w-4 rounded border-theme bg-theme-tertiary text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm">Custom Domain</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="apiAccess"
                    value="true"
                    className="h-4 w-4 rounded border-theme bg-theme-tertiary text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm">API Access</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="highlighted"
                    value="true"
                    className="h-4 w-4 rounded border-theme bg-theme-tertiary text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm">Highlighted (Most Popular)</span>
                </label>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-theme-secondary mb-1">
                  Features (one per line)
                </label>
                <textarea
                  name="features"
                  rows={4}
                  placeholder="Upload up to 5 songs&#10;Basic analytics&#10;Email support"
                  className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 bg-theme-tertiary hover:bg-theme-secondary rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 btn-primary rounded-lg disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Plan"}
                </button>
              </div>
            </fetcher.Form>
          </div>
        </div>
      )}

      {/* Edit Plan Modal */}
      {editingPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card border-theme p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-6">Edit Plan: {editingPlan.name}</h3>

            <fetcher.Form
              method="post"
              onSubmit={() => {
                setTimeout(() => setEditingPlan(null), 100);
              }}
            >
              <input type="hidden" name="intent" value="update" />
              <input type="hidden" name="id" value={editingPlan.id} />

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Plan Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={editingPlan.name}
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Slug (read-only)
                  </label>
                  <input
                    type="text"
                    value={editingPlan.slug}
                    disabled
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg text-theme-muted"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-theme-secondary mb-1">
                  Description
                </label>
                <input
                  type="text"
                  name="description"
                  defaultValue={editingPlan.description || ""}
                  className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Monthly Price (cents)
                  </label>
                  <input
                    type="number"
                    name="priceMonthly"
                    defaultValue={editingPlan.priceMonthly}
                    min="0"
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Yearly Price (cents)
                  </label>
                  <input
                    type="number"
                    name="priceYearly"
                    defaultValue={editingPlan.priceYearly}
                    min="0"
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Stripe Monthly Price ID
                  </label>
                  <input
                    type="text"
                    name="stripePriceMonthly"
                    defaultValue={editingPlan.stripePriceMonthly || ""}
                    placeholder="price_..."
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Stripe Yearly Price ID
                  </label>
                  <input
                    type="text"
                    name="stripePriceYearly"
                    defaultValue={editingPlan.stripePriceYearly || ""}
                    placeholder="price_..."
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Max Songs (-1 = unlimited)
                  </label>
                  <input
                    type="number"
                    name="maxSongs"
                    defaultValue={editingPlan.maxSongs}
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Max Lobbies
                  </label>
                  <input
                    type="number"
                    name="maxLobbies"
                    defaultValue={editingPlan.maxLobbies}
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-theme-secondary mb-1">
                    Max Storage (MB)
                  </label>
                  <input
                    type="number"
                    name="maxStorage"
                    defaultValue={editingPlan.maxStorage}
                    className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div className="flex gap-6 mb-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="customDomain"
                    value="true"
                    defaultChecked={editingPlan.customDomain}
                    className="h-4 w-4 rounded border-theme bg-theme-tertiary text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm">Custom Domain</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="apiAccess"
                    value="true"
                    defaultChecked={editingPlan.apiAccess}
                    className="h-4 w-4 rounded border-theme bg-theme-tertiary text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm">API Access</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="highlighted"
                    value="true"
                    defaultChecked={editingPlan.highlighted}
                    className="h-4 w-4 rounded border-theme bg-theme-tertiary text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm">Highlighted</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="isActive"
                    value="true"
                    defaultChecked={editingPlan.isActive}
                    className="h-4 w-4 rounded border-theme bg-theme-tertiary text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-theme-secondary mb-1">
                  Features (one per line)
                </label>
                <textarea
                  name="features"
                  rows={4}
                  defaultValue={Array.isArray(editingPlan.features) ? (editingPlan.features as string[]).join("\n") : ""}
                  className="w-full px-3 py-2 bg-theme-primary border border-theme rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-4 py-2 bg-theme-tertiary hover:bg-theme-secondary rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 btn-primary rounded-lg disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </fetcher.Form>
          </div>
        </div>
      )}
    </div>
  );
}
