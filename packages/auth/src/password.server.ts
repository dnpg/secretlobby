import bcrypt from "bcryptjs";
import { prisma, type User } from "@secretlobby/db";

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

export async function createUser(
  email: string,
  password: string,
  name?: string
): Promise<User> {
  const passwordHash = await hashPassword(password);

  return prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name: name || null,
    },
  });
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
