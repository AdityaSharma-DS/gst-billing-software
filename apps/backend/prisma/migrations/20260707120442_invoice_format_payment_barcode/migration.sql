-- AlterTable
ALTER TABLE "bill_payments" ADD COLUMN     "bankDetails" TEXT,
ADD COLUMN     "chequeNo" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "invoiceShortCode" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT;

-- CreateIndex
CREATE INDEX "products_tenantId_barcode_idx" ON "products"("tenantId", "barcode");
