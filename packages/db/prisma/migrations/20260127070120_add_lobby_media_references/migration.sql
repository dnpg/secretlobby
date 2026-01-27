-- AlterTable
ALTER TABLE "Lobby" ADD COLUMN     "backgroundMediaDarkId" TEXT,
ADD COLUMN     "backgroundMediaId" TEXT,
ADD COLUMN     "bannerMediaDarkId" TEXT,
ADD COLUMN     "bannerMediaId" TEXT,
ADD COLUMN     "profileMediaDarkId" TEXT,
ADD COLUMN     "profileMediaId" TEXT;

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_backgroundMediaId_fkey" FOREIGN KEY ("backgroundMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_backgroundMediaDarkId_fkey" FOREIGN KEY ("backgroundMediaDarkId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_bannerMediaId_fkey" FOREIGN KEY ("bannerMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_bannerMediaDarkId_fkey" FOREIGN KEY ("bannerMediaDarkId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_profileMediaId_fkey" FOREIGN KEY ("profileMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_profileMediaDarkId_fkey" FOREIGN KEY ("profileMediaDarkId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
