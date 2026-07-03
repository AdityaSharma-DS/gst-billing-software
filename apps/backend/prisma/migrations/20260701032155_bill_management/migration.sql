-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'CREDIT_NOTE', 'DELIVERY_CHALLAN');

-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "documentType" "DocumentType" NOT NULL DEFAULT 'INVOICE',
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "otherCharges" DECIMAL(14,2) NOT NULL DEFAULT 0;
