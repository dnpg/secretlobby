import { useState, useEffect } from "react";

export type ConsentPreferences = {
  necessary: boolean; // Always true, required for site functionality
  analytics: boolean; // GA4, usage tracking
  marketing: boolean; // Ads, remarketing
};

const CONSENT_COOKIE_NAME = "cookie_consent";
const CONSENT_VERSION = "1"; // Increment when consent options change

// EU/EEA country codes for GDPR strict mode
const GDPR_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", // EU members
  "IS", "LI", "NO", // EEA
  "GB", "CH" // UK and Switzerland also follow strict rules
]);

// EU timezone prefixes for client-side detection fallback
const EU_TIMEZONE_PREFIXES = [
  "Europe/", "Atlantic/Reykjavik", "Atlantic/Canary", "Atlantic/Madeira",
  "Atlantic/Azores", "Atlantic/Faroe"
];

// Detect if user is likely in a GDPR region
function isGDPRRegion(): boolean {
  if (typeof window === "undefined") return true; // Default to strict on server

  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return EU_TIMEZONE_PREFIXES.some(prefix => timezone.startsWith(prefix));
  } catch {
    return true; // Default to strict if detection fails
  }
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

export function getConsentPreferences(): ConsentPreferences | null {
  const cookie = getCookie(CONSENT_COOKIE_NAME);
  if (!cookie) return null;

  try {
    const parsed = JSON.parse(cookie);
    // Check if consent version matches
    if (parsed.version !== CONSENT_VERSION) return null;
    return {
      necessary: true,
      analytics: parsed.analytics ?? false,
      marketing: parsed.marketing ?? false,
    };
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  const prefs = getConsentPreferences();
  return prefs?.analytics ?? false;
}

export function hasMarketingConsent(): boolean {
  const prefs = getConsentPreferences();
  return prefs?.marketing ?? false;
}

// Update Google Consent Mode
function updateGoogleConsent(preferences: ConsentPreferences) {
  if (typeof window !== "undefined" && (window as any).gtag) {
    (window as any).gtag("consent", "update", {
      analytics_storage: preferences.analytics ? "granted" : "denied",
      ad_storage: preferences.marketing ? "granted" : "denied",
      ad_user_data: preferences.marketing ? "granted" : "denied",
      ad_personalization: preferences.marketing ? "granted" : "denied",
    });
  }
}

// Push consent event to dataLayer for GTM
function pushConsentToDataLayer(preferences: ConsentPreferences) {
  if (typeof window !== "undefined") {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({
      event: "consent_update",
      consent: {
        analytics: preferences.analytics,
        marketing: preferences.marketing,
      },
    });
  }
}

// Event name for opening cookie preferences
export const OPEN_COOKIE_PREFERENCES_EVENT = "openCookiePreferences";

// Function to open cookie preferences from anywhere
export function openCookiePreferences() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_COOKIE_PREFERENCES_EVENT));
  }
}

interface CookieConsentProps {
  onConsentChange?: (preferences: ConsentPreferences) => void;
}

