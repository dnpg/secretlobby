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
            account: { select: { id: true, name: true, slug: true } },
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
