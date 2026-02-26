import { prisma, type FeedbackStatus } from "@secretlobby/db";

interface GetFeedbackParams {
  status?: FeedbackStatus | "ALL";
  page?: number;
  pageSize?: number;
}

export async function getFeedbackWithPagination({
  status = "ALL",
  page = 1,
  pageSize = 20,
}: GetFeedbackParams) {
  const where = status !== "ALL" ? { status } : {};

  const [feedback, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
        account: {
          select: { id: true, name: true, slug: true },
        },
        _count: {
          select: { attachments: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.feedback.count({ where }),
  ]);

  return {
    feedback,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getFeedbackStats() {
  const [total, pending, read, archived] = await Promise.all([
    prisma.feedback.count(),
    prisma.feedback.count({ where: { status: "PENDING" } }),
    prisma.feedback.count({ where: { status: "READ" } }),
    prisma.feedback.count({ where: { status: "ARCHIVED" } }),
  ]);

  return {
    total,
    pending,
    read,
    archived,
  };
}

export async function getFeedbackById(id: string) {
  return prisma.feedback.findUnique({
    where: { id },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
      account: {
        select: { id: true, name: true, slug: true },
      },
      attachments: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
