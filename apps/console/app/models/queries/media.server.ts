import { prisma } from "@secretlobby/db";

export async function getMediaByAccountId(
  accountId: string,
  options?: {
    take?: number;
    cursor?: string;
    type?: string | string[];
    search?: string;
  }
) {
  const { take = 20, cursor, type, search } = options || {};

  const where: Record<string, unknown> = { accountId };

  if (type) {
    if (Array.isArray(type) && type.length > 0) {
      where.type = type.length === 1 ? type[0] : { in: type };
    } else if (typeof type === "string") {
      where.type = type;
    }
  }

  if (search) {
    where.OR = [
      { filename: { contains: search, mode: "insensitive" } },
      { alt: { contains: search, mode: "insensitive" } },
    ];
  }

  return prisma.media.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1, // Fetch one extra to determine if there are more
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

export async function getMediaById(id: string) {
  return prisma.media.findUnique({
    where: { id },
  });
}

export async function getMediaByIdAndAccountId(id: string, accountId: string) {
  return prisma.media.findFirst({
    where: { id, accountId },
  });
}

export async function getMediaByIds(ids: string[], accountId: string) {
  return prisma.media.findMany({
    where: { id: { in: ids }, accountId },
  });
}
