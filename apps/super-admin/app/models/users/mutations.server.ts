import { prisma } from "@secretlobby/db";
import { createUser, addUserToAccount, hashPassword, verifyPassword } from "@secretlobby/auth";
import { passwordSchema } from "@secretlobby/auth/validation";
import type { UserRole } from "@secretlobby/db";

/** Staff changing their own password (requires current password). */
export async function updateOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: true } | { error: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) return { error: "User not found" };

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect" };

  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Password does not meet requirements" };
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
  return { success: true };
}

export async function createUserAdmin(options: {
  email: string;
  password: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailVerified?: boolean;
  accountId?: string | null;
  role?: UserRole;
}): Promise<{ success: true; userId: string } | { error: string }> {
  const email = options.email.trim().toLowerCase();
  if (!email) return { error: "Email is required" };

  const parsed = passwordSchema.safeParse(options.password);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Password does not meet requirements" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "A user with this email already exists" };

  const user = await createUser(email, options.password, {
    name: options.name ?? undefined,
    firstName: options.firstName ?? undefined,
    lastName: options.lastName ?? undefined,
  });

  if (options.emailVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
  }

  if (options.accountId && options.role) {
    await addUserToAccount(user.id, options.accountId, options.role);
  }

  return { success: true, userId: user.id };
}

export async function updateUserAdmin(
  userId: string,
  data: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
    emailVerified?: boolean;
    newPassword?: string | null;
  }
): Promise<{ success: true } | { error: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "User not found" };

  const updates: Parameters<typeof prisma.user.update>[0]["data"] = {};

  if (data.name !== undefined) {
    updates.name = data.name?.trim() || null;
  }
  if (data.firstName !== undefined) {
    updates.firstName = data.firstName?.trim() || null;
  }
  if (data.lastName !== undefined) {
    updates.lastName = data.lastName?.trim() || null;
  }

  if (data.email !== undefined) {
    const email = data.email.trim().toLowerCase();
    if (!email) return { error: "Email is required" };
    if (email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return { error: "This email is already in use" };
      updates.email = email;
    }
  }

  if (data.emailVerified !== undefined) {
    updates.emailVerified = data.emailVerified;
  }

  if (data.newPassword !== undefined && data.newPassword !== null && data.newPassword !== "") {
    const parsed = passwordSchema.safeParse(data.newPassword);
    if (!parsed.success) {
      return { error: parsed.error.errors[0]?.message ?? "Password does not meet requirements" };
    }
    updates.passwordHash = await hashPassword(data.newPassword);
  }

  if (Object.keys(updates).length > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: updates,
    });
  }

  return { success: true };
}

export async function updateAccountUserRole(
  accountUserId: string,
  role: UserRole
): Promise<{ success: true } | { error: string }> {
  await prisma.accountUser.update({
    where: { id: accountUserId },
    data: { role },
  });
  return { success: true };
}

export async function addUserToAccountAdmin(
  userId: string,
  accountId: string,
  role: UserRole
): Promise<{ success: true } | { error: string }> {
  const existing = await prisma.accountUser.findUnique({
    where: {
      accountId_userId: { accountId, userId },
    },
  });
  if (existing) return { error: "User is already in this account" };
  await addUserToAccount(userId, accountId, role);
  return { success: true };
}

export async function removeUserFromAccount(accountUserId: string): Promise<{ success: true } | { error: string }> {
  const au = await prisma.accountUser.findUnique({
    where: { id: accountUserId },
    include: { account: true },
  });
  if (!au) return { error: "Membership not found" };
  const ownerCount = await prisma.accountUser.count({
    where: { accountId: au.accountId, role: "OWNER" },
  });
  if (au.role === "OWNER" && ownerCount <= 1) {
    return { error: "Cannot remove the only owner from the account" };
  }
  await prisma.accountUser.delete({
    where: { id: accountUserId },
  });
  return { success: true };
}
