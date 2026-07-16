-- AlterEnum
ALTER TYPE "BookingSource" ADD VALUE 'PAPER_IMPORT';

-- AlterEnum
ALTER TYPE "ReservationStatus" ADD VALUE 'PARTIALLY_ARRIVED';

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "vip" BOOLEAN NOT NULL DEFAULT false;
