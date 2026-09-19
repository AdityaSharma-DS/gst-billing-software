# WhiteBooks GSP — Integration Workflow (DONICY)

_Blueprint derived from the WhiteBooks API pack in `Gst apis research/…` (OpenAPI specs, flow PDFs, sandbox docs) + the proposal (spec.md). Last updated 2026-09-19._

WhiteBooks (developer.whitebooks.in, by BVM) is a **directly GSTN-licensed GSP**. REST APIs, free sandbox, official **Node.js SDK**, ISO-27001. Three products, **each with its own subscription + Client ID/Secret + Username/Password + API-call quota**:

| Product | Base (sandbox → prod) | Purpose |
|---|---|---|
| **GST API** | `apisandbox.whitebooks.in` → `api.whitebooks.in` | File returns (GSTR-1/3B/4/9…), GSTR-2B, ledgers, challans, ITC |
| **e-Invoice API** | same | Generate IRN + signed QR, cancel, GSTIN details |
| **e-Way Bill API** | same | Generate/cancel/extend EWB, Part-B, consolidated |

## Three different auth models (important)

1. **e-Way Bill** — `GET /ewaybillapi/v1.03/authenticate?email&username&password` + headers `client_id, client_secret, ip_address, gstin` → `auth-token` (1h sandbox / 6h prod). **[App ✓]**
2. **e-Invoice** — `GET /einvoice/authenticate` (same credential pattern) → token. **[App uses generate directly ✓]**
3. **GST filing** — **OTP-based, taxpayer-level:**
   - `GET /authentication/otprequest` → OTP to taxpayer's registered mobile
   - `GET /authentication/authtoken` (with OTP) → auth token; `/authentication/refreshtoken`; `/authentication/logout`
   - `GET /authentication/otpforevc` → OTP used to **file via EVC**
   **[App ✗ — not built]**

> **Static-IP requirement:** every call carries `ip_address` and NIC whitelists it. **Vercel serverless egress IPs are dynamic → GSP calls fail from Vercel.** Route all GSP traffic through a fixed-IP host (the Hostinger VPS) — a small proxy service, or move the GSP module off serverless.

---

## Flow 1 — e-Invoice (IRN)  `/einvoice/…`
```
Authenticate → GENERATE (IRN) → GETIRN (by IRN / by doc details, within 3 days if dup / no QR)
            → [optional] GENERATE_EWAYBILL from IRN → GETEWAYBILLIRN
            → CANCEL if needed;  QR from response → embed signed QR in the PDF
```
Endpoints: `/einvoice/type/GENERATE/version/V1_03` (POST), `GETIRN`, `GETIRNBYDOCDETAILS`, `CANCEL`, `GENERATE_EWAYBILL`, `GETEWAYBILLIRN`, `GSTNDETAILS`, `SYNC_GSTIN_FROMCP`, `GETREJECTEDIRNS`, `/einvoice/qrcode`.
**App status:** `GENERATE` coded but **unreachable** (no controller/UI). Missing: GETIRN, CANCEL, signed-QR-in-PDF, DSC.

## Flow 2 — e-Way Bill  `/ewaybillapi/v1.03/ewayapi/…`
```
Authenticate → genewaybill → { vehewb (Part-B) | extendvalidity | canewb | rejewb
                              | gencewb (consolidated) | initmulti/addmulti/updtmulti }
Utilities: getewaybill, getgstindetails, gethsndetailsbyhsncode, gettransporterdetails, geterrorlist
```
**App status:** `genewaybill` ✓, `getgstindetails` ✓. Missing: cancel, Part-B update, extend, consolidated, multi-vehicle, queries.

## Prerequisite for GST filing — "Enable API Access" on the GST portal (per business)
Before a real GSTIN can file returns via a GSP, the taxpayer must enable API access once
(per the WhiteBooks "Enable API Access" guide):
1. Log in at **gst.gov.in** with the GSTIN's own username/password.
2. **View Profile → Quick Links → "Manage API Access"**.
3. **Enable API Request = Yes**, **Duration = 30 days** → **Confirm**.
This opens a 30-day API window; after it lapses the taxpayer re-enables it (a new OTP session).
**Key implication:** GST-return filing auth is **OTP-based** — the app authenticates with the
taxpayer's GST-portal **username + a live OTP** (`/authentication/otprequest` → `/authentication/authtoken`),
**not a stored password**. So the app needs (a) a per-business *GST-portal API username* field and
(b) an **OTP-capture step at filing time**. (This is separate from e-Way Bill / e-Invoice, which
register on ewaybillgst.gov.in / einvoice1.gst.gov.in and issue a stored API username/password.)

