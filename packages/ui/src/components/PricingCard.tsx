import { cn } from "../lib/utils.js";

export interface PricingTier {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  highlighted?: boolean;
}

export interface PricingCardProps {
  tier: PricingTier;
  billingPeriod: "monthly" | "yearly";
  isCurrent?: boolean;
  isUpgrade?: boolean;
  isDowngrade?: boolean;
  onSelect?: (tierId: string) => void;
  disabled?: boolean;
  className?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

export function PricingCard({
  tier,
  billingPeriod,
  isCurrent = false,
  isUpgrade = false,
  isDowngrade = false,
  onSelect,
  disabled = false,
  className,
}: PricingCardProps) {
  const price = billingPeriod === "yearly" ? tier.priceYearly : tier.priceMonthly;
  const isFree = tier.priceMonthly === 0;

  return (
    <div
      className={cn(
        "bg-theme-secondary border rounded-lg p-6 flex flex-col",
        tier.highlighted && !isCurrent && "border-blue-500 ring-2 ring-blue-500/20",
        isCurrent && "ring-2 ring-green-500/20 border-green-500",
        !tier.highlighted && !isCurrent && "border-theme",
        className
      )}
    >
      {tier.highlighted && !isCurrent && (
        <div className="text-xs font-semibold text-blue-400 mb-2">
          MOST POPULAR
        </div>
      )}
      {isCurrent && (
        <div className="text-xs font-semibold text-green-400 mb-2">
          CURRENT PLAN
        </div>
      )}

      <h3 className="text-xl font-bold mb-1">{tier.name}</h3>
      <p className="text-sm text-theme-secondary mb-4">{tier.description}</p>

      <div className="mb-6">
        <span className="text-3xl font-bold">
          {isFree ? "Free" : formatCurrency(price)}
        </span>
        {!isFree && (
          <span className="text-theme-secondary">
            /{billingPeriod === "yearly" ? "year" : "month"}
          </span>
        )}
      </div>

      <ul className="space-y-2 mb-6 flex-1">
        {tier.features.map((feature, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-theme-secondary"
          >
            <svg
              className="w-4 h-4 text-green-400 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            {feature}
          </li>
        ))}
      </ul>

      {isFree ? (
        isCurrent ? (
          <div className="px-4 py-2 bg-theme-tertiary text-theme-secondary text-center rounded-lg">
            Current Plan
          </div>
        ) : (
          <div className="px-4 py-2 bg-theme-tertiary text-theme-secondary text-center rounded-lg text-sm">
            Downgrade via cancel
          </div>
        )
      ) : isCurrent ? (
        <div className="px-4 py-2 bg-green-500/20 text-green-400 text-center rounded-lg">
          Current Plan
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onSelect?.(tier.id)}
          disabled={disabled}
          className={cn(
            "w-full px-4 py-2 rounded-lg transition font-medium",
            isUpgrade
              ? "btn-primary"
              : "btn-secondary",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {isUpgrade ? "Upgrade" : isDowngrade ? "Downgrade" : "Select"}
        </button>
      )}
    </div>
  );
}
