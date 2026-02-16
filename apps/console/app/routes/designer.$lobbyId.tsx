import { useState, useEffect, useRef } from "react";
import { redirect, useFetcher, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/designer.$lobbyId";
import { cn } from "@secretlobby/ui";

type ViewportSize = "desktop" | "tablet" | "mobile";
type PageType = "lobby" | "login";

const VIEWPORT_WIDTHS: Record<ViewportSize, number> = {
  desktop: 1440,
  tablet: 768,
  mobile: 375,
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const { getSession, requireUserAuth, generateDesignerToken } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");
  const { getAccountWithBasicInfo } = await import("~/models/queries/account.server");

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

  // Fetch the lobby and account info
  const [lobby, account] = await Promise.all([
    getLobbyById(lobbyId),
    getAccountWithBasicInfo(accountId),
  ]);

  if (!lobby || lobby.accountId !== accountId) {
    throw redirect("/lobbies");
  }

  if (!account) {
    throw redirect("/login");
  }

  // Build lobby preview URL using account subdomain
  const baseDomain = process.env.CORE_DOMAIN || "secretlobby.co";
  const lobbyPort = process.env.LOBBY_PORT || "";
  const portSuffix = lobbyPort ? `:${lobbyPort}` : "";
  const lobbyApiUrl = `http://${account.slug}.${baseDomain}${portSuffix}`;

  // Generate initial designer tokens for both pages
  const lobbyToken = generateDesignerToken(lobbyId, accountId, "lobby");
  const loginToken = generateDesignerToken(lobbyId, accountId, "login");

  return {
    lobby: {
      id: lobby.id,
      name: lobby.name,
      slug: lobby.slug,
      title: lobby.title,
      isDefault: lobby.isDefault,
    },
    lobbyApiUrl,
    initialTokens: {
      lobby: lobbyToken,
      login: loginToken,
    },
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { getSession, requireUserAuth, generateDesignerToken } = await import("@secretlobby/auth");
  const { getLobbyById } = await import("~/models/queries/lobby.server");

  const { session } = await getSession(request);
  requireUserAuth(session);

  const accountId = session.currentAccountId;
  if (!accountId) {
    return { error: "Not authenticated" };
  }

  const { lobbyId } = params;
  if (!lobbyId) {
    return { error: "Lobby ID required" };
  }

  // Verify lobby belongs to account
  const lobby = await getLobbyById(lobbyId);
  if (!lobby || lobby.accountId !== accountId) {
    return { error: "Lobby not found" };
  }

  const formData = await request.formData();
  const page = formData.get("page") as "lobby" | "login";

  if (page !== "lobby" && page !== "login") {
    return { error: "Invalid page type" };
  }

  // Generate fresh designer token
  const token = generateDesignerToken(lobbyId, accountId, page);

  return { token, page };
}

// Icons
function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function DesktopIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  );
}

function TabletIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5h3m-6.75 2.25h10.5a2.25 2.25 0 002.25-2.25v-15a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 4.5v15a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function MobileIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

