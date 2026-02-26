import { prisma } from "@secretlobby/db";
import type { FeedbackType } from "@secretlobby/db";

interface AttachmentData {
  filename: string;
  key: string;
  mimeType: string;
  size: number;
}

interface CreateFeedbackParams {
  accountId: string;
  userId: string;
  type: FeedbackType;
  subject: string;
  message: string;
  attachments?: AttachmentData[];
}

export async function createFeedbackWithAttachments({
  accountId,
  userId,
  type,
  subject,
  message,
  attachments = [],
}: CreateFeedbackParams) {
  return prisma.feedback.create({
    data: {
      accountId,
      userId,
      type,
      subject,
      message,
      attachments: {
        create: attachments,
      },
    },
    include: {
      attachments: true,
    },
  });
}

export async function getSystemFeedbackNotificationEmail() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: "default" },
    select: { feedbackNotificationEmail: true },
  });
  return settings?.feedbackNotificationEmail || null;
}
