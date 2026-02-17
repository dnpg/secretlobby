import { prisma } from "@secretlobby/db";
import type { StaffRole } from "@secretlobby/db";

export async function addStaff(
  userId: string,
  role: StaffRole = "ADMIN"
): Promise<{ success: true } | { error: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return { error: "User not found" };

  const existing = await prisma.staff.findUnique({
    where: { userId },
  });
  if (existing) return { error: "This user is already staff" };

  await prisma.staff.create({
    data: { userId, role },
  });
  return { success: true };
}

export async function removeStaff(staffId: string): Promise<{ success: true } | { error: string }> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
  });
  if (!staff) return { error: "Staff record not found" };

  const ownerCount = await prisma.staff.count({
    where: { role: "OWNER" },
  });
  if (staff.role === "OWNER" && ownerCount <= 1) {
    return { error: "Cannot remove the last staff owner" };
  }

  await prisma.staff.delete({
    where: { id: staffId },
  });
  return { success: true };
}

export async function updateStaffRole(
  staffId: string,
  role: StaffRole
): Promise<{ success: true } | { error: string }> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
  });
  if (!staff) return { error: "Staff record not found" };

  if (staff.role === "OWNER" && role !== "OWNER") {
    const ownerCount = await prisma.staff.count({
      where: { role: "OWNER" },
    });
    if (ownerCount <= 1) return { error: "Cannot demote the last staff owner" };
  }

  await prisma.staff.update({
    where: { id: staffId },
    data: { role },
  });
  return { success: true };
}
