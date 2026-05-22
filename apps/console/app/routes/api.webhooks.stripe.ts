/**
 * Stripe Webhook Endpoint
 * =======================
 *
 * Receives webhook events from Stripe. The entire security-critical
 * flow lives in `handleStripeWebhook` (verify -> dedupe -> apply
 * inside a transaction). This file is intentionally a thin shim:
 *
 *   1. POST-only.
 *   2. Read the RAW body. We use `request.text()` because Stripe
 *      signs the exact bytes of the HTTP body — `request.json()` or
 *      `request.formData()` re-serialize and break the signature.
 *   3. Hand off to the billing module.
 *   4. Map result -> HTTP response. 400 on invalid signature, 500 on
 *      processing error (Stripe will retry), 200 on ok/dedup.
 *
 * CSRF: this endpoint is exempt from CSRF protection. Stripe is not a
 * browser and the request has no cookies — there's no CSRF surface.
 * The replacement defence is the webhook signature, which proves the
 * request originated from Stripe and not from a malicious page.
 *
 * Notes for code review:
 *   - We deliberately don't log the body or signature header. They
 *     contain material an attacker shouldn't be able to read in our
 *     log aggregator.
 *   - The Content-Type is required to be application/json by Stripe,
 *     but we don't enforce it — `constructEvent` will reject anything
 *     that doesn't parse as JSON anyway, before any DB access.
 */

import { data } from "react-router";
import type { Route } from "./+types/api.webhooks.stripe";

export async function action({ request }: Route.ActionArgs) {
  // Defensive: enforce POST. React Router routes both loader and
  // action by default; we add this so non-POST verbs get a clean 405.
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  // Server-only imports — keep STRIPE_SECRET_KEY out of any client
  // chunk via dynamic import on the action path.
  const { handleStripeWebhook } = await import("@secretlobby/payments/billing");
  const { createLogger } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:webhook:stripe" });

  // Read the raw body BEFORE any other work. Do not call
  // request.json() or request.formData() — they re-serialize.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Failed to read webhook body"
    );
    return data({ error: "Bad request" }, { status: 400 });
  }

  const signatureHeader = request.headers.get("stripe-signature");

  const result = await handleStripeWebhook({
    rawBody,
    signatureHeader,
  });

  if (result.status === "invalid_signature") {
    // 400 (not 401) is what Stripe expects for signature failures
    // per their documentation. Do not echo the reason — it could
    // help an attacker tune their forgery.
    return data({ error: "Invalid signature" }, { status: 400 });
  }

  if (result.status === "error") {
    // 500 → Stripe will retry. Don't surface the underlying error.
    return data({ received: true, error: "Internal error" }, { status: 500 });
  }

  return data(
    {
      received: true,
      eventId: result.eventId,
      deduplicated: result.deduplicated,
    },
    { status: 200 }
  );
}

// React Router routes registered as both loader+action by default.
// We explicitly 405 GET so a curious browser hitting the URL doesn't
// see a default React Router error page that might leak stack info.
export async function loader() {
  return data({ error: "Method not allowed" }, { status: 405 });
}
