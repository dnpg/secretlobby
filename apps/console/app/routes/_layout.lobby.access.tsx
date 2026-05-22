// Lobby access-control admin route.
//
// Three concerns on one page, each with its own form so they save
// independently:
//   1. Identity + policy + domain allowlist (the schema flags)
//   2. Password gate (toggle + value)
//   3. Invitee management (only when policy = INVITE_ONLY)
//
// Validation lives in @secretlobby/console mutations layer; UI just
// surfaces the error toast.

import { useEffect, useState } from "react";
import {
  Form,
  useLoaderData,
  useActionData,
  useNavigation,
  redirect,
} from "react-router";
import type { Route } from "./+types/_layout.lobby.access";
import { cn } from "@secretlobby/ui";
import { toast } from "sonner";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.lobby?.name || "Lobby"} Access - Admin` }];
}

const REASON_TOASTS: Record<string, string> = {
  identity_required:
    "Non-public lobbies need at least one identity method (Email or Google) enabled.",
  domains_required:
    "Domain allowlist mode needs at least one allowed domain.",
  domain_invalid:
    "One of the domains looks invalid. Use bare hostnames like 'acme.com'.",
  invalid_email: "That email address doesn't look valid.",
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { decryptLobbyPassword } = await import("@secretlobby/auth/lobby-password");
  const {
    getLobbyAccessSettings,
    getLobbyUsers,
  } = await import("~/models/queries/lobby-access.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    throw redirect("/login");
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    throw redirect("/lobbies");
  }

  const lobby = await getLobbyAccessSettings(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    throw redirect("/lobbies");
  }

  // Only fetch invitees when the page actually needs them — saves a
  // round-trip on public/domain lobbies.
  const invitees =
    lobby.accessPolicy === "INVITE_ONLY"
      ? await getLobbyUsers(lobbyId)
      : { rows: [], total: 0 };

  return {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      title: lobby.title,
      slug: lobby.slug,
      isDefault: lobby.isDefault,
      accessPolicy: lobby.accessPolicy as "PUBLIC" | "INVITE_ONLY" | "DOMAIN_ALLOWLIST",
      identityEmail: lobby.identityEmail,
      identityGoogle: lobby.identityGoogle,
      passwordRequired: lobby.passwordRequired,
      passwordValue: decryptLobbyPassword(lobby.password || ""),
      allowedDomains: lobby.allowedDomains,
    },
    invitees: invitees.rows,
    inviteeTotal: invitees.total,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, requireUserAuth } = await import("@secretlobby/auth");
  const { issueLobbyMagicLink } = await import("@secretlobby/auth/lobby-access");
  const { sendLobbyInvitationEmail } = await import("@secretlobby/email");
  const { getLobbyAccessSettings, getLobbyUserById } = await import(
    "~/models/queries/lobby-access.server"
  );
  const {
    updateLobbyAccessSettings,
    addLobbyInvitee,
    removeLobbyInvitee,
    parseEmailList,
  } = await import("~/models/mutations/lobby-access.server");
  const { updateLobbyPassword } = await import("~/models/mutations/lobby.server");
  const { createLogger, formatError } = await import("@secretlobby/logger/server");

  const logger = createLogger({ service: "console:lobby-access" });

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  const userId = session.userId;
  if (!accountId || !userId) {
    return { error: "Not authenticated" };
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    return { error: "Lobby ID required" };
  }

  const lobby = await getLobbyAccessSettings(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "update-settings": {
        const accessPolicy = (formData.get("accessPolicy") as string) || "PUBLIC";
        const identityEmail = formData.get("identityEmail") === "on";
        const identityGoogle = formData.get("identityGoogle") === "on";
        // Domain list comes from a single textarea (one per line).
        const allowedDomains = ((formData.get("allowedDomains") as string) || "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);

        if (accessPolicy !== "PUBLIC" && accessPolicy !== "INVITE_ONLY" && accessPolicy !== "DOMAIN_ALLOWLIST") {
          return { error: "Invalid access policy" };
        }

        const result = await updateLobbyAccessSettings(lobbyId, {
          accessPolicy,
          identityEmail,
          identityGoogle,
          // passwordRequired stays as-is here; password section owns it.
          passwordRequired: lobby.passwordRequired,
          allowedDomains,
        });
        if (!result.ok) {
          return { error: REASON_TOASTS[result.error] || "Update failed" };
        }
        return { success: "Access settings saved" };
      }

      case "update-password": {
        const password = (formData.get("password") as string) || "";
        const passwordRequired = formData.get("passwordRequired") === "on";

        // Re-validate identity-method requirement: if the admin is
        // about to enable a non-public policy without identityEmail or
        // Google, and ALSO without passwordRequired… wait, password is
        // not an identity method, it's a gate. The identity-required
        // check stays in updateLobbyAccessSettings; here we just save
        // the password value + flag.
        await updateLobbyPassword(lobbyId, password);
        await import("@secretlobby/db").then(({ prisma }) =>
          prisma.lobby.update({
            where: { id: lobbyId },
            data: { passwordRequired },
          }),
        );
        return { success: "Password settings saved" };
      }

      case "add-invitees": {
        const raw = (formData.get("emails") as string) || "";
        const sendNow = formData.get("sendNow") === "on";
        const { valid, invalid } = parseEmailList(raw);
        if (valid.length === 0) {
          return { error: invalid.length > 0 ? "No valid emails found." : "Enter at least one email." };
        }

        let added = 0;
        let skipped = 0;
        let mailFailures = 0;
        for (const email of valid) {
          const r = await addLobbyInvitee(lobbyId, email, userId);
          if (!r.ok) continue;
          if (r.created) added++;
          else skipped++;
          if (sendNow) {
            try {
              const { token } = await issueLobbyMagicLink({
                lobbyId,
                email,
                invitedByUserId: userId,
              });
              const url = new URL(request.url);
              // Magic links live on the lobby's own host, not on the
              // console. Resolve the lobby's public host from the
              // account slug + CORE_DOMAIN; the proxy already routes
              // <slug>.<domain>/auth/magic/<token> to the lobby app.
              const baseDomain = process.env.CORE_DOMAIN || "secretlobby.co";
              const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
              const { prisma } = await import("@secretlobby/db");
              const account = await prisma.account.findUnique({
                where: { id: accountId },
                select: { slug: true },
              });
              if (!account) continue;
              const lobbyHost = `${account.slug}.${baseDomain}`;
              const invitationUrl = `${protocol}://${lobbyHost}/auth/magic/${token}`;

              await sendLobbyInvitationEmail({
                to: email,
                lobbyName: lobby.title || lobby.name,
                invitationUrl,
                invitedByName: session.userName,
              });
            } catch (err) {
              mailFailures++;
              logger.error(
                { error: formatError(err), email, lobbyId },
                "Failed to send invitation email",
              );
            }
          }
        }

        const parts: string[] = [];
        if (added > 0) parts.push(`${added} added`);
        if (skipped > 0) parts.push(`${skipped} already on list`);
        if (invalid.length > 0) parts.push(`${invalid.length} skipped (invalid)`);
        if (sendNow && mailFailures > 0) parts.push(`${mailFailures} mail send failed`);
        return { success: parts.join(", ") || "Done" };
      }

      case "resend-invite": {
        const lobbyUserId = (formData.get("lobbyUserId") as string) || "";
        const invitee = await getLobbyUserById(lobbyUserId);
        if (!invitee || invitee.lobbyId !== lobbyId) {
          return { error: "Invitee not found" };
        }
        const { token } = await issueLobbyMagicLink({
          lobbyId,
          email: invitee.email,
          invitedByUserId: userId,
        });
        const baseDomain = process.env.CORE_DOMAIN || "secretlobby.co";
        const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
        const { prisma } = await import("@secretlobby/db");
        const account = await prisma.account.findUnique({
          where: { id: accountId },
          select: { slug: true },
        });
        if (!account) {
          return { error: "Account not found" };
        }
        const lobbyHost = `${account.slug}.${baseDomain}`;
        const invitationUrl = `${protocol}://${lobbyHost}/auth/magic/${token}`;
        await sendLobbyInvitationEmail({
          to: invitee.email,
          lobbyName: lobby.title || lobby.name,
          invitationUrl,
          invitedByName: session.userName,
        });
        return { success: `Sent a fresh link to ${invitee.email}` };
      }

      case "revoke-invite": {
        const lobbyUserId = (formData.get("lobbyUserId") as string) || "";
        await removeLobbyInvitee(lobbyUserId, lobbyId);
        return { success: "Invitee removed" };
      }

      default:
        return { error: "Invalid action" };
    }
  } catch (error) {
    logger.error({ error: formatError(error) }, "Lobby access update error");
    return { error: "Operation failed" };
  }
}