export default function DesignerPage() {
  const { lobby, lobbyApiUrl, initialTokens } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [page, setPage] = useState<PageType>("lobby");
  const [tokens, setTokens] = useState(initialTokens);
  const [isPageDropdownOpen, setIsPageDropdownOpen] = useState(false);
  const pageDropdownRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Update tokens when action returns new ones
  useEffect(() => {
    const data = fetcher.data;
    if (data && 'token' in data && 'page' in data && data.token && data.page) {
      const newPage = data.page as PageType;
      setTokens((prev) => ({
        ...prev,
        [newPage]: data.token,
      }));
    }
  }, [fetcher.data]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pageDropdownRef.current && !pageDropdownRef.current.contains(event.target as Node)) {
        setIsPageDropdownOpen(false);
      }
    }
    if (isPageDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isPageDropdownOpen]);

  // Build iframe URL - API is always at root, lobbyId is passed in token
  const currentToken = tokens[page];
  const iframeUrl = `${lobbyApiUrl}/api/designer-preview?token=${encodeURIComponent(currentToken)}&page=${page}`;

  // Handle page change - request fresh token
  const handlePageChange = (newPage: PageType) => {
    setPage(newPage);
    setIsPageDropdownOpen(false);
    // Request fresh token for the new page
    fetcher.submit({ page: newPage }, { method: "post" });
  };

  // Refresh iframe with fresh token
  const handleRefresh = () => {
    fetcher.submit({ page }, { method: "post" });
    // Force iframe reload after token is updated
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const viewportWidth = VIEWPORT_WIDTHS[viewport];

  return (
    <div className="fixed inset-0 bg-theme-primary flex flex-col z-50">
      {/* Toolbar */}
      <div className="flex-shrink-0 h-14 bg-theme-secondary border-b border-theme flex items-center justify-between px-4">
        {/* Left: Close button */}
        <div className="flex items-center gap-4">
          <Link
            to={`/lobby/${lobby.id}`}
            className="p-2 rounded-lg hover:bg-theme-tertiary text-theme-secondary hover:text-theme-primary transition-colors"
            title="Close Designer"
          >
            <CloseIcon />
          </Link>
          <div className="h-6 w-px bg-theme-tertiary" />
          <span className="text-sm text-theme-secondary">
            Designing: <span className="text-theme-primary font-medium">{lobby.title || lobby.name}</span>
          </span>
        </div>

        {/* Center: Viewport switcher */}
        <div className="flex items-center gap-1 bg-theme-tertiary rounded-lg p-1">
          <button
            onClick={() => setViewport("desktop")}
            className={cn(
              "p-2 rounded-md transition-colors cursor-pointer",
              viewport === "desktop"
                ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                : "text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary"
            )}
            title="Desktop (1440px)"
          >
            <DesktopIcon />
          </button>
          <button
            onClick={() => setViewport("tablet")}
            className={cn(
              "p-2 rounded-md transition-colors cursor-pointer",
              viewport === "tablet"
                ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                : "text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary"
            )}
            title="Tablet (768px)"
          >
            <TabletIcon />
          </button>
          <button
            onClick={() => setViewport("mobile")}
            className={cn(
              "p-2 rounded-md transition-colors cursor-pointer",
              viewport === "mobile"
                ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                : "text-theme-secondary hover:text-theme-primary hover:bg-theme-secondary"
            )}
            title="Mobile (375px)"
          >
            <MobileIcon />
          </button>
        </div>

        {/* Right: Page dropdown and refresh */}
        <div className="flex items-center gap-3">
          {/* Page dropdown */}
          <div ref={pageDropdownRef} className="relative">
            <button
              onClick={() => setIsPageDropdownOpen(!isPageDropdownOpen)}
              className="flex items-center gap-2 px-3 py-2 bg-theme-tertiary hover:bg-[var(--color-secondary-hover)] rounded-lg text-sm text-theme-primary transition-colors cursor-pointer border border-theme"
            >
              <span>{page === "lobby" ? "Lobby Page" : "Login Page"}</span>
              <ChevronDownIcon />
            </button>
            {isPageDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-theme-secondary rounded-lg border border-theme shadow-lg overflow-hidden z-10">
                <button
                  onClick={() => handlePageChange("lobby")}
                  className={cn(
                    "w-full px-4 py-2 text-left text-sm transition-colors cursor-pointer",
                    page === "lobby"
                      ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                      : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
                  )}
                >
                  Lobby Page
                </button>
                <button
                  onClick={() => handlePageChange("login")}
                  className={cn(
                    "w-full px-4 py-2 text-left text-sm transition-colors cursor-pointer",
                    page === "login"
                      ? "bg-[var(--color-brand-red-muted)] text-[var(--color-brand-red)]"
                      : "text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary"
                  )}
                >
                  Login Page
                </button>
              </div>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={fetcher.state !== "idle"}
            className={cn(
              "p-2 rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-tertiary transition-colors cursor-pointer",
              fetcher.state !== "idle" && "animate-spin"
            )}
            title="Refresh preview"
          >
            <RefreshIcon />
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-auto p-6 flex items-start justify-center bg-theme-primary">
        {/* Device frame container */}
        <div
          className={cn(
            "bg-theme-secondary rounded-lg shadow-2xl overflow-hidden transition-all duration-300 ease-in-out border border-theme",
            viewport === "mobile" && "rounded-[2rem]",
            viewport === "tablet" && "rounded-2xl"
          )}
          style={{
            width: viewportWidth,
            maxWidth: "100%",
          }}
        >
          {/* Device bezel (optional visual enhancement) */}
          {viewport === "mobile" && (
            <div className="h-6 bg-theme-secondary flex items-center justify-center">
              <div className="w-20 h-1 bg-theme-tertiary rounded-full" />
            </div>
          )}

          {/* Iframe container */}
          <div
            className="bg-white relative"
            style={{
              height: viewport === "mobile" ? "calc(100vh - 180px)" : "calc(100vh - 140px)",
              maxHeight: viewport === "mobile" ? "812px" : viewport === "tablet" ? "1024px" : "900px",
            }}
          >
            <iframe
              ref={iframeRef}
              src={iframeUrl}
              className="w-full h-full border-0"
              title={`${lobby.name} preview - ${page} page`}
              sandbox="allow-scripts allow-same-origin allow-forms"
            />

            {/* Loading overlay */}
            {fetcher.state !== "idle" && (
              <div className="absolute inset-0 bg-theme-primary/50 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-theme-secondary border-t-[var(--color-brand-red)] rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* Device bottom bezel */}
          {viewport === "mobile" && (
            <div className="h-4 bg-theme-secondary" />
          )}
        </div>
      </div>

      {/* Footer with viewport info */}
      <div className="shrink-0 h-8 bg-theme-secondary border-t border-theme flex items-center justify-center">
        <span className="text-xs text-theme-muted">
          {viewportWidth}px
        </span>
      </div>
    </div>
  );
}
