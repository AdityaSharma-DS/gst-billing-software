-- Per-taxpayer GST return-filing (auto-file) settings.
ALTER TABLE "organizations" ADD COLUMN "gstApiUsername" TEXT;
ALTER TABLE "organizations" ADD COLUMN "gstApiAccessEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN "gstApiAccessValidTill" TIMESTAMP(3);
