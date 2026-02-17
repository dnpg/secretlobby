/**
 * Create or update the initial Super Admin user from env vars.
 * Use this in production instead of the full seed (which is for local dev only).
 *
 * Requires: SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, DATABASE_URL
 * Run: pnpm db:create-super-admin
 * (Env is loaded from repo root .env when run via the package script.)
 */

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/client/client.js";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.trim();
const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;

if (!superAdminEmail || !superAdminPassword) {
  console.error("❌ Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in your environment, then run: pnpm db:create-super-admin");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function main() {
  const emailLower = superAdminEmail.toLowerCase();

  const superAdminUser = await prisma.user.upsert({
    where: { email: emailLower },
    update: { passwordHash: await hashPassword(superAdminPassword) },
    create: {
      email: emailLower,
      passwordHash: await hashPassword(superAdminPassword),
      name: "Super Admin",
      emailVerified: true,
    },
  });

  await prisma.staff.upsert({
    where: { userId: superAdminUser.id },
    update: { role: "OWNER" },
    create: { userId: superAdminUser.id, role: "OWNER" },
  });

  const staffCheck = await prisma.staff.findUnique({
    where: { userId: superAdminUser.id },
  });

  if (!staffCheck) {
    console.error("❌ Failed to create Staff record");
    process.exit(1);
  }

  console.log(`✓ Super Admin ready: ${superAdminUser.email}`);
  console.log("  Log in to the Super Admin app with this email and your SUPER_ADMIN_PASSWORD.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
