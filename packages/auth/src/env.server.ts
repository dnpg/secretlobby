/**
 * Environment variable utilities for auth package
 * Provides secure access to required environment variables
 */

/**
 * Gets an environment variable and throws if it's not set
 * @param key - The environment variable name
 * @param context - Optional context for error message
 * @throws Error if the environment variable is not set
 */
export function getRequiredEnv(key: string, context?: string): string {
  const value = process.env[key];

  if (!value) {
    const contextMsg = context ? ` (${context})` : "";
    throw new Error(
      `Missing required environment variable: ${key}${contextMsg}\n` +
        `Please set ${key} in your .env file or environment.`
    );
  }

  return value;
}

/**
 * Gets an environment variable with a fallback value (only use for non-sensitive config)
 * @param key - The environment variable name
 * @param fallback - The fallback value
 */
export function getEnvWithFallback(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

/**
 * Validates that all required auth environment variables are set
 * Call this during application startup
 * @throws Error if any required variable is missing
 */
export function validateAuthEnv(): void {
  const requiredVars = [
    { key: "SESSION_SECRET", minLength: 32 },
  ];

  const errors: string[] = [];

  for (const { key, minLength } of requiredVars) {
    const value = process.env[key];

    if (!value) {
      errors.push(`❌ ${key} is not set`);
    } else if (minLength && value.length < minLength) {
      errors.push(
        `❌ ${key} must be at least ${minLength} characters (currently ${value.length})`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Auth environment validation failed:\n\n${errors.join("\n")}\n\n` +
        `Please check your .env file and ensure all required variables are set.`
    );
  }
}

/**
 * Gets the session secret with proper validation
 * @throws Error if SESSION_SECRET is not set or too short
 */
export function getSessionSecret(): string {
  const secret = getRequiredEnv(
    "SESSION_SECRET",
    "Required for session encryption. Must be at least 32 characters."
  );

  if (secret.length < 32) {
    throw new Error(
      `SESSION_SECRET must be at least 32 characters long (currently ${secret.length} characters).\n` +
        `Generate a secure secret with: openssl rand -base64 32`
    );
  }

  return secret;
}
