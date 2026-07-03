-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "invoiceType" TEXT NOT NULL DEFAULT 'TAX',
ADD COLUMN     "terms" TEXT;
