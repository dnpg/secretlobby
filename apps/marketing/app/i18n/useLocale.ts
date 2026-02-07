import { useCallback } from "react";
import { type Locale, defaultLocale, locales, getTranslations, isValidLocale } from "./translations";

export function useLocale(currentLocale: Locale = defaultLocale) {
  const t = getTranslations(currentLocale);

  const switchLocale = useCallback((newLocale: Locale) => {
    // Navigate to the new locale URL
    const currentPath = window.location.pathname;

    // Remove existing locale prefix if present
    let pathWithoutLocale = currentPath;
    for (const loc of locales) {
      if (currentPath === `/${loc}` || currentPath.startsWith(`/${loc}/`)) {
        pathWithoutLocale = currentPath.slice(loc.length + 1) || "/";
        break;
      }
    }

    // Build new URL with locale prefix (except for default locale)
    let newPath: string;
    if (newLocale === defaultLocale) {
      newPath = pathWithoutLocale;
    } else {
      newPath = `/${newLocale}${pathWithoutLocale === "/" ? "" : pathWithoutLocale}`;
    }

    window.location.href = newPath || "/";
  }, []);

  return {
    locale: currentLocale,
    t,
    switchLocale,
    locales,
  };
}

export function getLocaleFromUrl(pathname: string): Locale {
  // Check if URL starts with a locale prefix
  for (const loc of locales) {
    if (pathname === `/${loc}` || pathname.startsWith(`/${loc}/`)) {
      return loc;
    }
  }
  return defaultLocale;
}

export function getLocaleFromRequest(request: Request): Locale {
  const url = new URL(request.url);

  // First, check URL path for locale prefix
  const urlLocale = getLocaleFromUrl(url.pathname);
  if (urlLocale !== defaultLocale) {
    return urlLocale;
  }

  // For default locale URLs, check cookie
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/locale=(\w+)/);
    if (match && isValidLocale(match[1])) {
      return match[1];
    }
  }

  // Finally, check Accept-Language header
  const acceptLanguage = request.headers.get("Accept-Language");
  if (acceptLanguage) {
    const languages = acceptLanguage.split(",").map((lang) => {
      const [code] = lang.trim().split(";");
      return code.split("-")[0].toLowerCase();
    });

    for (const lang of languages) {
      if (isValidLocale(lang)) {
        return lang;
      }
    }
  }

  return defaultLocale;
}

export function getLocalizedPath(path: string, locale: Locale): string {
  // Remove any existing locale prefix
  let cleanPath = path;
  for (const loc of locales) {
    if (path === `/${loc}` || path.startsWith(`/${loc}/`)) {
      cleanPath = path.slice(loc.length + 1) || "/";
      break;
    }
  }

  // Add new locale prefix (except for default)
  if (locale === defaultLocale) {
    return cleanPath;
  }

  return `/${locale}${cleanPath === "/" ? "" : cleanPath}`;
}
