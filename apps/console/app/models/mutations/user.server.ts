import { prisma } from "@secretlobby/db";
import { verifyPassword, hashPassword } from "@secretlobby/auth/password";
import { requestEmailChange } from "@secretlobby/auth/verification";
import { passwordSchema } from "@secretlobby/auth/validation";

export async function updateUserName(userId: string, name: string | null): Promise<{ success: true } | { error: string }> {
  const trimmed = name?.trim() ?? null;
  await prisma.user.update({
    where: { id: userId },
    data: { name: trimmed || null },
  });
  return { success: true };
}

export async function updateUserEmail(
  userId: string,
  newEmail: string,
  currentPassword: string,
  baseUrl: string
): Promise<{ success: true } | { error: string }> {
  const email = newEmail.toLowerCase().trim();
  if (!email) return { error: "Email is required" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  if (!user) return { error: "User not found" };

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect" };

  if (user.email === email) return { error: "New email is the same as your current email" };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "This email is already in use" };

  // Start email-change flow: store pending email and send verification link to NEW address.
  await requestEmailChange(userId, email, baseUrl);
  return { success: true };
}

export async function updateUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: true } | { error: string }> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Password does not meet requirements" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) return { error: "User not found" };

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return { error: "Current password is incorrect" };

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
  return { success: true };
}
