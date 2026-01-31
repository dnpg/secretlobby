/**
 * CAPTCHA Integration (Cloudflare Turnstile)
 *
 * Cloudflare Turnstile is a privacy-preserving alternative to reCAPTCHA
 * Docs: https://developers.cloudflare.com/turnstile/
 */

import { createLogger } from "@secretlobby/logger";

const logger = createLogger({ service: "auth:captcha" });

/**
 * Cloudflare Turnstile verification response
 */
interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verify Cloudflare Turnstile CAPTCHA token
 *
 * @param token CAPTCHA token from client
 * @param ip Optional client IP address
 * @returns true if CAPTCHA is valid, false otherwise
 */
export async function verifyCaptcha(token: string, ip?: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    logger.warn("TURNSTILE_SECRET_KEY not configured - skipping CAPTCHA verification");
    return true; // Allow if CAPTCHA not configured (dev mode)
  }

  if (!token) {
    logger.warn({ ip }, "CAPTCHA token missing");
    return false;
  }

  try {
    const formData = new FormData();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (ip) {
      formData.append("remoteip", ip);
    }

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
      }
    );

    const data = (await response.json()) as TurnstileResponse;

    if (data.success) {
      logger.info({ ip }, "CAPTCHA verified successfully");
      return true;
    } else {
      logger.warn(
        { ip, errorCodes: data["error-codes"] },
        "CAPTCHA verification failed"
      );
      return false;
    }
  } catch (error) {
    logger.error({ error, ip }, "CAPTCHA verification error");
    return false; // Fail closed - deny on error
  }
}

/**
 * Check if CAPTCHA is configured and enabled
 */
export function isCaptchaEnabled(): boolean {
  return !!(
    process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY
  );
}

/**
 * Get CAPTCHA site key for client-side rendering
 * Only returns key if CAPTCHA is properly configured
 */
export function getCaptchaSiteKey(): string | null {
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  return siteKey && isCaptchaEnabled() ? siteKey : null;
}
