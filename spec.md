# GST Billing Software — Project Specification (spec.md)

> **Status:** Draft v1.0 · **Date:** 2026-06-29
> **Source of truth:** Software Development Agreement + Annexure A (Scope of Work), API documentation in `Api-docs/`, and the Jira backlog (`gst_billing_software_2026-06-29_05.20am.csv`).
> This document translates the signed agreement and SOW into a buildable engineering specification.

---

## 1. Overview

A multi-tenant **SaaS GST Billing & Compliance platform** for Indian businesses, covering billing, GST tax computation, full GSTR return generation, e-Invoicing (IRN), e-Way Bill, vendor/customer management, a React Native mobile app with barcode/POS support, and a subscription/payment module. **GST filing is automated via the GSTN APIs (no auditor in the loop).**

| | |
|---|---|
| **Developer** | Ramavath Nagesh |
| **Client** | Dasari Pavan Kumar |
| **Contract value** | ₹2,60,000 (excl. GST) |
| **Timeline** | 24–28 weeks (~150–170 working days) |
| **Platforms** | Web app + React Native mobile app + backend APIs |
| **Design** | [Figma — GST Billing Software UI Design System](https://www.figma.com/design/az3PhVzLLpi1Y6XUXQxnit/GST-Billing-Software-%E2%80%94-UI-Design-System?node-id=2-3) |

### 1.1 Goals
- Single platform for incoming (purchase) and outgoing (sales) bills with GST-compliant invoicing.
- Accurate GST engine (CGST/SGST/IGST, RCM, exempt/nil/zero-rated) with HSN/SAC support.
- End-to-end automated GST return generation **and filing** (GSTR-1, 2B, 3B, 4, 5, 6, 7, 8, 9) via GSTN APIs.
- e-Invoicing (IRN + signed QR) and e-Way Bill generation through NIC/GSTN sandbox → production.
- True multi-tenancy with per-tenant data isolation.
- Mobile-first bill entry with offline mode and barcode/POS workflows.
- Subscription billing with payment-gateway integration.

### 1.2 Non-goals / Exclusions (per Agreement §10)
The contract covers **software development services only**. The **Client** bears: hosting & cloud infra (AWS/GCP), server/DB costs, domain, third-party API fees (GSTN, payment gateways, SMS, email), paid SSL, and Play Store/App Store developer fees. Any feature outside this SOW is a **Change Request** (§5) requiring separate cost/timeline approval.

---

## 2. Commercial & Delivery Terms (from Agreement)

### 2.1 Milestone-based payments
| # | Milestone | % | Amount (₹) | Spec section gated |
|---|-----------|---|-----------|--------------------|
| 1 | Advance — Project Kickoff | 25% | 65,000 | §3, §6 |
| 2 | Design Finalization (Web + App) | 15% | 39,000 | §7 |
| 3 | Core Billing + GST Engine | 15% | 39,000 | §8.1, §8.3 |
| 4 | Mobile App & Vendor Management | 10% | 26,000 | §8.9, §8.7 |
| 5 | Testing & Deployment | 35% | 91,000 | §11, §12 |

- Advance due on signing; subsequent milestones cleared within **10 days** of invoice. Delay > 10 days → developer may pause work.
- **Developer delay liability:** beyond 170 working days (excluding client-caused delays), 5% interest on contract value per 15 days of delay.

### 2.2 Delivery & acceptance (§7)
- Developer internal QA → Client UAT within **7 days** → no major issues = **deemed accepted**.

### 2.3 Support (§8)
- **Free:** 60 days post-delivery, **bug fixes only**.
- **Paid AMC (optional):** separate agreement. SLA if opted — Critical: 24–48 hrs; Minor: 3–5 working days.

### 2.4 IP & ownership (§9, §12)
- Full source-code ownership transfers **after 100% payment**.
- Same source code not reused/resold to other clients for **1 year** post completion.
- Developer retains rights to generic frameworks/utilities/non-business components.
- Compliance: encryption in transit & at rest; GST compliance best-effort; developer not liable for filing errors from incorrect client data.

---

## 3. Architecture

### 3.1 High-level
```
                ┌──────────────┐      ┌──────────────────┐
   Web (SPA) ──▶│              │      │  GSTN / NIC APIs │
                │  API Gateway │─────▶│  (e-Invoice IRP, │
 Mobile (RN) ──▶│  + Auth      │      │  e-Way Bill,     │
                │              │      │  GSTR filing)    │
                └──────┬───────┘      └──────────────────┘
                       │
        ┌──────────────┼───────────────┬────────────────┐
        ▼              ▼               ▼                ▼
   Billing svc   GST engine svc   Returns/JSON svc   Subscription svc
        │              │               │                │
        └──────────────┴───────┬───────┴────────────────┘
                               ▼
                   PostgreSQL (RLS, tenant_id)  +  Redis cache  +  S3 (per-tenant buckets)
```

### 3.2 Recommended stack
> Final stack to be confirmed at Milestone 1 (SCRUM-66 Project Architecture). Proposed defaults:

- **Backend:** Node.js (NestJS) or Java (Spring Boot) — REST APIs, modular services.
- **Database:** PostgreSQL with **Row-Level Security (RLS)** keyed on `tenant_id`; normalized schema for GST compliance.
- **Cache/Queue:** Redis (tax-rate cache, sessions) + a job queue (e.g. BullMQ/RabbitMQ) for async JSON generation, filing, and sync.
- **Object storage:** S3 (or compatible) with **separate bucket/prefix per tenant** for documents (invoices, DSC, audit exports).
- **Web frontend:** React + TypeScript (per Figma design system).
- **Mobile:** React Native (offline-first with local SQLite + sync manager).
- **DevOps:** Kubernetes, CI/CD pipelines, blue-green + canary deploys (per Annexure A).

### 3.3 Multi-tenancy (SCRUM-10)
- Shared schema with `tenant_id` + RLS (default), enforced at DB and service layer.
- Per-tenant S3 buckets/prefixes for document isolation.
- Organization onboarding: GSTIN config, tax regime (Regular / Composition / Unregistered), financial year, branding (logo/name/address).

---

## 4. GST / Government API Integration

References in `Api-docs/`: GST API portal, e-Invoice (NIC/IRP) sandbox, e-Way Bill docs, Postman collections, sandbox credentials, master codes.

**Portals / URLs (from `Api-docs/Urls.txt`):**
- GST API portal — https://developer.gst.gov.in/apiportal/
- e-Invoice sandbox — https://einv-apisandbox.nic.in/
- e-Invoice master codes — https://einvoice1.gst.gov.in/Others/MasterCodes
- e-Way Bill API docs — https://docs.ewaybillgst.gov.in/apidocs/index.html

### 4.1 Authentication
- Token-based auth against NIC/GSTN servers. **Token validity: 1 hour (sandbox) / 6 hours (production).** Implement token caching + auto-refresh per GSTIN, encrypted at rest.

### 4.2 e-Invoice (IRN) flow — `e-Invoice API Flow.pdf`
1. Authenticate.
2. Get GSTIN details (from NIC server or GSTIN server; sync from CP).
3. **Generate IRN** for B2B/Export invoices.
4. Get IRN details (by IRN or by doc details) — handle **duplicate IRN / missing QR within 3 days** of generation.
5. Generate e-Way Bill using IRN; get e-Way Bill details by IRN.
- Output: signed invoice JSON, IRN, signed QR code embedded in PDF, DSC integration.

### 4.3 e-Way Bill flow — `e-WayBill API Flow.pdf`
- Authenticate → Generate / Cancel / Reject e-Way Bill; Update Part-B/vehicle, multi-vehicle, transporter; extend validity; consolidated EWB (generate/regenerate); rich query endpoints (by date, state, GSTIN, transporter, parties).

### 4.4 GSTR filing
- JSON generation per GSTN schema → schema validation → **automated filing via GSTN/GSTIN API** → upload tracking + archive with version history.

### 4.5 Tax rates
- Integrate **FastGST API** for real-time GST rates; HSN/SAC lookup; cache rates (weekly refresh); manual override; RCM applicability.

---

## 5. Functional Specification (Annexure A → Epics)

Mapped to Jira epics (`SCRUM-*`). Each feature below is in-scope per Annexure A.

### 5.1 Bill Management (SCRUM-8)
- **Bill CRUD (SCRUM-21):** incoming (purchase) & outgoing (sales) bills; auto unique bill numbers (configurable format); fields: date, vendor/customer, amount, tax rate; status flow **Draft → Approved → Verified → Finalized**; edit/delete with audit trail; bulk upload (CSV/Excel).
- **Invoice Generation (SCRUM-22):** PDF with company header + itemization; QR placeholder for IRN (Phase 4); per-tenant numbering scheme; download & email; multi-language (English, Hindi).
- **Line Items (SCRUM-23):** multiple items; description, HSN/SAC, qty, rate, tax rate; per-line CGST/SGST/IGST; line- & bill-level discounts; additional charges (handling, shipping).

### 5.2 Dashboard & Reporting — MVP (SCRUM-9)
- **Quick Dashboard (SCRUM-24):** bill counts (today/week/month); incoming vs outgoing value; pending approvals; quick search.
- **Basic Reports (SCRUM-25):** daily/weekly/monthly summary; vendor-wise; customer-wise; tax summary (CGST/SGST/IGST).

### 5.3 Multi-Tenancy & Organization (SCRUM-10)
- Tenant isolation via RLS (SCRUM-26); per-tenant schemas/buckets; org setup (SCRUM-27): registration, GSTIN, tax regime, FY, branding.

### 5.4 GST Calculation Engine (SCRUM-11)
- **Tax Rate Integration (SCRUM-28):** FastGST API, HSN/SAC lookup, cached rates, manual override, RCM.
- **Tax Calculation (SCRUM-29):** intra-state CGST/SGST vs inter-state IGST; tax on MRP vs base; exempt/nil-rated/zero-rated (export) handling.

### 5.5 GSTR Return Generation (SCRUM-12)
| Return | Story | Key scope |
|--------|-------|-----------|
| GSTR-1 | SCRUM-30 | B2B, B2C-L (>2.5L), B2C-S summary, exports, amendments/credit notes, HSN summary (turnover >5Cr), JSON per GSTN spec, schema validation, error reporting |
| GSTR-2B | SCRUM-31 | Auto-fetch from GSTN, match purchases, reconciliation dashboard, ITC eligibility, blocked/reversal ID |
| GSTR-3B | SCRUM-32 | Auto-generate from GSTR-1 + 2B, manual summary entry, interest/late fees, net ITC, liability summary |
| GSTR-4 | SCRUM-33 | Composition: quarterly turnover tax calc, composition rate, due dates, locked/filed status |
| GSTR-5 | SCRUM-34 | Non-resident: import/export tracking, liability, JSON |
| GSTR-6 | SCRUM-35 | ITC reversal: credit notes, reversal scenarios, partial ITC, JSON |
| GSTR-7 | SCRUM-36 | TDS: deduction tracking, deductor-wise, certificate-ready data |
| GSTR-8 | SCRUM-37 | E-commerce TCS: collection tracking, supplier-wise, monthly return |
| GSTR-9 | SCRUM-38 | Annual: data aggregation, details vs summary reconciliation, ARN, JSON |

### 5.6 JSON Export for GSTN Portal (SCRUM-13)
- **JSON Generation (SCRUM-39):** GSTN-compliant JSON for all returns; section-wise (B2B, B2C-L, B2C-S, Export, Amendments, HSN); **automated filing via GSTIN API**; pre-export schema validation; field-level error highlighting; multiple attempts (overwrite); ZIP download.
- **Upload Tracking (SCRUM-40):** track uploads, archive JSONs with timestamp, version history, pre-upload checklist.

### 5.7 Compliance Dashboard (SCRUM-49)
- **Filing Status Tracker (SCRUM-50):** due dates (GSTR-1/3B/4), filed/unfiled status, pending amendments, late-fee calculator, compliance calendar.

### 5.8 Vendor/Customer Master (SCRUM-14)
- **Master Data (SCRUM-41):** CRUD; profiles (name, GSTIN, PAN, contact, billing/shipping address, banking, tax category, payment terms); classification (raw material/finished goods/services).
- **GSTIN Validation (SCRUM-42):** format validation, optional GSTN API status check, search, duplicate prevention.
- **Vendor Analytics (SCRUM-43):** purchases (YTD/30d), avg invoice, payment pending, vendor-wise liability, performance scoring.

### 5.9 Mobile App — React Native (SCRUM-15)
- **Bill Entry (SCRUM-44):** camera scan for bill image, manual entry, auto-fill from master, GST auto-population, on-device tax calc, draft/submit.
- **Offline Mode (SCRUM-45):** offline-first sync manager, queue + sync when online, status indicator, conflict resolution.
- **Mobile Dashboard (SCRUM-46):** today's bills, pending approvals, quick search, monthly tax summary.
- **Notifications (SCRUM-47):** GST due reminders, approvals, sync alerts, bill status.
- **Barcode Integration (SCRUM-48):** Bluetooth/USB scanners, real-time product lookup, auto-fill (price/GST/HSN), POS-style fast billing.

### 5.10 Bulk Import (SCRUM-51)
- **CSV/Excel Import (SCRUM-52):** templates (bills/vendors/customers), drag-drop upload, validation, line-level error reporting, rollback on critical errors, success summary.

### 5.11 E-Invoicing & IRN (SCRUM-17)
- **E-Invoice Generation (SCRUM-53):** JSON for B2B/Export, GSTN IRP API for IRN, QR with IRN/GSTIN/invoice details, DSC-signed, PDF with embedded QR.
- **IRN Tracking (SCRUM-54):** store IRN with record, status monitoring, validity tracking, hash-based duplicate prevention.
- **DSC Integration (SCRUM-55):** encrypted cert upload/storage, signature verification + timestamp, audit trail, optional HSM.

### 5.12 Audit Trails & Compliance Logging (SCRUM-18)
- **Audit Trail (SCRUM-56):** log every action (create/edit/approve/delete/export) with user + timestamp, before/after values, IP, session; **immutable append-only** log.
- **Signature Verification (SCRUM-57):** verify JSON/PDF integrity, validity dates, cert chain, optional revocation check.
- **Compliance Reports (SCRUM-58):** audit export (PDF/Excel), data integrity report, access logs, modification history.

### 5.13 Advanced Compliance (SCRUM-59)
- **Supply Type Classification (SCRUM-61):** SPLY/ISUP auto-classify, place-of-supply, RCM, e-commerce facilitator tracking.
- **ITC Restrictions (SCRUM-62):** blocked ITC tracking, reversal scenarios, eligible vs blocked reporting.

### 5.14 Subscription & Payment Module (SCRUM-60)
- **Subscription (SCRUM-63):** multi-plan (monthly/quarterly/yearly), plan config (limits/features/pricing), trial, upgrade/downgrade, auto-renewal, status tracking.
- **Payment (SCRUM-64):** gateway integration (Razorpay/PayU/Stripe), secure payments, subscription invoices, history/receipts, failed-payment retry, webhook handling.

---

## 6. Authentication & User Management (SCRUM-7)
- Auth, roles, and permissions: **Admin, Accountant, Viewer** (per documentation deliverable).
- Session management, IP logging (feeds audit trail), encrypted credential storage for GSTN/DSC/gateway secrets.

---

## 7. UI/UX Design (SCRUM-6)
- **Web UI (SCRUM-67)** and **App UI (SCRUM-68)** per the [Figma Design System](https://www.figma.com/design/az3PhVzLLpi1Y6XUXQxnit/GST-Billing-Software-%E2%80%94-UI-Design-System?node-id=2-3).
- Implement design tokens (colors, typography, spacing) from the Figma variables once access is granted (current MCP access is view-only / not shared — request editor access to auto-extract tokens).
- Multi-language UI (English, Hindi).

> **Action needed:** share the Figma file with editor access so design tokens and components can be pulled directly into the codebase.

---

## 8. Non-Functional Requirements

| Area | Requirement (from Annexure A testing/deploy) |
|------|----------------------------------------------|
| **Security** | OWASP Top 10; SQLi/XSS/CSRF prevention; rate limiting & DDoS protection; encryption in transit & at rest; DSC security; penetration testing |
| **Performance** | Load test 1,000+ concurrent bills; DB query optimization; API benchmarking; large JSON export perf; mobile battery/data efficiency |
| **GST accuracy** | JSON schema validation vs GSTN; 100+ tax test scenarios; rounding handling; edge cases (nil/exempt/RCM); sandbox e-invoicing; GSTR-2B reconciliation |
| **Availability** | Blue-green + canary (10%→50%→100%); rollback; monitoring/alerting; incident response |
| **Data** | Encryption at rest/in transit; backups & recovery testing; failover; immutable audit log |

---

## 9. Cross-cutting Deliverables (Annexure A)
- Architecture & API design document (SCRUM-65, SCRUM-66).
- Database schema (normalized for GST compliance).
- DevOps setup (Kubernetes, CI/CD).
- Security framework & encryption policies.
- Testing strategy & QA framework.
- Compliance checklist (Data Protection Act, GST compliance, RBI guidelines).
- Documentation: per-role user guides, API docs, sysadmin guide, GST compliance guide, troubleshooting FAQ.

---

## 10. Testing & QA (SCRUM-19)
- **Functional:** Bill CRUD, invoicing, GST calc, GSTR accuracy, JSON validation, e-invoicing, bulk-import edge cases.
- **Integration:** GSTN API (sandbox), payment gateway, notifications, SMS/email.
- **Performance:** see §8.
- **Security:** penetration testing, OWASP, encryption verification.
- **GST compliance:** schema validation, 100+ tax scenarios, sandbox e-invoicing, GSTR-2B reconciliation.
- **UAT:** 50+ beta users across industries; real-world scenarios; iterative fixes.

---

## 11. Deployment & DevOps (SCRUM-20)
- **Pre-prod:** staging mirroring production, data replication, backup/recovery & failover testing.
- **Production:** blue-green, canary release, rollback plan, monitoring/alerting, incident response plan.

---

## 12. Phased Roadmap (mapped to milestones)

| Phase | Milestone | Scope | Epics |
|-------|-----------|-------|-------|
| **0 — Setup** | (Advance) | Architecture, DB schema, DevOps/CI-CD, security framework | SCRUM-5, 65, 66 |
| **1 — Design** | M2 | Web + App UI finalized from Figma | SCRUM-6, 67, 68 |
| **2 — Core** | M3 | Auth, Bill Mgmt, GST Engine, Dashboard MVP, Multi-tenancy | SCRUM-7, 8, 11, 9, 10 |
| **3 — Compliance** | M3→M4 | GSTR returns, JSON export + auto-filing, compliance dashboard | SCRUM-12, 13, 49 |
| **4 — Mobile & Vendors** | M4 | Mobile app, vendor/customer master, bulk import | SCRUM-15, 14, 51 |
| **5 — Advanced** | M4→M5 | E-Invoicing/IRN, audit logs, advanced compliance, subscription/payments | SCRUM-17, 18, 59, 60 |
| **6 — Test & Deploy** | M5 | Full QA, UAT (50+ users), production deployment | SCRUM-19, 20 |

---

## 13. Assumptions & Dependencies (Client responsibilities §6)
- Client provides: GST/business/operational data; API credentials (GSTN, payment gateways); legal compliance of usage; timely approvals.
- Client bears all third-party/infra costs (§10).
- GSTN/NIC sandbox access required before Phase 3/5 integration testing.
- Figma file editor access required for design-token extraction (§7).

## 14. Open Items / To Confirm
1. Final backend stack (Node/NestJS vs Java/Spring) — lock at Milestone 1.
2. Payment gateway choice (Razorpay / PayU / Stripe).
3. Cloud provider (AWS vs GCP) — affects S3/storage implementation.
4. Figma access for design system import.
5. FastGST API account/credentials for tax-rate integration.
6. DSC/HSM provider for digital signatures.

---

## 15. Reference Index (`Api-docs/`)
- `GST api postman collection.json`, `e-Invoice api postman collection.json`, `e-WayBill api postman collection.json` — endpoint references.
- `e-Invoice API Flow.pdf`, `e-WayBill API Flow.pdf` — integration sequences (summarized §4).
- `Sandbox Credentials.pdf`, `Sandbox.pdf` — sandbox onboarding (Whitebooks).
- `E-Invoice preparation tools (2).xlsx`, `E-Waybill Preparation tools 2 (2).xlsx` — payload field references.
- `Urls.txt` — portal URLs.
