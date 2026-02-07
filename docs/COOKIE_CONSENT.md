# Cookie Consent & Privacy Compliance

This document explains how cookie consent works in the marketing site and the considerations for third-party tracking codes.

## Overview

The marketing site implements a GDPR and CCPA compliant cookie consent system using Google Consent Mode v2. This ensures that tracking scripts respect user privacy preferences while still allowing basic site functionality.

## Region-Based Consent

The system automatically detects the user's region and adjusts the consent experience:

### GDPR Mode (EU/EEA/UK/Switzerland)
- **Opt-in required**: All non-essential cookies disabled by default
- **Explicit consent**: Users must click "Accept All" to enable tracking
- **Buttons shown**: "Manage Preferences", "Necessary Only", "Accept All"
- Detection: Based on browser timezone (Europe/*)

### CCPA Mode (US and other regions)
- **Opt-out model**: Cookies enabled by default
- **Implicit consent**: Users can continue with cookies enabled
- **Buttons shown**: "Manage Preferences", "Got It"
- Users can still opt-out via "Manage Preferences"

### Region Detection

The system uses the browser's timezone to detect region:

```typescript
const EU_TIMEZONE_PREFIXES = [
  "Europe/", "Atlantic/Reykjavik", "Atlantic/Canary", ...
];

function isGDPRRegion(): boolean {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return EU_TIMEZONE_PREFIXES.some(prefix => timezone.startsWith(prefix));
}
```

For more accurate detection, consider using server-side IP geolocation (Cloudflare CF-IPCountry header, MaxMind, etc.).

## How It Works

### 1. Default Consent State

When a user first visits the site, before any tracking scripts load, we set default consent to "denied" for all tracking-related consent types:

```javascript
gtag('consent', 'default', {
  'analytics_storage': 'denied',    // GA4 cookies
  'ad_storage': 'denied',           // Advertising cookies
  'ad_user_data': 'denied',         // User data for ads
  'ad_personalization': 'denied',   // Personalized ads
  'functionality_storage': 'granted', // Essential functionality
  'personalization_storage': 'denied', // Personalization features
  'security_storage': 'granted',    // Security-related storage
  'wait_for_update': 500            // Wait 500ms for consent update
});
```

### 2. Cookie Banner

A cookie consent banner appears after 1 second, giving users three options:

- **Accept All**: Enables all cookies (analytics + marketing)
- **Necessary Only**: Only essential cookies (no tracking)
- **Manage Preferences**: Granular control over each category

### 3. Consent Categories

| Category | Purpose | Default | Can User Disable? |
|----------|---------|---------|-------------------|
| Necessary | Site functionality, security | Enabled | No |
| Analytics | GA4, usage tracking | Disabled | Yes |
| Marketing | Ads, remarketing | Disabled | Yes |

### 4. Consent Update

When a user makes a choice, we update Google Consent Mode:

```javascript
gtag('consent', 'update', {
  'analytics_storage': 'granted', // or 'denied'
  'ad_storage': 'granted',        // or 'denied'
  'ad_user_data': 'granted',      // or 'denied'
  'ad_personalization': 'granted' // or 'denied'
});
```

We also push a `consent_update` event to the dataLayer for GTM:

```javascript
dataLayer.push({
  event: 'consent_update',
  consent: {
    analytics: true,  // or false
    marketing: true   // or false
  }
});
```

### 5. Consent Storage

Consent preferences are stored in a cookie named `cookie_consent` for 365 days:

```json
{
  "version": "1",
  "analytics": true,
  "marketing": false,
  "timestamp": "2026-02-07T..."
}
```

The version field allows us to re-prompt users if consent options change.

## Integration with Google Analytics 4

GA4 automatically respects Google Consent Mode. When `analytics_storage` is denied:

- GA4 still loads (for cookieless pings)
- No cookies are set
- No user identifiers are stored
- Basic, privacy-safe measurement still works

When consent is granted:
- Full tracking is enabled
- Cookies are set
- User behavior can be tracked across sessions

## Integration with Google Tag Manager

GTM also respects Consent Mode. To properly configure tags in GTM:

### Built-in Consent Checks

Modern GTM tags have built-in consent checks. For tags that require consent:

1. Go to tag settings in GTM
2. Under "Consent Settings", set the required consent type:
   - `analytics_storage` for analytics tags
   - `ad_storage` for advertising tags

### Custom Consent Trigger

You can also create triggers based on the `consent_update` event:

1. Create a Custom Event trigger for `consent_update`
2. Add conditions based on the consent object in dataLayer

## Third-Party Code Considerations

### Adding New Third-Party Scripts

When adding any third-party tracking or marketing script, consider:

1. **Does it set cookies?** If yes, it likely needs consent.
2. **Does it track user behavior?** If yes, it needs consent.
3. **Is it essential for site functionality?** If no, it needs consent.

### Categories for Common Tools

| Tool | Category | Consent Required |
|------|----------|------------------|
| Google Analytics 4 | Analytics | Yes |
| Google Tag Manager | Container | No (but tags inside do) |
| Google Ads | Marketing | Yes |
| Meta Pixel (Facebook) | Marketing | Yes |
| HotJar | Analytics | Yes |
| Intercom | Functionality | Depends on usage |
| Stripe | Necessary | No |
| Cloudflare | Necessary | No |

### Implementation Pattern for New Scripts

For scripts that need consent, use this pattern:

```typescript
import { hasAnalyticsConsent, hasMarketingConsent } from '~/components/CookieConsent';

// Check consent before loading
if (hasAnalyticsConsent()) {
  // Load analytics script
}

if (hasMarketingConsent()) {
  // Load marketing script
}
```

Or use GTM with proper consent configuration to manage all third-party scripts.

### Scripts That Must NOT Wait for Consent

Some scripts are essential and should load without consent:

- Payment processors (Stripe, PayPal)
- Security tools (Cloudflare, reCAPTCHA)
- Error tracking (Sentry - but anonymize data)
- Authentication services
- CDN resources

## GDPR Compliance Checklist

- [x] Default consent is "denied"
- [x] Banner appears before tracking starts
- [x] Clear explanation of cookie purposes
- [x] Easy way to accept or reject
- [x] Granular preference controls
- [x] Consent is stored securely
- [x] Easy way to change preferences later
- [x] Link to Privacy Policy
- [x] No pre-checked boxes for non-essential cookies

## CCPA Compliance Checklist

- [x] "Do Not Sell My Personal Information" implied by "Necessary Only"
- [x] Clear disclosure of data collection
- [x] Ability to opt-out of sale/sharing
- [x] No discrimination for exercising rights
- [x] Link to Privacy Policy

## Cookie Policy Link

The footer should link to `/privacy` which contains the cookie policy section. Consider adding a dedicated `/cookies` page if needed for more detailed information.

## Testing Consent

### Manual Testing

1. Clear cookies and visit the site
2. Verify banner appears after ~1 second
3. Open browser DevTools > Application > Cookies
4. Click "Necessary Only" - verify no GA cookies are set
5. Clear cookies, refresh, click "Accept All"
6. Verify GA cookies appear (e.g., `_ga`, `_ga_XXXXX`)

### Testing in GTM Preview Mode

1. Enable GTM Preview mode
2. Check the "Consent" tab to see current consent state
3. Verify tags fire only when appropriate consent is granted

## Updating Consent Options

If you need to add new consent categories or change existing ones:

1. Update the `ConsentPreferences` type in `CookieConsent.tsx`
2. Increment `CONSENT_VERSION` to re-prompt existing users
3. Update the UI to show new options
4. Update this documentation

## Files

| File | Purpose |
|------|---------|
| `apps/marketing/app/components/CookieConsent.tsx` | Cookie consent banner component |
| `apps/marketing/app/root.tsx` | Consent Mode initialization + script loading |
| `apps/marketing/app/routes/privacy.tsx` | Privacy policy page |
| `docs/COOKIE_CONSENT.md` | This documentation |

## Resources

- [Google Consent Mode v2](https://developers.google.com/tag-platform/security/guides/consent)
- [GDPR Cookie Compliance](https://gdpr.eu/cookies/)
- [CCPA Requirements](https://oag.ca.gov/privacy/ccpa)
- [GTM Consent Mode Setup](https://support.google.com/tagmanager/answer/10718549)
