// Request-link route.
//
// Two entry points land visitors here:
//
//   1. /auth/magic/<token> failed (expired / already used / policy changed)
//      → loader receives `?reason=...` and surfaces a banner.
//   2. The lobby's index loader redirects here when the lobby is set up
//      for email or Google identity and the visitor isn't authenticated.
//
// Renders the shared <LoginPanel> from @secretlobby/lobby-template so
// the page picks up the lobby owner's customizations (logo, colors,
// title, button label) — same visual treatment as the password gate.
//
// POST behavior: validate + (if passwordRequired) verify the shared
// password, run checkLobbyAccess, issue + send a magic link, then ALWAYS
// render the neutral "if you're authorized we sent you a link" success
// state. Only failure surfaced is "wrong password" — the password is a
// shared secret, not a private fact, so admitting it doesn't leak
// invite-list membership.

import { useEffect } from "react";
import {
  useActionData,
  useLoaderData,
  redirect,
} from "react-router";
import type { Route } from "./+types/auth.request-link";
import {
  getSession,
  isAuthenticatedForLobby,
} from "@secretlobby/auth";
import { verifyLobbyPassword } from "@secretlobby/auth/lobby-password";
import {
  checkLobbyAccess,
  issueLobbyMagicLink,
  normalizeEmail,
  isValidEmailShape,
  LOBBY_MAGIC_LINK_TTL_MS,
} from "@secretlobby/auth/lobby-access";
import { sendLobbyMagicLinkEmail } from "@secretlobby/email";
import { prisma } from "@secretlobby/db";
import { getPublicUrl } from "@secretlobby/storage";
import {
  defaultDarkTheme,
  generateThemeCSSVars,
  type ThemeSettings,
} from "@secretlobby/theme";
import {
  LoginPanel,
  SecretLobbyFooter,
  type LoginPageSettings,
} from "@secretlobby/lobby-template";
import { getSwatchesByAccountId } from "~/lib/content.server";
import { resolveTenant } from "~/lib/subdomain.server";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Sign in - ${data?.lobbyTitle || "Lobby"}` }];
}

const REASON_MESSAGES: Record<string, string> = {
  expired:
    "That sign-in link has expired. Enter your email to get a new one.",
  used_or_invalid:
    "That sign-in link is no longer valid. If you should have access, enter your email and we'll send you a new one.",
  lobby_mismatch:
    "That sign-in link is for a different lobby. Enter your email to get a fresh link for this one.",
  not_authorized:
    "That email isn't currently authorized to access this lobby. If this is wrong, please contact the lobby owner.",
  missing_token:
    "Sign-in link was missing. Enter your email below to get a new one.",
};

// Defaults match apps/lobby/app/routes/_index.tsx so both pages render
// with the same baseline when a lobby has no login-page customizations.
const defaultLoginPageSettings: LoginPageSettings = {
  title: "",
  description: "",
  logoType: null,
  logoSvg: "",
  logoImage: "",
  logoMaxWidth: 50,
  bgColor: "#111827",
  panelBgColor: "#1f2937",
  panelBorderColor: "#374151",
  textColor: "#ffffff",
  buttonLabel: "Send sign-in link",
};

interface SelectedLobby {
  id: string;
  slug: string;
  isDefault: boolean;
  title: string | null;
  name: string;
  accessPolicy: "PUBLIC" | "INVITE_ONLY" | "DOMAIN_ALLOWLIST";
  allowedDomains: string[];
  passwordRequired: boolean;
  passwordEncrypted: string | null;
  identityEmail: boolean;
  identityGoogle: boolean;
  settings: unknown;
  accountSettings: unknown;
  accountId: string;
}

async function selectLobby(
  request: Request,
  lobbySlugFromQuery: string | null,
): Promise<{ lobby: SelectedLobby | null }> {
  const tenant = await resolveTenant(request);
  if (!tenant.account) {
    return { lobby: null };
  }
  const accountId = tenant.account.id;

  const lobbies = await prisma.lobby.findMany({
    where: { accountId, isPublished: true },
    select: {
      id: true,
      slug: true,
      isDefault: true,
      title: true,
      name: true,
      accessPolicy: true,
      allowedDomains: true,
      passwordRequired: true,
      password: true,
      identityEmail: true,
      identityGoogle: true,
      settings: true,
    },
  });
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { settings: true },
  });

  const row =
    (lobbySlugFromQuery && lobbies.find((l) => l.slug === lobbySlugFromQuery)) ||
    lobbies.find((l) => l.isDefault) ||
    lobbies[0] ||
    null;
  if (!row) return { lobby: null };

  return {
    lobby: {
      id: row.id,
      slug: row.slug,
      isDefault: row.isDefault,
      title: row.title,
      name: row.name,
      accessPolicy: row.accessPolicy,
      allowedDomains: row.allowedDomains,
      passwordRequired: row.passwordRequired,
      passwordEncrypted: row.password,
      identityEmail: row.identityEmail,
      identityGoogle: row.identityGoogle,
      settings: row.settings,
      accountSettings: account?.settings,
      accountId,
    },
  };
}

function resolveLoginPageSettings(
  lobbySettings: unknown,
  accountSettings: unknown,
): LoginPageSettings {
  let settings: LoginPageSettings = defaultLoginPageSettings;
  if (lobbySettings && typeof lobbySettings === "object") {
    const ls = lobbySettings as Record<string, unknown>;
    if (ls.loginPage && typeof ls.loginPage === "object") {
      settings = {
        ...defaultLoginPageSettings,
        ...(ls.loginPage as Partial<LoginPageSettings>),
      };
    }
  }
  if (
    settings === defaultLoginPageSettings &&
    accountSettings &&
    typeof accountSettings === "object"
  ) {
    const as = accountSettings as Record<string, unknown>;
    if (as.loginPage && typeof as.loginPage === "object") {
      settings = {
        ...defaultLoginPageSettings,
        ...(as.loginPage as Partial<LoginPageSettings>),
      };
    }
  }
  return settings;
}

// Same lobby-then-account fallback the lobby _index applies for theme
// settings. The submit button on LoginPanel reads `--btn-*` CSS vars
// off these, so the page needs to carry them or buttons paint blank.
function resolveThemeSettings(
  lobbySettings: unknown,
  accountSettings: unknown,
): ThemeSettings {
  let settings: ThemeSettings = defaultDarkTheme;
  if (lobbySettings && typeof lobbySettings === "object") {
    const ls = lobbySettings as Record<string, unknown>;
    if (ls.theme && typeof ls.theme === "object") {
      settings = { ...defaultDarkTheme, ...(ls.theme as Partial<ThemeSettings>) };
    }
  }
  if (
    settings === defaultDarkTheme &&
    accountSettings &&
    typeof accountSettings === "object"
  ) {
    const as = accountSettings as Record<string, unknown>;
    if (as.theme && typeof as.theme === "object") {
      settings = { ...defaultDarkTheme, ...(as.theme as Partial<ThemeSettings>) };
    }
  }
  return settings;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const lobbySlugFromQuery = url.searchParams.get("lobby");
  const reason = url.searchParams.get("reason");

  const { lobby } = await selectLobby(request, lobbySlugFromQuery);
  if (!lobby) {
    throw redirect("/");
  }

  // If no identity method is on, the form is pointless — bounce back
  // to the lobby itself (it'll either let them straight in for fully
  // public lobbies, or show the inline password form).
  if (!lobby.identityEmail && !lobby.identityGoogle) {
    const target = lobby.isDefault ? "/" : `/${lobby.slug}`;
    throw redirect(target);
  }

  const { session } = await getSession(request);
  if (isAuthenticatedForLobby(session, lobby.id)) {
    const target = lobby.isDefault ? "/" : `/${lobby.slug}`;
    throw redirect(target);
  }

  const loginPageSettings = resolveLoginPageSettings(
    lobby.settings,
    lobby.accountSettings,
  );
  const themeSettings = resolveThemeSettings(
    lobby.settings,
    lobby.accountSettings,
  );

  // Account swatches feed into the theme CSS generator so any swatch-ref
  // entries (gradients/solid) inside the theme resolve to concrete values.
  const swatches = await getSwatchesByAccountId(lobby.accountId);
  const themeVars = generateThemeCSSVars(
    themeSettings,
    swatches as unknown as Parameters<typeof generateThemeCSSVars>[1],
  );

  // Resolve the logo image to a public URL + intrinsic dimensions (so
  // the rendered <img> avoids layout shift).
  let logoImageUrl: string | null = null;
  let logoImageWidth: number | null = null;
  let logoImageHeight: number | null = null;
  if (loginPageSettings.logoType === "image" && loginPageSettings.logoImage) {
    logoImageUrl = getPublicUrl(loginPageSettings.logoImage);
    const media = await prisma.media.findFirst({
      where: { key: loginPageSettings.logoImage, accountId: lobby.accountId },
      select: { width: true, height: true },
    });
    logoImageWidth = media?.width ?? null;
    logoImageHeight = media?.height ?? null;
  }

  // Google start URL. The lobby app sends users to AUTH_URL (the
  // central console domain) where the OAuth round-trip happens.
  let googleSignInUrl: string | null = null;
  if (lobby.identityGoogle) {
    const authBase = process.env.AUTH_URL;
    if (authBase) {
      const host = url.host;
      const returnPath = lobby.isDefault ? "/" : `/${lobby.slug}`;
      const params = new URLSearchParams({
        lobby: lobby.id,
        host,
        returnPath,
      });
      googleSignInUrl = `${authBase.replace(/\/$/, "")}/auth/google?${params.toString()}`;
    }
  }

  return {
    lobby: {
      id: lobby.id,
      slug: lobby.slug,
      isDefault: lobby.isDefault,
      title: lobby.title,
      name: lobby.name,
    },
    lobbyTitle: lobby.title || lobby.name,
    loginPageSettings,
    themeVars: themeVars as Record<string, string>,
    logoImageUrl,
    logoImageWidth,
    logoImageHeight,
    accessMode: {
      identityEmail: lobby.identityEmail,
      identityGoogle: lobby.identityGoogle,
      passwordRequired: lobby.passwordRequired,
      googleSignInUrl,
      lobbySlug: lobby.slug,
    },
    reasonMessage: reason ? REASON_MESSAGES[reason] ?? null : null,
    expiresInDays: Math.round(LOBBY_MAGIC_LINK_TTL_MS / (24 * 60 * 60 * 1000)),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const { checkRateLimit, RATE_LIMIT_CONFIGS, getClientIp } = await import(
    "@secretlobby/auth/rate-limit"
  );
  const { createLogger, formatError } = await import("@secretlobby/logger/server");
  const logger = createLogger({ service: "lobby:request-link" });

  const formData = await request.formData();
  const emailRaw = (formData.get("email") as string) || "";
  const password = (formData.get("password") as string) || "";
  const lobbySlugFromForm = (formData.get("lobbySlug") as string) || null;

  const { lobby } = await selectLobby(request, lobbySlugFromForm);
  if (!lobby || !lobby.identityEmail) {
    return { error: "This lobby doesn't support email sign-in." };
  }

  const rateLimitResult = await checkRateLimit(
    request,
    RATE_LIMIT_CONFIGS.LOBBY_MAGIC_LINK,
  );
  if (!rateLimitResult.allowed) {
    return {
      error: `Too many requests. Try again in ${Math.ceil(rateLimitResult.resetInSeconds / 60)} minutes.`,
    };
  }

  const email = normalizeEmail(emailRaw);
  if (!isValidEmailShape(email)) {
    return { error: "Please enter a valid email address." };
  }

  if (lobby.passwordRequired) {
    if (!verifyLobbyPassword(password, lobby.passwordEncrypted ?? "")) {
      return { error: "Incorrect password." };
    }
  }

  const allowed = await checkLobbyAccess(
    {
      id: lobby.id,
      accessPolicy: lobby.accessPolicy,
      allowedDomains: lobby.allowedDomains,
    },
    email,
  );

  // Same response whether allowed or not — never leak invite-list membership.
  if (!allowed.allowed) {
    logger.info(
      { lobbyId: lobby.id, reason: allowed.reason, ip: getClientIp(request) },
      "Magic link denied (policy)",
    );
    return { success: true };
  }

  try {
    const { token } = await issueLobbyMagicLink({ lobbyId: lobby.id, email });
    const url = new URL(request.url);
    const magicLinkUrl = `${url.origin}/auth/magic/${token}`;
    await sendLobbyMagicLinkEmail({
      to: email,
      lobbyName: lobby.title || lobby.name,
      magicLinkUrl,
      lobbyDisplayHost: url.host,
    });
  } catch (error) {
    logger.error(
      { error: formatError(error), lobbyId: lobby.id },
      "Failed to issue lobby magic link",
    );
    // Still return success — distinguishing "allowed but mail failed"
    // from "policy denied" would reintroduce the enumeration leak.
  }

  return { success: true };
}

export default function RequestLinkPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const submitted = !!(actionData && "success" in actionData && actionData.success);
  const error =
    actionData && "error" in actionData ? actionData.error : null;
  // The reason banner (from a failed magic-link click) and form errors
  // share the same surface — only the latter is interactive feedback,
  // so we show the reason ONLY when there isn't already a form error
  // sitting on top.
  const surfaceMessage = error ?? data.reasonMessage;

  // Keep the title in the document.title in sync if it changes.
  useEffect(() => {}, [data.lobbyTitle]);

  // Wrap LoginPanel in a themed surface so the submit button's
  // `--btn-*` CSS vars resolve (same pattern as the lobby's _index
  // password-gate branch). Without these vars the button paints with
  // no background — see the LOGIN_SUBMIT_CSS block in LoginPanel.
  return (
    <main
      id="main-content"
      aria-label="Sign in"
      className="flex flex-col"
      style={{
        ...(data.themeVars as React.CSSProperties),
        fontSize: "var(--text-base-size, 16px)",
        minHeight: "100dvh",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 56px)",
      }}
    >
      <LoginPanel
        settings={data.loginPageSettings}
        logoImageUrl={data.logoImageUrl}
        logoImageWidth={data.logoImageWidth}
        logoImageHeight={data.logoImageHeight}
        errorMessage={surfaceMessage}
        submitted={submitted}
        magicLinkExpiresInDays={data.expiresInDays}
        accessMode={data.accessMode}
        wrapperClassName="flex-1 flex items-center justify-center overflow-hidden"
      />
      <SecretLobbyFooter floating />
    </main>
  );
}