export function CookieConsent({ onConsentChange }: CookieConsentProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [isStrictMode, setIsStrictMode] = useState(true); // Default to strict (GDPR)
  const [preferences, setPreferences] = useState<ConsentPreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Detect region for consent mode
    const strictMode = isGDPRRegion();
    setIsStrictMode(strictMode);

    // Check if user has already consented
    const existingConsent = getConsentPreferences();
    if (existingConsent) {
      setPreferences(existingConsent);
      updateGoogleConsent(existingConsent);
      pushConsentToDataLayer(existingConsent);
    } else {
      // For non-GDPR regions, default to enabled and auto-consent after showing banner
      if (!strictMode) {
        const defaultPrefs: ConsentPreferences = {
          necessary: true,
          analytics: true,
          marketing: true,
        };
        setPreferences(defaultPrefs);
      }
      // Show banner after a short delay for better UX
      const timer = setTimeout(() => setShowBanner(true), 1000);
      return () => clearTimeout(timer);
    }

    // Listen for event to open preferences
    const handleOpenPreferences = () => {
      setShowBanner(true);
      setShowPreferences(true);
    };

    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpenPreferences);
    return () => {
      window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpenPreferences);
    };
  }, []);

  const savePreferences = (prefs: ConsentPreferences) => {
    const consentData = {
      version: CONSENT_VERSION,
      analytics: prefs.analytics,
      marketing: prefs.marketing,
      timestamp: new Date().toISOString(),
    };

    // Store consent for 365 days
    setCookie(CONSENT_COOKIE_NAME, JSON.stringify(consentData), 365);

    // Update Google Consent Mode
    updateGoogleConsent(prefs);

    // Push to dataLayer for GTM
    pushConsentToDataLayer(prefs);

    setPreferences(prefs);
    setShowBanner(false);
    setShowPreferences(false);

    onConsentChange?.(prefs);
  };

  const acceptAll = () => {
    savePreferences({
      necessary: true,
      analytics: true,
      marketing: true,
    });
  };

  const acceptNecessaryOnly = () => {
    savePreferences({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  };

  const saveCustomPreferences = () => {
    savePreferences(preferences);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-xl p-6">
          {!showPreferences ? (
            // Main banner
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">We value your privacy</h3>
                <p className="text-gray-400 text-sm" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
                  {isStrictMode ? (
                    <>
                      We use cookies to enhance your browsing experience, analyze site traffic, and personalize content.
                      By clicking "Accept All", you consent to our use of cookies.
                    </>
                  ) : (
                    <>
                      We use cookies to enhance your browsing experience and analyze site traffic.
                      By continuing to use this site, you accept our use of cookies.
                    </>
                  )}
                  {" "}You can manage your preferences or learn more in our{" "}
                  <a href="/privacy" className="text-[#ed1b2f] hover:underline">Privacy Policy</a>.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                <button
                  onClick={() => setShowPreferences(true)}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition"
                >
                  Manage Preferences
                </button>
                {isStrictMode && (
                  <button
                    onClick={acceptNecessaryOnly}
                    className="px-4 py-2 text-sm text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition"
                  >
                    Necessary Only
                  </button>
                )}
                <button
                  onClick={acceptAll}
                  className="px-4 py-2 text-sm bg-[#ed1b2f] hover:bg-[#d4192a] text-white rounded-lg font-medium transition"
                >
                  {isStrictMode ? "Accept All" : "Got It"}
                </button>
              </div>
            </div>
          ) : (
            // Preferences panel
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold text-lg">Cookie Preferences</h3>
                <button
                  onClick={() => setShowPreferences(false)}
                  className="text-gray-400 hover:text-white transition"
                  aria-label="Close preferences"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4 mb-6">
                {/* Necessary cookies */}
                <div className="flex items-start justify-between gap-4 p-4 bg-[#0f0f0f] rounded-lg">
                  <div>
                    <h4 className="text-white font-medium mb-1">Necessary Cookies</h4>
                    <p className="text-gray-400 text-sm" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
                      These cookies are essential for the website to function properly. They enable basic functions like page navigation and access to secure areas.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <span className="text-gray-500 text-sm">Always Active</span>
                  </div>
                </div>

                {/* Analytics cookies */}
                <div className="flex items-start justify-between gap-4 p-4 bg-[#0f0f0f] rounded-lg">
                  <div>
                    <h4 className="text-white font-medium mb-1">Analytics Cookies</h4>
                    <p className="text-gray-400 text-sm" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
                      These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously. This helps us improve our services.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.analytics}
                        onChange={(e) => setPreferences({ ...preferences, analytics: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#ed1b2f] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ed1b2f]"></div>
                    </label>
                  </div>
                </div>

                {/* Marketing cookies */}
                <div className="flex items-start justify-between gap-4 p-4 bg-[#0f0f0f] rounded-lg">
                  <div>
                    <h4 className="text-white font-medium mb-1">Marketing Cookies</h4>
                    <p className="text-gray-400 text-sm" style={{ textWrapStyle: "balance" } as React.CSSProperties}>
                      These cookies are used to track visitors across websites. The intention is to display ads that are relevant and engaging for the individual user.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences.marketing}
                        onChange={(e) => setPreferences({ ...preferences, marketing: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#ed1b2f] rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ed1b2f]"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  onClick={acceptNecessaryOnly}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded-lg transition"
                >
                  Reject All
                </button>
                <button
                  onClick={saveCustomPreferences}
                  className="px-4 py-2 text-sm bg-[#ed1b2f] hover:bg-[#d4192a] text-white rounded-lg font-medium transition"
                >
                  Save Preferences
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook to check consent status
export function useConsent() {
  const [consent, setConsent] = useState<ConsentPreferences | null>(null);

  useEffect(() => {
    setConsent(getConsentPreferences());
  }, []);

  return consent;
}
