-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "paymentMode" TEXT,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "vendorInvoiceNo" TEXT;
