-- CreateTable
CREATE TABLE "recurring_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyId" TEXT,
    "description" TEXT,
    "invoiceType" TEXT NOT NULL DEFAULT 'TAX',
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "paymentMode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "items" JSONB NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_profiles_tenantId_nextRunDate_idx" ON "recurring_profiles"("tenantId", "nextRunDate");

-- AddForeignKey
ALTER TABLE "recurring_profiles" ADD CONSTRAINT "recurring_profiles_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
