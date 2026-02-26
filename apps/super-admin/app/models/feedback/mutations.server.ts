import { prisma, type FeedbackStatus } from "@secretlobby/db";

export async function updateFeedbackStatus(id: string, status: FeedbackStatus) {
  return prisma.feedback.update({
    where: { id },
    data: { status },
  });
}

export async function deleteFeedback(id: string) {
  return prisma.feedback.delete({
    where: { id },
  });
}
