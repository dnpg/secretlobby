import bcrypt from "bcryptjs";
import { prisma, type User } from "@secretlobby/db";
import { sendVerificationEmail } from "./verification.server.js";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  accounts: Array<{
    accountId: string;
    role: string;
    account: { id: string; name: string; slug: string };
  }>;
}

const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export type AuthResult =
  | { success: true; user: AuthenticatedUser }
  | { success: false; error: "invalid_credentials"; remainingAttempts: number }
  | { success: false; error: "account_locked"; lockedUntil: Date };

export async function authenticateWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: {
      accounts: {
        include: {
          account: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  if (!user) {
    return { success: false, error: "invalid_credentials", remainingAttempts: 0 };
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { success: false, error: "account_locked", lockedUntil: user.lockedUntil };
  }

  // If lock has expired, reset attempts
  if (user.lockedUntil && user.lockedUntil <= new Date()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    const currentAttempts = user.lockedUntil && user.lockedUntil <= new Date() ? 0 : (user.failedLoginAttempts ?? 0);
    const newAttempts = currentAttempts + 1;
    const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: newAttempts, lockedUntil },
      });
      return { success: false, error: "account_locked", lockedUntil };
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: newAttempts },
    });

    return { success: false, error: "invalid_credentials", remainingAttempts: remaining };
  }

  // Success — reset attempts and update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      accounts: user.accounts.map((au) => ({
        accountId: au.accountId,
        role: au.role,
        account: au.account,
      })),
    },
  };
}

export interface CreateUserOptions {
  /** Display name (editable by user); defaults to firstName if not set */
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export async function createUser(
  email: string,
  password: string,
  options?: CreateUserOptions | string
): Promise<User> {
  const passwordHash = await hashPassword(password);
  const opts = typeof options === "string" ? { name: options || null } : options;
  const firstName = opts?.firstName?.trim() || null;
  const lastName = opts?.lastName?.trim() || null;
  const displayName = opts?.name?.trim() || firstName || null;

  return prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      name: displayName,
      emailVerified: false,
    },
  });
}

/**
 * Creates a new user with password and sends email verification
 * @param email - User's email address
 * @param password - User's password
 * @param baseUrl - Base URL for verification link (e.g., https://console.secretlobby.co)
 * @param name - Optional user name
 * @returns The created user and verification token
 */
export async function createUserWithVerification(
  email: string,
  password: string,
  baseUrl: string,
  options?: CreateUserOptions | string
): Promise<{ user: User; verificationToken: string }> {
  const user = await createUser(email, password, options);

  // Send verification email
  const verificationToken = await sendVerificationEmail(user.id, baseUrl);

  return { user, verificationToken };
}

export async function getUserById(
  id: string
): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      accounts: {
        include: {
          account: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    accounts: user.accounts.map((au) => ({
      accountId: au.accountId,
      role: au.role,
      account: au.account,
    })),
  };
}

export async function addUserToAccount(
  userId: string,
  accountId: string,
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" = "VIEWER",
  invitedBy?: string
) {
  return prisma.accountUser.create({
    data: {
      userId,
      accountId,
      role,
      invitedBy,
      acceptedAt: new Date(),
    },
  });
}
