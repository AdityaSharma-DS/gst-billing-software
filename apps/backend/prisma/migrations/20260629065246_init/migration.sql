-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('REGULAR', 'COMPOSITION', 'UNREGISTERED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACCOUNTANT', 'VIEWER');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('VENDOR', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "PartyTaxCategory" AS ENUM ('REGISTERED', 'UNREGISTERED', 'COMPOSITION');

-- CreateEnum
CREATE TYPE "BillDirection" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'APPROVED', 'VERIFIED', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplyType" AS ENUM ('B2B', 'B2CL', 'B2CS', 'EXPORT', 'SEZ', 'NIL_RATED', 'EXEMPTED');

-- CreateEnum
CREATE TYPE "ReturnType" AS ENUM ('GSTR1', 'GSTR2B', 'GSTR3B', 'GSTR4', 'GSTR5', 'GSTR6', 'GSTR7', 'GSTR8', 'GSTR9');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('DRAFT', 'VALIDATED', 'GENERATED', 'FILED', 'ERROR');

-- CreateEnum
CREATE TYPE "IrnStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EWayBillStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlanInterval" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "taxRegime" "TaxRegime" NOT NULL DEFAULT 'REGULAR',
    "financialYear" TEXT NOT NULL,
    "logoUrl" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "pincode" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "billingAddress" JSONB,
    "shippingAddress" JSONB,
    "bankDetails" JSONB,
    "taxCategory" "PartyTaxCategory" NOT NULL DEFAULT 'REGISTERED',
    "paymentTerms" TEXT,
    "classification" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "direction" "BillDirection" NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'DRAFT',
    "billDate" TIMESTAMP(3) NOT NULL,
    "partyId" TEXT,
    "placeOfSupply" TEXT,
    "supplyType" "SupplyType" NOT NULL DEFAULT 'B2B',
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "subTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igstTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cessTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_line_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hsnSacCode" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cess" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "bill_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "qrPayload" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" TEXT NOT NULL,
    "hsnSacCode" TEXT NOT NULL,
    "description" TEXT,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cessRate" DECIMAL(5,2),
    "effectiveFrom" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'FASTGST',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gst_returns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "returnType" "ReturnType" NOT NULL,
    "period" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "jsonUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "arn" TEXT,
    "filedAt" TIMESTAMP(3),
    "summary" JSONB,
    "validationErrors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gst_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "irns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "irn" TEXT NOT NULL,
    "ackNo" TEXT,
    "ackDate" TIMESTAMP(3),
    "signedInvoice" TEXT,
    "signedQrCode" TEXT,
    "status" "IrnStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "irns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eway_bills" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "ewbNo" TEXT NOT NULL,
    "ewbDate" TIMESTAMP(3),
    "validUpto" TIMESTAMP(3),
    "vehicleNo" TEXT,
    "transporterId" TEXT,
    "status" "EWayBillStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eway_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interval" "PlanInterval" NOT NULL,
    "priceInr" DECIMAL(12,2) NOT NULL,
    "features" JSONB,
    "limits" JSONB,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "amountInr" DECIMAL(12,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "organizations_tenantId_idx" ON "organizations"("tenantId");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "parties_tenantId_type_idx" ON "parties"("tenantId", "type");

-- CreateIndex
CREATE INDEX "parties_tenantId_gstin_idx" ON "parties"("tenantId", "gstin");

-- CreateIndex
CREATE INDEX "bills_tenantId_direction_status_idx" ON "bills"("tenantId", "direction", "status");

-- CreateIndex
CREATE INDEX "bills_tenantId_billDate_idx" ON "bills"("tenantId", "billDate");

-- CreateIndex
CREATE UNIQUE INDEX "bills_tenantId_billNumber_key" ON "bills"("tenantId", "billNumber");

-- CreateIndex
CREATE INDEX "bill_line_items_tenantId_billId_idx" ON "bill_line_items"("tenantId", "billId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_billId_key" ON "invoices"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_invoiceNumber_key" ON "invoices"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "tax_rates_hsnSacCode_idx" ON "tax_rates"("hsnSacCode");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_hsnSacCode_gstRate_key" ON "tax_rates"("hsnSacCode", "gstRate");

-- CreateIndex
CREATE INDEX "gst_returns_tenantId_returnType_period_idx" ON "gst_returns"("tenantId", "returnType", "period");

-- CreateIndex
CREATE UNIQUE INDEX "gst_returns_tenantId_returnType_period_version_key" ON "gst_returns"("tenantId", "returnType", "period", "version");

-- CreateIndex
CREATE UNIQUE INDEX "irns_billId_key" ON "irns"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "irns_irn_key" ON "irns"("irn");

-- CreateIndex
CREATE INDEX "irns_tenantId_idx" ON "irns"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "eway_bills_billId_key" ON "eway_bills"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "eway_bills_ewbNo_key" ON "eway_bills"("ewbNo");

-- CreateIndex
CREATE INDEX "eway_bills_tenantId_idx" ON "eway_bills"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_key" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "payments_tenantId_idx" ON "payments"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_entity_entityId_idx" ON "audit_logs"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_line_items" ADD CONSTRAINT "bill_line_items_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "irns" ADD CONSTRAINT "irns_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eway_bills" ADD CONSTRAINT "eway_bills_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
