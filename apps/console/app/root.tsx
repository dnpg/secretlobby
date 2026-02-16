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
import { ColorModeProvider, ImageTransformProvider, type UserColorMode } from "@secretlobby/ui";
import { Toaster } from "sonner";
import { prisma } from "@secretlobby/db";
import { getPublicUrl } from "@secretlobby/storage";

const GA_ID_RE = /^G[T]?-[A-Z0-9]+$/i;

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
  const cookieHeader = request.headers.get("Cookie");
  const cookieMode = parseCookie(cookieHeader, "color-mode");
  const validModes: UserColorMode[] = ["dark", "light", "system"];
  const colorMode: UserColorMode = cookieMode && validModes.includes(cookieMode as UserColorMode)
    ? (cookieMode as UserColorMode)
    : "dark";

  const resolvedTheme: "dark" | "light" = colorMode === "system" ? "dark" : colorMode;

  const rawGaId = process.env.CONSOLE_GA_MEASUREMENT_ID ?? "";
  const gaMeasurementId = GA_ID_RE.test(rawGaId) ? rawGaId : null;

  // Get favicon base URL from system settings
  let faviconBaseUrl: string | null = null;
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { faviconConfig: true },
    });
    const config = settings?.faviconConfig as { generatedAt?: string } | null;
    if (config?.generatedAt) {
      faviconBaseUrl = getPublicUrl("system/favicons");
    }
  } catch {
    // Ignore errors - favicon is optional
  }

  const imageTransformPattern = process.env.IMAGE_TRANSFORM_PATTERN || "{url}";

  return { colorMode, resolvedTheme, gaMeasurementId, faviconBaseUrl, imageTransformPattern };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const colorMode = data?.colorMode ?? "dark";
  const resolvedTheme = data?.resolvedTheme ?? "dark";
  const gaMeasurementId = data?.gaMeasurementId ?? null;
  const faviconBaseUrl = data?.faviconBaseUrl ?? null;

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
      if (colorMode === 'system') {
        applyTheme('system');
      }
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
        var currentMode = document.documentElement.getAttribute('data-color-mode');
        if (currentMode === 'system') applyTheme('system');
      });
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
        {faviconBaseUrl && (
          <>
            <link rel="icon" href={`${faviconBaseUrl}/favicon.ico`} sizes="48x48" />
            <link rel="icon" type="image/png" sizes="16x16" href={`${faviconBaseUrl}/favicon-16x16.png`} />
            <link rel="icon" type="image/png" sizes="32x32" href={`${faviconBaseUrl}/favicon-32x32.png`} />
            <link rel="apple-touch-icon" href={`${faviconBaseUrl}/apple-touch-icon.png`} />
            <link rel="manifest" href={`${faviconBaseUrl}/site.webmanifest`} />
          </>
        )}
        <script dangerouslySetInnerHTML={{ __html: colorModeScript }} />
        {gaMeasurementId && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(gaMeasurementId)});`,
              }}
            />
          </>
        )}
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
  const imageTransformPattern = data?.imageTransformPattern ?? "{url}";

  return (
    <ColorModeProvider initialColorMode={colorMode} allowUserColorMode={true}>
      <ImageTransformProvider pattern={imageTransformPattern}>
        <Outlet />
        <Toaster theme="dark" position="bottom-right" richColors closeButton />
      </ImageTransformProvider>
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
      <h1 className="text-2xl font-bold">{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
