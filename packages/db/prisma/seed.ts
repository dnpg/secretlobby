/**
 * Database Seed Script for secretlobby.co
 *
 * Creates test data for local development:
 * - Demo user with password login
 * - Demo account (band)
 * - Demo lobby with password protection
 * - Sample tracks
 *
 * Run with: pnpm run db:seed
 */

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/client/client.js";
import pg from "pg";

const { Pool } = pg;

// Create a direct database connection for seeding
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ DATABASE_URL environment variable is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function disconnectDb() {
  await prisma.$disconnect();
  await pool.end();
}

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function main() {
  console.log("🌱 Starting database seed...\n");

  // ============================================================================
  // 1. Create Demo User
  // ============================================================================
  console.log("Creating demo user...");

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      passwordHash: await hashPassword("user123"),
      name: "Demo User",
      emailVerified: true,
    },
  });

  console.log(`  ✓ User: ${demoUser.email} (password: user123)`);

  // ============================================================================
  // 2. Create Demo Account (Band)
  // ============================================================================
  console.log("\nCreating demo account...");

  const demoAccount = await prisma.account.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Band",
      slug: "demo",
      subscriptionTier: "FREE",
      settings: {
        theme: "dark",
        allowRegistration: true,
      },
    },
  });

  console.log(`  ✓ Account: ${demoAccount.name} (slug: ${demoAccount.slug})`);

  // ============================================================================
  // 3. Link User to Account as Owner
  // ============================================================================
  console.log("\nLinking user to account...");

  const accountUser = await prisma.accountUser.upsert({
    where: {
      accountId_userId: {
        accountId: demoAccount.id,
        userId: demoUser.id,
      },
    },
    update: {},
    create: {
      accountId: demoAccount.id,
      userId: demoUser.id,
      role: "OWNER",
      acceptedAt: new Date(),
    },
  });

  console.log(`  ✓ ${demoUser.email} is OWNER of ${demoAccount.name}`);

  // ============================================================================
  // 4. Create Demo Lobby
  // ============================================================================
  console.log("\nCreating demo lobby...");

  const demoLobby = await prisma.lobby.upsert({
    where: {
      accountId_slug: {
        accountId: demoAccount.id,
        slug: "main",
      },
    },
    update: {},
    create: {
      accountId: demoAccount.id,
      name: "Main Lobby",
      slug: "main",
      title: "Demo Band - Private Listening Room",
      description: "Welcome to our private music lobby. Enjoy exclusive tracks!",
      isPublished: true,
      isDefault: true,
      password: "user123", // Lobby access password
      settings: {
        theme: {
          colorMode: "dark",
          bgPrimary: "#030712",
          bgSecondary: "#111827",
          textPrimary: "#ffffff",
          accent: "#3b82f6",
        },
      },
    },
  });

  console.log(`  ✓ Lobby: ${demoLobby.name} (password: user123)`);

  // Update account with default lobby
  await prisma.account.update({
    where: { id: demoAccount.id },
    data: { defaultLobbyId: demoLobby.id },
  });

  // ============================================================================
  // 5. Create Sample Tracks
  // ============================================================================
  console.log("\nCreating sample tracks...");

  const sampleTracks = [
    {
      title: "Opening Track",
      artist: "Demo Band",
      filename: "track-01.mp3",
      duration: 245,
      position: 0,
    },
    {
      title: "Second Song",
      artist: "Demo Band",
      filename: "track-02.mp3",
      duration: 312,
      position: 1,
    },
    {
      title: "Acoustic Version",
      artist: "Demo Band",
      filename: "track-03.mp3",
      duration: 198,
      position: 2,
    },
  ];

  for (const track of sampleTracks) {
    await prisma.track.upsert({
      where: {
        id: `seed-track-${track.position}`,
      },
      update: {},
      create: {
        id: `seed-track-${track.position}`,
        lobbyId: demoLobby.id,
        ...track,
      },
    });
    console.log(`  ✓ Track: ${track.title}`);
  }

  // ============================================================================
  // 6. Create Additional Test User (Admin)
  // ============================================================================
  console.log("\nCreating admin user...");

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash: await hashPassword("admin123"),
      name: "Admin User",
      emailVerified: true,
    },
  });

  await prisma.accountUser.upsert({
    where: {
      accountId_userId: {
        accountId: demoAccount.id,
        userId: adminUser.id,
      },
    },
    update: {},
    create: {
      accountId: demoAccount.id,
      userId: adminUser.id,
      role: "ADMIN",
      acceptedAt: new Date(),
    },
  });

  console.log(`  ✓ User: ${adminUser.email} (password: admin123) - ADMIN role`);

  // ============================================================================
  // 7. Create Super Admin User (from environment variables)
  // ============================================================================
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;

  if (superAdminEmail && superAdminPassword) {
    console.log("\nCreating super admin user...");

    // Create a dedicated super admin account
    const superAdminAccount = await prisma.account.upsert({
      where: { slug: "super-admin" },
      update: {},
      create: {
        name: "Super Admin",
        slug: "super-admin",
        subscriptionTier: "ENTERPRISE",
        settings: {
          isSuperAdminAccount: true,
        },
      },
    });

    const superAdminUser = await prisma.user.upsert({
      where: { email: superAdminEmail.toLowerCase() },
      update: {
        passwordHash: await hashPassword(superAdminPassword),
      },
      create: {
        email: superAdminEmail.toLowerCase(),
        passwordHash: await hashPassword(superAdminPassword),
        name: "Super Admin",
        emailVerified: true,
      },
    });

    await prisma.accountUser.upsert({
      where: {
        accountId_userId: {
          accountId: superAdminAccount.id,
          userId: superAdminUser.id,
        },
      },
      update: {
        role: "OWNER",
      },
      create: {
        accountId: superAdminAccount.id,
        userId: superAdminUser.id,
        role: "OWNER",
        acceptedAt: new Date(),
      },
    });

    console.log(`  ✓ Super Admin: ${superAdminUser.email} (OWNER of super-admin account)`);
  } else {
    console.log("\n⚠️  Skipping super admin user (SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD not set)");
  }

  // ============================================================================
  // 8. Create Default Subscription Plans
  // ============================================================================
  console.log("\nCreating default subscription plans...");

  const defaultPlans = [
    {
      slug: "FREE",
      name: "Free",
      description: "Get started with basic features",
      priceMonthly: 0,
      priceYearly: 0,
      maxSongs: 5,
      maxLobbies: 1,
      maxStorage: 100,
      customDomain: false,
      apiAccess: false,
      highlighted: false,
      position: 0,
      features: [
        "Up to 5 songs",
        "1 lobby",
        "100MB storage",
        "Basic analytics",
        "Community support",
      ],
    },
    {
      slug: "STARTER",
      name: "Starter",
      description: "Perfect for emerging artists",
      priceMonthly: 999, // $9.99
      priceYearly: 9990, // $99.90
      maxSongs: 50,
      maxLobbies: 3,
      maxStorage: 1000,
      customDomain: false,
      apiAccess: false,
      highlighted: false,
      position: 1,
      features: [
        "Up to 50 songs",
        "3 lobbies",
        "1GB storage",
        "Advanced analytics",
        "Email support",
        "Custom branding",
      ],
    },
    {
      slug: "PRO",
      name: "Pro",
      description: "For professional artists and labels",
      priceMonthly: 2499, // $24.99
      priceYearly: 24990, // $249.90
      maxSongs: -1, // unlimited
      maxLobbies: 10,
      maxStorage: 10000,
      customDomain: true,
      apiAccess: true,
      highlighted: true,
      position: 2,
      features: [
        "Unlimited songs",
        "10 lobbies",
        "10GB storage",
        "Custom domain",
        "API access",
        "Priority support",
        "Advanced analytics",
        "Custom branding",
      ],
    },
    {
      slug: "ENTERPRISE",
      name: "Enterprise",
      description: "For labels and large organizations",
      priceMonthly: 9999, // $99.99
      priceYearly: 99990, // $999.90
      maxSongs: -1,
      maxLobbies: -1,
      maxStorage: -1,
      customDomain: true,
      apiAccess: true,
      highlighted: false,
      position: 3,
      features: [
        "Unlimited everything",
        "Multiple accounts",
        "Dedicated account manager",
        "Custom integrations",
        "SLA guarantee",
        "White-label options",
      ],
    },
  ];

  for (const plan of defaultPlans) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: {
        name: plan.name,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        maxSongs: plan.maxSongs,
        maxLobbies: plan.maxLobbies,
        maxStorage: plan.maxStorage,
        customDomain: plan.customDomain,
        apiAccess: plan.apiAccess,
        highlighted: plan.highlighted,
        position: plan.position,
        features: plan.features,
      },
      create: {
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        maxSongs: plan.maxSongs,
        maxLobbies: plan.maxLobbies,
        maxStorage: plan.maxStorage,
        customDomain: plan.customDomain,
        apiAccess: plan.apiAccess,
        highlighted: plan.highlighted,
        position: plan.position,
        features: plan.features,
      },
    });
    console.log(`  ✓ Plan: ${plan.name}`);
  }

  // ============================================================================
  // 9. Create Default System Settings
  // ============================================================================
  console.log("\nCreating default system settings...");

  await prisma.systemSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      enabledGateways: ["stripe"],
      defaultGateway: "stripe",
      platformName: "SecretLobby",
      supportEmail: "support@secretlobby.co",
      allowSignups: true,
      maintenanceMode: false,
    },
  });

  console.log("  ✓ System settings initialized");

  // ============================================================================
  // 10. Email HTML elements (header, footer) and notification templates
  // ============================================================================
  console.log("\nCreating default email elements and templates...");

  await prisma.emailHtmlElement.upsert({
    where: { key: "header" },
    update: {
      html: `<!-- Email Header: white bg, centered logo ({{consoleUrl}}) -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 24px 16px 24px; text-align:center;">
      <img src="{{consoleUrl}}/secret-lobby.png" alt="SecretLobby" width="200" height="200" style="display:block; border:0; outline:none; text-decoration:none; margin:0 auto; width:200px; height:200px;" />
    </td>
  </tr>
</table>`,
    },
    create: {
      key: "header",
      name: "Email Header",
      html: `<!-- Email Header: white bg, centered logo ({{consoleUrl}}) -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 24px 16px 24px; text-align:center;">
      <img src="{{consoleUrl}}/secret-lobby.png" alt="SecretLobby" width="200" height="200" style="display:block; border:0; outline:none; text-decoration:none; margin:0 auto; width:200px; height:200px;" />
    </td>
  </tr>
</table>`,
    },
  });

  await prisma.emailHtmlElement.upsert({
    where: { key: "footer" },
    update: {
      html: `<!-- Email Footer: white bg, black text, brand red link -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#ffffff;">
  <tr>
    <td style="padding:24px; border-top:1px solid #e5e7eb;">
      <p style="margin:0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12px; color:#111111; line-height:1.5;">
        &copy; {{year}} SecretLobby. All rights reserved.
      </p>
      <p style="margin:8px 0 0 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12px;">
        <a href="https://secretlobby.co" style="color:#ed1b2f; text-decoration:none;">secretlobby.co</a>
      </p>
    </td>
  </tr>
</table>`,
    },
    create: {
      key: "footer",
      name: "Email Footer",
      html: `<!-- Email Footer: white bg, black text, brand red link -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; margin:0 auto; background-color:#ffffff;">
  <tr>
    <td style="padding:24px; border-top:1px solid #e5e7eb;">
      <p style="margin:0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12px; color:#111111; line-height:1.5;">
        &copy; {{year}} SecretLobby. All rights reserved.
      </p>
      <p style="margin:8px 0 0 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:12px;">
        <a href="https://secretlobby.co" style="color:#ed1b2f; text-decoration:none;">secretlobby.co</a>
      </p>
    </td>
  </tr>
</table>`,
    },
  });

  const invitationBody = `<!-- Body: Invitation - white bg, black text, brand red CTA -->
<tr>
  <td style="padding:32px 24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color:#ffffff;">
    <h2 style="margin:0 0 16px 0; font-size:24px; font-weight:700; color:#111111;">You're Invited!</h2>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">Hi {{userName}},</p>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">You've been invited to join SecretLobby — the private music sharing platform for artists. Create your own password-protected lobby and share your unreleased tracks with your fans.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:32px 0;">
      <tr>
        <td align="center">
          <a href="{{inviteUrl}}" style="display:inline-block; background-color:#ed1b2f; color:#ffffff !important; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px;">Create Your Account</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#111111;">This invitation link will expire in {{expiresInDays}} days and can only be used once.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0 0; border-top:1px solid #e5e7eb;">
      <tr>
        <td style="padding-top:16px;">
          <p style="margin:0; font-size:12px; color:#374151;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="margin:4px 0 0 0;"><a href="{{inviteUrl}}" style="color:#ed1b2f; word-break:break-all;">{{inviteUrl}}</a></p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  const verificationBody = `<!-- Body: Email verification - white bg, black text, brand red CTA -->
