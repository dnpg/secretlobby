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
import { prisma } from "@secretlobby/db";
import { getPublicUrl } from "@secretlobby/storage";

const GA_ID_RE = /^G[T]?-[A-Z0-9]+$/i;
const GTM_ID_RE = /^GTM-[A-Z0-9]+$/i;

export async function loader() {
  const gaMeasurementId = process.env.GA_MEASUREMENT_ID ?? "";
  const gtmContainerId = process.env.GTM_CONTAINER_ID ?? "";

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

  return {
    gaMeasurementId: GA_ID_RE.test(gaMeasurementId) ? gaMeasurementId : null,
    gtmContainerId: GTM_ID_RE.test(gtmContainerId) ? gtmContainerId : null,
    faviconBaseUrl,
  };
}

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

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useLoaderData<typeof loader>();
  const gaMeasurementId = data?.gaMeasurementId ?? null;
  const gtmContainerId = data?.gtmContainerId ?? null;
  const faviconBaseUrl = data?.faviconBaseUrl ?? null;

  return (
    <html lang="en">
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
        {gtmContainerId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(gtmContainerId)});`,
            }}
          />
        )}
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
        {gtmContainerId && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtmContainerId)}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
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
