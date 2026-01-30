import { cn } from "../lib/utils.js";

export interface PaymentMethod {
  id: string;
  type: "card" | "paypal" | "bank_account" | "other";
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export interface PaymentMethodCardProps {
  method: PaymentMethod;
  onSetDefault?: (id: string) => void;
  onRemove?: (id: string) => void;
  className?: string;
}

function getCardIcon(brand?: string): string {
  const brandIcons: Record<string, string> = {
    visa: "💳",
    mastercard: "💳",
    amex: "💳",
    discover: "💳",
    paypal: "🅿️",
  };

  return brandIcons[brand?.toLowerCase() || ""] || "💳";
}

function formatExpiry(month?: number, year?: number): string {
  if (!month || !year) return "";
  return `${month.toString().padStart(2, "0")}/${year.toString().slice(-2)}`;
}

function formatBrand(brand?: string): string {
  if (!brand) return "Card";

  const brandNames: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
    jcb: "JCB",
    diners: "Diners Club",
    unionpay: "UnionPay",
  };

  return brandNames[brand.toLowerCase()] || brand;
}

export function PaymentMethodCard({
  method,
  onSetDefault,
  onRemove,
  className,
}: PaymentMethodCardProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-4 bg-theme-tertiary border rounded-lg",
        method.isDefault ? "border-green-500/50" : "border-theme",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <span className="text-2xl">{getCardIcon(method.brand)}</span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {formatBrand(method.brand)} ending in {method.last4}
            </span>
            {method.isDefault && (
              <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded-full">
                Default
              </span>
            )}
          </div>
          {method.expiryMonth && method.expiryYear && (
            <div className="text-sm text-theme-secondary">
              Expires {formatExpiry(method.expiryMonth, method.expiryYear)}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!method.isDefault && onSetDefault && (
          <button
            type="button"
            onClick={() => onSetDefault(method.id)}
            className="text-sm text-blue-400 hover:text-blue-300 transition"
          >
            Make Default
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(method.id)}
            className="text-sm text-red-400 hover:text-red-300 transition"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
