import { Google } from "arctic";
import { prisma } from "@secretlobby/db";
import type { AuthenticatedUser } from "./password.server.js";

let google: Google | null = null;

export function getGoogleClient(): Google | null {
  if (google) return google;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const authUrl = process.env.AUTH_URL || "http://localhost:5173";
  const redirectUri = `${authUrl}/auth/google/callback`;

  if (!clientId || !clientSecret) return null;

  google = new Google(clientId, clientSecret, redirectUri);
  return google;
}

export function isGoogleConfigured(): boolean {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return Boolean(
    clientId &&
    clientSecret &&
    !clientId.includes("your-google")
  );
}

interface GoogleUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export async function authenticateWithGoogle(
  googleUser: GoogleUser
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
          account: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!user) {
    // Create new user with account and default lobby
    const userName = googleUser.name || email.split("@")[0];

    // Generate unique slug from email/name
    const baseSlug = userName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

    let slug = /^[a-z]/.test(baseSlug) ? baseSlug : `account-${baseSlug}`;
    let counter = 1;

    // Ensure unique slug
    while (await prisma.account.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create user, account, and lobby in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          email,
          name: googleUser.name || null,
          avatarUrl: googleUser.picture || null,
          passwordHash: "", // No password for Google-only users
          emailVerified: true, // Google already verified the email
        },
      });

      // Create account
      const account = await tx.account.create({
        data: {
          name: userName,
          slug,
          subscriptionTier: "FREE",
        },
      });

      // Link user to account as OWNER
      await tx.accountUser.create({
        data: {
          userId: newUser.id,
          accountId: account.id,
          role: "OWNER",
          acceptedAt: new Date(),
        },
      });

      // Create default lobby
      const lobby = await tx.lobby.create({
        data: {
          accountId: account.id,
          name: "Main Lobby",
          slug: "main",
          title: userName,
          description: `Welcome to ${userName}`,
          isDefault: true,
          password: "", // No password initially
        },
      });

      // Update account with default lobby reference
      await tx.account.update({
        where: { id: account.id },
        data: { defaultLobbyId: lobby.id },
      });

      return newUser;
    });

    // Fetch user with accounts to return
    user = await prisma.user.findUnique({
      where: { id: result.id },
      include: {
        accounts: {
          include: {
            account: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    if (!user) {
      throw new Error("Failed to create user");
    }
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

    // Check if user has no accounts (orphaned user from previous OAuth)
    if (user.accounts.length === 0) {
      const userName = googleUser.name || user.name || email.split("@")[0];

      // Generate unique slug from email/name
      const baseSlug = userName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();

      let slug = /^[a-z]/.test(baseSlug) ? baseSlug : `account-${baseSlug}`;
      let counter = 1;

      // Ensure unique slug
      while (await prisma.account.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      // Create account and lobby for existing user without accounts
      await prisma.$transaction(async (tx) => {
        // Create account
        const account = await tx.account.create({
          data: {
            name: userName,
            slug,
            subscriptionTier: "FREE",
          },
        });

        // Link user to account as OWNER
        await tx.accountUser.create({
          data: {
            userId: user.id,
            accountId: account.id,
            role: "OWNER",
            acceptedAt: new Date(),
          },
        });

        // Create default lobby
        const lobby = await tx.lobby.create({
          data: {
            accountId: account.id,
            name: "Main Lobby",
            slug: "main",
            title: userName,
            description: `Welcome to ${userName}`,
            isDefault: true,
            password: "", // No password initially
          },
        });

        // Update account with default lobby reference
        await tx.account.update({
          where: { id: account.id },
          data: { defaultLobbyId: lobby.id },
        });
      });

      // Fetch user with newly created account
      user = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          accounts: {
            include: {
              account: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      });

      if (!user) {
        throw new Error("Failed to fetch user after creating account");
      }
    }
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
