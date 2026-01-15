import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Declare a global type for the Prisma client to prevent multiple instances in dev
declare global {
  var __prisma: PrismaClient | undefined;
}

// Create the PostgreSQL adapter for Prisma 7.x
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Create a single instance of Prisma Client
// In development, we store it on globalThis to prevent creating multiple clients
// due to hot module reloading
const prisma = globalThis.__prisma ?? new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development"
    ? ["query", "error", "warn"]
    : ["error"],
});

if (process.env.NODE_ENV === "development") {
  globalThis.__prisma = prisma;
}

export { prisma };

// Helper to disconnect (useful for tests and scripts)
export async function disconnectDb() {
  await prisma.$disconnect();
}
