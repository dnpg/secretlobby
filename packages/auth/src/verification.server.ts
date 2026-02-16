import crypto from "crypto";
import { prisma } from "@secretlobby/db";
import { sendEmailVerification } from "@secretlobby/email";

/**
 * Email verification token configuration
 */
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24; // 24 hours to verify email

/**
 * Generates a secure random token for email verification
 * @returns A cryptographically secure random token
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Creates a verification token for a user and stores it in the database
 * @param userId - The user's ID
 * @returns The generated verification token
 */
export async function createVerificationToken(userId: string): Promise<string> {
  const token = generateVerificationToken();

  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerifyToken: token,
      emailVerified: false,
    },
  });

  return token;
}

/**
 * Verifies an email using the provided token
 * @param token - The verification token
 * @returns Result object with success status and optional user ID
 */
export async function verifyEmailWithToken(
  token: string
): Promise<
  | { success: true; userId: string }
  | { success: false; error: "invalid_token" | "already_verified" }
> {
  if (!token || token.length !== 64) {
    return { success: false, error: "invalid_token" };
  }

  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token },
  });

  if (!user) {
    return { success: false, error: "invalid_token" };
  }

  if (user.emailVerified) {
    return { success: false, error: "already_verified" };
  }

  // Mark email as verified and clear the token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerifyToken: null,
    },
  });

  return { success: true, userId: user.id };
}

/**
 * Resends a verification email for a user
 * @param email - The user's email address
 * @returns Result object with success status and optional token
 */
export async function resendVerificationEmail(
  email: string
): Promise<
  | { success: true; token: string; userId: string }
  | { success: false; error: "user_not_found" | "already_verified" }
> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user) {
    return { success: false, error: "user_not_found" };
  }

  if (user.emailVerified) {
    return { success: false, error: "already_verified" };
  }

  const token = await createVerificationToken(user.id);

  return { success: true, token, userId: user.id };
}

/**
 * Checks if a user's email is verified
 * @param userId - The user's ID
 * @returns True if email is verified, false otherwise
 */
export async function isEmailVerified(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });

  return user?.emailVerified ?? false;
}

/**
 * Generates a verification URL for the user
 * @param token - The verification token
 * @param baseUrl - The base URL of the application (e.g., https://console.secretlobby.co)
 * @returns The complete verification URL
 */
export function generateVerificationUrl(token: string, baseUrl: string): string {
  // Remove trailing slash from baseUrl
  const cleanBaseUrl = baseUrl.replace(/\/$/, "");
  return `${cleanBaseUrl}/verify-email?token=${token}`;
}

/**
 * Sends a verification email to the user
 * @param userId - The user's ID
 * @param baseUrl - The base URL of the application
 * @returns The verification token that was sent
 */
export async function sendVerificationEmail(
  userId: string,
  baseUrl: string
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, emailVerified: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.emailVerified) {
    throw new Error("Email already verified");
  }

  // Generate and store token
  const token = await createVerificationToken(userId);

  // Generate verification URL
  const verificationUrl = generateVerificationUrl(token, baseUrl);

  // Send email
  await sendEmailVerification({
    to: user.email,
    verificationUrl,
    userName: user.name || undefined,
  });

  return token;
}
