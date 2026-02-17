-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'ADMIN');

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Staff_userId_key" ON "Staff"("userId");

-- CreateIndex
CREATE INDEX "Staff_userId_idx" ON "Staff"("userId");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: grant Staff OWNER to existing super-admin account OWNERs so they can still log in
INSERT INTO "Staff" (id, "userId", role, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, au."userId", 'OWNER'::"StaffRole", NOW(), NOW()
FROM "AccountUser" au
JOIN "Account" a ON a.id = au."accountId"
WHERE a.slug = 'super-admin' AND au.role = 'OWNER'
ON CONFLICT ("userId") DO NOTHING;