export default function LobbyAccessPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Local state mirrors the current toggles so the conditional
  // sections (domain editor, invitee list) appear/disappear without a
  // round-trip. The actual save still goes through the form post.
  const [accessPolicy, setAccessPolicy] = useState(data.lobby.accessPolicy);
  const [identityEmail, setIdentityEmail] = useState(data.lobby.identityEmail);
  const [identityGoogle, setIdentityGoogle] = useState(data.lobby.identityGoogle);
  const [passwordRequired, setPasswordRequired] = useState(data.lobby.passwordRequired);
  const [allowedDomainsText, setAllowedDomainsText] = useState(
    data.lobby.allowedDomains.join("\n"),
  );

  // Inline validation hint — surfaced as a banner on the settings card.
  const settingsValidationError =
    accessPolicy !== "PUBLIC" && !identityEmail && !identityGoogle
      ? "Non-public lobbies need at least Email or Google sign-in enabled."
      : accessPolicy === "DOMAIN_ALLOWLIST" &&
          allowedDomainsText.trim().length === 0
        ? "Domain allowlist needs at least one domain."
        : null;

  useEffect(() => {
    if (actionData?.success) toast.success(actionData.success);
    if (actionData?.error) toast.error(actionData.error);
  }, [actionData]);

  return (
    <div className="space-y-8">
      {/* ============================== */}
      {/* Section 1: Identity + Policy   */}
      {/* ============================== */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-2">Who can sign in</h2>
        <p className="text-sm text-theme-secondary mb-6">
          Mix and match identity methods (how visitors prove who they are)
          with an access policy (who's allowed in).
        </p>

        <Form method="post" className="space-y-6">
          <input type="hidden" name="intent" value="update-settings" />

          {/* Identity methods */}
          <fieldset>
            <legend className="text-sm font-medium mb-3">Identity methods</legend>
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="identityEmail"
                  checked={identityEmail}
                  onChange={(e) => setIdentityEmail(e.target.checked)}
                  className="mt-1 accent-[var(--color-accent)] cursor-pointer"
                />
                <div>
                  <div className="text-sm font-medium">Email magic link</div>
                  <div className="text-xs text-theme-muted">
                    Visitors enter their email and receive a one-time sign-in link.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="identityGoogle"
                  checked={identityGoogle}
                  onChange={(e) => setIdentityGoogle(e.target.checked)}
                  className="mt-1 accent-[var(--color-accent)] cursor-pointer"
                />
                <div>
                  <div className="text-sm font-medium">Sign in with Google</div>
                  <div className="text-xs text-theme-muted">
                    Visitors use their Google account. Requires Google OAuth to be configured on the platform.
                  </div>
                </div>
              </label>
            </div>
          </fieldset>

          {/* Access policy */}
          <fieldset>
            <legend className="text-sm font-medium mb-3">Access policy</legend>
            <div className="space-y-3">
              {(
                [
                  {
                    value: "PUBLIC",
                    label: "Public",
                    desc: "Anyone can enter. Identity methods are optional; the lobby password (if set) gates access.",
                  },
                  {
                    value: "INVITE_ONLY",
                    label: "Invite only",
                    desc: "Only emails on the invite list can sign in. Manage the list below.",
                  },
                  {
                    value: "DOMAIN_ALLOWLIST",
                    label: "Domain allowlist",
                    desc: "Anyone with an email on a listed domain can sign in.",
                  },
                ] as const
              ).map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-start gap-3 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="accessPolicy"
                    value={opt.value}
                    checked={accessPolicy === opt.value}
                    onChange={() => setAccessPolicy(opt.value)}
                    className="mt-1 accent-[var(--color-accent)] cursor-pointer"
                  />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-theme-muted">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Domain allowlist editor — only when DOMAIN_ALLOWLIST */}
          {accessPolicy === "DOMAIN_ALLOWLIST" && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Allowed domains
              </label>
              <textarea
                name="allowedDomains"
                value={allowedDomainsText}
                onChange={(e) => setAllowedDomainsText(e.target.value)}
                rows={4}
                placeholder={"acme.com\npartner.io"}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono text-sm"
              />
              <p className="text-xs text-theme-muted mt-1">
                One bare hostname per line. Case-insensitive. Email
                domains are matched exactly — subdomains are not
                expanded automatically.
              </p>
            </div>
          )}
          {accessPolicy !== "DOMAIN_ALLOWLIST" && (
            <input
              type="hidden"
              name="allowedDomains"
              value={allowedDomainsText}
            />
          )}

          {settingsValidationError && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
              {settingsValidationError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !!settingsValidationError}
            className={cn(
              "px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50",
              isSubmitting || settingsValidationError
                ? "cursor-not-allowed"
                : "cursor-pointer",
            )}
          >
            {isSubmitting ? "Saving..." : "Save access settings"}
          </button>
        </Form>
      </section>

      {/* ============================== */}
      {/* Section 2: Password gate       */}
      {/* ============================== */}
      <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
        <h2 className="text-lg font-semibold mb-2">Password gate</h2>
        <p className="text-sm text-theme-secondary mb-6">
          Optional shared password that layers on top of whatever access
          policy is selected. Useful when you want a quick share-with-
          a-link gate without identity verification, or as an extra
          factor on top of email sign-in.
        </p>

        <Form method="post" className="space-y-6">
          <input type="hidden" name="intent" value="update-password" />

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="passwordRequired"
              checked={passwordRequired}
              onChange={(e) => setPasswordRequired(e.target.checked)}
              className="mt-1 accent-[var(--color-accent)] cursor-pointer"
            />
            <div>
              <div className="text-sm font-medium">Require a shared password</div>
              <div className="text-xs text-theme-muted">
                Visitors must enter this password before they can sign in.
              </div>
            </div>
          </label>

          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="text"
              name="password"
              defaultValue={data.lobby.passwordValue}
              placeholder="e.g. backstage-2026"
              className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-mono"
            />
            <p className="text-xs text-theme-muted mt-1">
              Stored encrypted at rest. You can see it here because admins need to share it with fans.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              "px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50",
              isSubmitting ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            {isSubmitting ? "Saving..." : "Save password"}
          </button>
        </Form>
      </section>

      {/* ============================== */}
      {/* Section 3: Invitees            */}
      {/* ============================== */}
      {accessPolicy === "INVITE_ONLY" && (
        <section className="bg-theme-secondary rounded-xl p-6 border border-theme">
          <h2 className="text-lg font-semibold mb-2">Invitees</h2>
          <p className="text-sm text-theme-secondary mb-6">
            Only emails on this list can sign in. Send the invitation
            email now or pre-populate the list and send later. Re-sending
            invalidates any previous link.
          </p>

          <Form method="post" className="space-y-4 mb-8">
            <input type="hidden" name="intent" value="add-invitees" />
            <div>
              <label className="block text-sm font-medium mb-2">
                Add emails
              </label>
              <textarea
                name="emails"
                rows={3}
                placeholder={"sasha@band.com\nmiguel@band.com, alex@partner.io"}
                className="w-full px-4 py-2 bg-theme-tertiary rounded-lg border border-theme focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-sm"
              />
              <p className="text-xs text-theme-muted mt-1">
                One per line, or separated by commas / spaces.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                name="sendNow"
                defaultChecked
                className="accent-[var(--color-accent)] cursor-pointer"
              />
              Send an invitation email immediately
            </label>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "px-6 py-2 btn-primary rounded-lg transition disabled:opacity-50",
                isSubmitting ? "cursor-not-allowed" : "cursor-pointer",
              )}
            >
              {isSubmitting ? "Adding..." : "Add to invite list"}
            </button>
          </Form>

          {data.invitees.length === 0 ? (
            <div className="text-sm text-theme-muted py-6 text-center border border-dashed border-theme rounded-lg">
              No invitees yet — add some above.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-theme-muted">
                  <tr className="border-b border-theme">
                    <th className="text-left font-medium px-6 py-2">Email</th>
                    <th className="text-left font-medium px-2 py-2">Status</th>
                    <th className="text-left font-medium px-2 py-2">Invited</th>
                    <th className="text-left font-medium px-2 py-2">Last seen</th>
                    <th className="text-right font-medium px-6 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invitees.map((invitee) => (
                    <tr key={invitee.id} className="border-b border-theme last:border-0">
                      <td className="px-6 py-3 font-mono text-xs">{invitee.email}</td>
                      <td className="px-2 py-3">
                        <span
                          className={cn(
                            "px-2 py-0.5 text-xs rounded-full",
                            invitee.status === "ACTIVE"
                              ? "bg-green-500/10 text-green-400 border border-green-500/30"
                              : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
                          )}
                        >
                          {invitee.status === "ACTIVE" ? "Active" : "Pending"}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-xs text-theme-muted">
                        {invitee.invitedAt ? new Date(invitee.invitedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-2 py-3 text-xs text-theme-muted">
                        {invitee.lastSeenAt ? new Date(invitee.lastSeenAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Form method="post" className="inline">
                            <input type="hidden" name="intent" value="resend-invite" />
                            <input type="hidden" name="lobbyUserId" value={invitee.id} />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="px-3 py-1 text-xs btn-secondary rounded-lg transition cursor-pointer disabled:opacity-50"
                            >
                              Resend
                            </button>
                          </Form>
                          <Form method="post" className="inline">
                            <input type="hidden" name="intent" value="revoke-invite" />
                            <input type="hidden" name="lobbyUserId" value={invitee.id} />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="px-3 py-1 text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg transition cursor-pointer disabled:opacity-50"
                            >
                              Revoke
                            </button>
                          </Form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.inviteeTotal > data.invitees.length && (
            <p className="text-xs text-theme-muted mt-4">
              Showing {data.invitees.length} of {data.inviteeTotal}. Pagination not implemented yet — narrow the list via the database for now.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
