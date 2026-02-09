/**
 * Migration Script: Move settings from Account to Lobby
 *
 * This script migrates theme, socialLinks, technicalInfo, and loginPage settings
 * from the account level to the default lobby level for each account.
 *
 * Run with: npx tsx scripts/migrate-settings-to-lobbies.ts
 */

import { PrismaClient } from "../packages/db/src/generated/client/client.js";

const prisma = new PrismaClient();

interface AccountSettings {
  theme?: unknown;
  socialLinks?: unknown;
  technicalInfo?: unknown;
  loginPage?: unknown;
  googleAnalytics?: unknown;
  allowUserColorMode?: boolean;
  [key: string]: unknown;
}

async function migrateSettingsToLobbies() {
  console.log("Starting settings migration...\n");

  // Get all accounts with their default lobbies
  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      name: true,
      settings: true,
      lobbies: {
        where: { isDefault: true },
        take: 1,
        select: {
          id: true,
          name: true,
          settings: true,
        },
      },
    },
  });

  console.log(`Found ${accounts.length} accounts to process\n`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const account of accounts) {
    const accountSettings = (account.settings as AccountSettings) || {};
    const defaultLobby = account.lobbies[0];

    if (!defaultLobby) {
      console.log(`  [SKIP] Account "${account.name}" (${account.id}) - No default lobby`);
      skippedCount++;
      continue;
    }

    // Settings to migrate to lobby level
    const lobbySettings: Record<string, unknown> = {};
    const keepInAccount: Record<string, unknown> = {};

    // Move these to lobby.settings
    if (accountSettings.theme) {
      lobbySettings.theme = accountSettings.theme;
    }
    if (accountSettings.socialLinks) {
      lobbySettings.socialLinks = accountSettings.socialLinks;
    }
    if (accountSettings.technicalInfo) {
      lobbySettings.technicalInfo = accountSettings.technicalInfo;
    }
    if (accountSettings.loginPage) {
      lobbySettings.loginPage = accountSettings.loginPage;
    }

    // Keep these at account level (global settings)
    if (accountSettings.googleAnalytics) {
      keepInAccount.googleAnalytics = accountSettings.googleAnalytics;
    }
    if (typeof accountSettings.allowUserColorMode === "boolean") {
      keepInAccount.allowUserColorMode = accountSettings.allowUserColorMode;
    }

    // Skip if nothing to migrate
    if (Object.keys(lobbySettings).length === 0) {
      console.log(`  [SKIP] Account "${account.name}" (${account.id}) - No settings to migrate`);
      skippedCount++;
      continue;
    }

    // Merge with existing lobby settings
    const existingLobbySettings = (defaultLobby.settings as Record<string, unknown>) || {};
    const mergedLobbySettings = { ...existingLobbySettings, ...lobbySettings };

    // Perform the migration in a transaction
    await prisma.$transaction(async (tx) => {
      // Update lobby with migrated settings
      await tx.lobby.update({
        where: { id: defaultLobby.id },
        data: { settings: JSON.parse(JSON.stringify(mergedLobbySettings)) },
      });

      // Update account to only keep global settings
      await tx.account.update({
        where: { id: account.id },
        data: { settings: JSON.parse(JSON.stringify(keepInAccount)) },
      });
    });

    console.log(`  [OK] Account "${account.name}" -> Lobby "${defaultLobby.name}"`);
    console.log(`       Migrated: ${Object.keys(lobbySettings).join(", ")}`);
    migratedCount++;
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Migration complete!`);
  console.log(`  Migrated: ${migratedCount}`);
  console.log(`  Skipped:  ${skippedCount}`);
  console.log(`${"=".repeat(50)}\n`);
}

async function main() {
  try {
    await migrateSettingsToLobbies();
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
