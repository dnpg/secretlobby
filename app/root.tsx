import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { ColorModeProvider, type UserColorMode } from "~/hooks/useColorMode";
import { getAllowUserColorMode } from "~/lib/content.server";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];


function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function loader({ request }: Route.LoaderArgs) {
  const allowUserColorMode = await getAllowUserColorMode();

  // If user color mode is disabled, force light mode
  if (!allowUserColorMode) {
    return { colorMode: "light" as UserColorMode, resolvedTheme: "light" as const, allowUserColorMode };
  }

  const cookieHeader = request.headers.get("Cookie");
  const cookieMode = parseCookie(cookieHeader, "color-mode");
  const validModes: UserColorMode[] = ["dark", "light", "system"];
  const colorMode: UserColorMode = cookieMode && validModes.includes(cookieMode as UserColorMode)
    ? (cookieMode as UserColorMode)
    : "dark";

  // Resolve "system" to "dark" on server (can't check user's preference)
  const resolvedTheme: "dark" | "light" = colorMode === "system" ? "dark" : colorMode;

  return { colorMode, resolvedTheme, allowUserColorMode };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const colorMode = data?.colorMode ?? "dark";
  const resolvedTheme = data?.resolvedTheme ?? "dark";

  // Script to handle "system" mode resolution on client
  const colorModeScript = `
    (function() {
      var colorMode = '${colorMode}';

      function getResolvedMode(mode) {
        if (mode === 'system') {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return mode;
      }

      function applyTheme(mode) {
        var resolved = getResolvedMode(mode);
        document.documentElement.setAttribute('data-theme', resolved);
        document.documentElement.setAttribute('data-color-mode', mode);
      }

      // If system mode, resolve it on client
      if (colorMode === 'system') {
        applyTheme('system');
      }

      // Listen for system preference changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
        var currentMode = document.documentElement.getAttribute('data-color-mode');
        if (currentMode === 'system') applyTheme('system');
      });

      // Expose function for React to call
      window.__applyColorMode = applyTheme;
    })();
  `;

  return (
    <html lang="en" data-theme={resolvedTheme} data-color-mode={colorMode} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: colorModeScript }} />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const data = useLoaderData<typeof loader>();
  const colorMode = data?.colorMode ?? "dark";
  const allowUserColorMode = data?.allowUserColorMode ?? true;

  return (
    <ColorModeProvider initialColorMode={colorMode} allowUserColorMode={allowUserColorMode}>
      <Outlet />
    </ColorModeProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