<tr>
  <td style="padding:32px 24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color:#ffffff;">
    <h2 style="margin:0 0 16px 0; font-size:24px; font-weight:700; color:#111111;">Verify your email address</h2>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">Hi {{userName}},</p>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">Thanks for signing up! Please verify your email address to get started with SecretLobby.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:32px 0;">
      <tr>
        <td align="center">
          <a href="{{verificationUrl}}" style="display:inline-block; background-color:#ed1b2f; color:#ffffff !important; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px;">Verify Email</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#111111;">This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0 0; border-top:1px solid #e5e7eb;">
      <tr>
        <td style="padding-top:16px;">
          <p style="margin:0; font-size:12px; color:#374151;">If the button doesn't work, copy and paste this link:</p>
          <p style="margin:4px 0 0 0;"><a href="{{verificationUrl}}" style="color:#ed1b2f; word-break:break-all;">{{verificationUrl}}</a></p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  const passwordResetBody = `<!-- Body: Password reset - white bg, black text, brand red CTA -->
<tr>
  <td style="padding:32px 24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color:#ffffff;">
    <h2 style="margin:0 0 16px 0; font-size:24px; font-weight:700; color:#111111;">Reset your password</h2>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">Hi {{userName}},</p>
    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#111111;">We received a request to reset your password. Click the button below to choose a new one:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:32px 0;">
      <tr>
        <td align="center">
          <a href="{{resetUrl}}" style="display:inline-block; background-color:#ed1b2f; color:#ffffff !important; padding:14px 32px; border-radius:8px; text-decoration:none; font-weight:600; font-size:16px;">Reset Password</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#111111;">This link will expire in 10 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0 0; border-top:1px solid #e5e7eb;">
      <tr>
        <td style="padding-top:16px;">
          <p style="margin:0; font-size:12px; color:#374151;">If the button doesn't work, copy and paste this link:</p>
          <p style="margin:4px 0 0 0;"><a href="{{resetUrl}}" style="color:#ed1b2f; word-break:break-all;">{{resetUrl}}</a></p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  await prisma.emailTemplate.upsert({
    where: { key: "invitation" },
    update: { subject: "You're invited to SecretLobby!", bodyHtml: invitationBody },
    create: {
      key: "invitation",
      name: "Invitation",
      subject: "You're invited to SecretLobby!",
      bodyHtml: invitationBody,
    },
  });
  await prisma.emailTemplate.upsert({
    where: { key: "email_verification" },
    update: { subject: "Verify your email address", bodyHtml: verificationBody },
    create: {
      key: "email_verification",
      name: "Email verification",
      subject: "Verify your email address",
      bodyHtml: verificationBody,
    },
  });
  await prisma.emailTemplate.upsert({
    where: { key: "password_reset" },
    update: { subject: "Reset your password", bodyHtml: passwordResetBody },
    create: {
      key: "password_reset",
      name: "Password reset",
      subject: "Reset your password",
      bodyHtml: passwordResetBody,
    },
  });

  console.log("  ✓ Email header and footer elements");
  console.log("  ✓ Email templates: invitation, email_verification, password_reset");

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("\n" + "=".repeat(60));
  console.log("🎉 Seed completed successfully!\n");
  console.log("Test Credentials:");
  console.log("─".repeat(40));
  console.log("Console Login (console.secretlobby.local):");
  console.log("  Email:    demo@example.com");
  console.log("  Password: user123");
  console.log("");
  console.log("  Email:    admin@example.com");
  console.log("  Password: admin123");
  if (superAdminEmail) {
    console.log("");
    console.log("Super Admin (admin.secretlobby.local):");
    console.log(`  Email:    ${superAdminEmail}`);
    console.log("  Password: (from SUPER_ADMIN_PASSWORD env var)");
  }
  console.log("");
  console.log("Lobby Access (demo.secretlobby.local):");
  console.log("  Password: user123");
  console.log("─".repeat(40));
  console.log("\nSubdomain URLs (after nginx setup):");
  console.log("  Marketing:    http://secretlobby.local");
  console.log("  Console:      http://console.secretlobby.local");
  console.log("  Super Admin:  http://admin.secretlobby.local");
  console.log("  Lobby:        http://demo.secretlobby.local");
  console.log("=".repeat(60) + "\n");
}

main()
  .then(async () => {
    await disconnectDb();
  })
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await disconnectDb();
    process.exit(1);
  });
