/**
 * Database Seed Script for SecretLobby.io
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
  // Summary
  // ============================================================================
  console.log("\n" + "=".repeat(60));
  console.log("🎉 Seed completed successfully!\n");
  console.log("Test Credentials:");
  console.log("─".repeat(40));
  console.log("Console Login (app.secretlobby.local):");
  console.log("  Email:    demo@example.com");
  console.log("  Password: user123");
  console.log("");
  console.log("  Email:    admin@example.com");
  console.log("  Password: admin123");
  console.log("");
  console.log("Lobby Access (demo.secretlobby.local):");
  console.log("  Password: user123");
  console.log("─".repeat(40));
  console.log("\nSubdomain URLs (after nginx setup):");
  console.log("  Marketing: http://secretlobby.local");
  console.log("  Console:   http://app.secretlobby.local");
  console.log("  Lobby:     http://demo.secretlobby.local");
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
