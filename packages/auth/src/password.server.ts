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

export async function authenticateWithPassword(
  email: string,
  password: string
): Promise<AuthenticatedUser | null> {
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

  if (!user) return null;

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) return null;

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

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
