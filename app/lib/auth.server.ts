import bcrypt from "bcryptjs";
import { Google } from "arctic";
import { prisma } from "./db.server";
import type { User, AccountUser } from "@prisma/client";

// =============================================================================
// Password Hashing
// =============================================================================

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// =============================================================================
// Google OAuth
// =============================================================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const AUTH_URL = process.env.AUTH_URL || "http://localhost:5173";

export const google = new Google(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  `${AUTH_URL}/auth/google/callback`
);

export function isGoogleConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET &&
    !GOOGLE_CLIENT_ID.includes("your-google"));
}

// =============================================================================
// User Authentication
// =============================================================================

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  accounts: Array<{
    accountId: string;
    role: string;
    account: {
      id: string;
      name: string;
      slug: string;
    };
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
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

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

export async function authenticateWithGoogle(
  googleUser: { email: string; name?: string; picture?: string }
): Promise<AuthenticatedUser | null> {
  const email = googleUser.email.toLowerCase();

  // Check allowed domains if configured
  const allowedDomains = process.env.GOOGLE_ALLOWED_DOMAINS;
  if (allowedDomains) {
    const domains = allowedDomains.split(",").map((d) => d.trim().toLowerCase());
    const userDomain = email.split("@")[1];
    if (!domains.includes(userDomain)) {
      return null;
    }
  }

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { email },
    include: {
      accounts: {
        include: {
          account: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    // Create new user (they'll need to be added to an account separately)
    user = await prisma.user.create({
      data: {
        email,
        name: googleUser.name || null,
        avatarUrl: googleUser.picture || null,
        passwordHash: "", // No password for Google-only users
        emailVerified: true, // Google already verified the email
      },
      include: {
        accounts: {
          include: {
            account: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });
  } else {
    // Update user info from Google
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: googleUser.name || user.name,
        avatarUrl: googleUser.picture || user.avatarUrl,
        lastLoginAt: new Date(),
        emailVerified: true,
      },
    });
  }

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

// =============================================================================
// User Management
// =============================================================================

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

export async function getUserById(id: string): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      accounts: {
        include: {
          account: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
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
): Promise<AccountUser> {
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