## Flow 3 — GST Return Filing (the SOW headline — NOT built)
Per return, the pattern is **Save → (Submit) → Proceed → File**:
```
Auth (OTP) → PUT  /gstr1/retsave      (upload the JSON sections DONICY already generates)
           → GET  /gstr1/retsum       (verify summary)  [3B: /gstr3b/autoliab, retoffset]
           → GET  /all/newproceedfile  (proceed to file)
           → POST /gstr1/retevcfile    (file via EVC OTP)   OR   /gstr1/retfile (file via DSC)
           → response ARN → poll /all/newretstatus, /all/filedet;  /all/docdwld for the filed copy
```
Filing endpoints exist for **GSTR-1, 1A, 3B, 4, 4Annual, 5, 6, 7, 8, 9, 9A, 9C, CMP, ITC03/04, SPIKE** — each with `retsave` (PUT) + `retfile`/`retevcfile` (POST) + summary/section GETs.
GSTR-3B also needs **ledgers** (`/ledgers/cashdtl|itc|tax|bal`, `utlcsh`, `utlitc`) and **payment** (`/payment/generateChallan`) to offset liability before filing.

> **Reality check:** GSTN mandates **EVC (taxpayer OTP) or DSC** at the *File* step every period. So filing can be one-click-to-initiate but **always needs the signatory's OTP/DSC** — never fully unattended. Today `returns.service.markFiled()` only sets `status=FILED` + a fake ARN; this whole flow replaces it.

## Flow 4 — GSTR-2B auto-fetch (reconciliation)
```
PUT /gstr2b/gen2b (generate on demand) → GET /gstr2b/get2b (status) → GET /gstr2b/all (data)
→ match against purchase bills → ITC eligible/blocked
```
**App status:** manual JSON upload only; these endpoints give the auto-fetch the proposal asks for.

---

## Gap analysis (app vs WhiteBooks)
| Capability | App today | WhiteBooks endpoint | Action |
|---|---|---|---|
| e-Way Bill generate | ✓ | `/genewaybill` | done |
| GSTIN lookup | ✓ (needs creds+IP) | `/getgstindetails` | done |
| e-Invoice IRN | code only, unreachable | `/einvoice/type/GENERATE/…` | wire controller+UI, QR in PDF |
| **GST return filing** | fake ARN | `retsave`→`newproceedfile`→`retevcfile` | **build (new OTP auth)** |
| GSTR-2B auto-fetch | manual upload | `/gstr2b/gen2b`,`get2b`,`all` | build |
| HSN details (official) | bundled catalog | `/gethsndetailsbyhsncode`, e-Inv master codes | optional swap for FastGST/govt |
| Ledgers / challan | none | `/ledgers/*`, `/payment/*` | needed for 3B liability |

## Phased implementation plan (mapped to proposal)
- **Phase 0 — infra (blocker):** stand up a **fixed-IP GSP proxy** on the VPS; per-taxpayer GST-portal API creds capture in Settings; store the 3 product sandbox creds in the master panel (already built).
- **Phase 1 — GST filing MVP:** GST OTP-auth service (`otprequest`/`authtoken`); GSTR-1 `retsave → newproceedfile → retevcfile` with EVC-OTP capture; real ARN + status polling; **replace `markFiled`**. Then GSTR-3B (with ledger offset + challan).
- **Phase 2 — e-Invoice end-to-end:** reachable `GENERATE` from the invoice screen; GETIRN, CANCEL; **signed QR embedded in the PDF**; store IRN on the `Irn` model.
- **Phase 3 — reconciliation & EWB lifecycle:** GSTR-2B auto-fetch + match; e-Way Bill cancel/Part-B/extend/consolidated.
- **Phase 4 — remaining returns:** GSTR-4/9 filing, then 2/5/6/7/8, IMS; DSC option; official HSN/rate master.

## Notes
- Prefer the **WhiteBooks Node.js SDK** over raw REST if it handles auth/encryption cleanly (evaluate first; current app uses raw `fetch` which works).
- e-Invoice **production is subscription-locked** — sandbox first (default OTP `575757`, test GSTINs from WhiteBooks).
- Keep all secrets encrypted at rest (already done for client secrets & taxpayer passwords).
