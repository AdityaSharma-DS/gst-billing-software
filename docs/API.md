# API Reference

Base URL: `http://localhost:4000/api` (the web dev server proxies `/api` here).

**Auth:** every route except `POST /auth/login` and `POST /tenants/onboard` requires:
```
Authorization: Bearer <jwt>
x-tenant-id: <tenant-uuid>
```
The JWT and tenant id are returned by `POST /auth/login`. Writes are restricted to
`ADMIN` / `ACCOUNTANT` roles.

---

## Auth

### POST /auth/login
```json
// request
{ "tenantSlug": "demo", "email": "admin@demo.test", "password": "admin123" }

// response
{
  "accessToken": "eyJ…",
  "user": { "id": "…", "email": "admin@demo.test", "role": "ADMIN", "fullName": "Demo Admin", "tenantId": "…" }
}
```

## Tenants

### POST /tenants/onboard
Creates a tenant + first admin user + organization shell.
```json
{ "tenantName": "Acme", "slug": "acme", "adminEmail": "a@acme.com",
  "adminPassword": "…", "adminName": "Owner", "legalName": "Acme Pvt Ltd",
  "gstin": "27…", "financialYear": "2026-27" }
```

## Dashboard

### GET /dashboard/summary
```json
{ "customers": 3, "orders": 3, "revenue": 283200, "netProfit": 283200,
  "recentOrders": [ { "id": "…", "product": "Bharath Traders", "category": "Sales",
                      "price": 118000, "status": "FINALIZED" } ] }
```

## Parties (clients / vendors)

### GET /parties?type=CUSTOMER|VENDOR
Returns parties with per-party billing totals.
```json
[ { "id": "…", "name": "Bharath Traders", "gstin": "27ABCDE1234F1Z5",
    "total": 118000, "paid": 118000, "outstanding": 0 } ]
```

### POST /parties
```json
{ "type": "CUSTOMER", "name": "New Client", "gstin": "27…",
  "email": "x@y.com", "phone": "9…" }
```

## Bills / invoices

### GET /bills
List bills for the tenant (includes party).

### GET /bills/:id
Single bill with line items.

### POST /bills  *(ADMIN, ACCOUNTANT)*
Creates a bill; the GST engine computes CGST/SGST or IGST from `placeOfSupply`.
```json
{
  "direction": "OUTGOING",
  "billDate": "2026-06-29T00:00:00.000Z",
  "partyId": "…",
  "placeOfSupply": "27",
  "lineItems": [
    { "description": "Web design", "hsnSacCode": "9983", "quantity": 2, "rate": 5000, "gstRate": 18 }
  ]
}
```
Response includes `billNumber`, `subTotal`, `cgstTotal`, `sgstTotal`, `igstTotal`, `grandTotal`.

## Reports

### GET /reports/pnl
```json
{ "totalRevenue": 283200, "gstCollected": 43200, "netRevenue": 240000,
  "totalExpenses": 0, "itc": 0, "netExpenses": 0, "netProfit": 240000, "gstPayable": 43200 }
```

### GET /reports/receivables
```json
[ { "date": "2026-06-15T…", "invoice": "INV-00001", "client": "Bharath Traders",
    "amount": 118000, "paid": 118000, "outstanding": 0 } ]
```

## GST returns

### GET /returns
List generated returns for the tenant.

### POST /returns/generate  *(ADMIN, ACCOUNTANT)*
```json
{ "returnType": "GSTR1", "period": "06-2026" }
```
Builds section-wise data (B2B/B2CS…), validates against the GSTN schema (WIP), and
archives the result. `returnType` ∈ `GSTR1, GSTR2B, GSTR3B, GSTR4…GSTR9`.

---

## Errors
- `401` — missing/invalid JWT (client auto-redirects to login).
- `403` — role not permitted for the write.
- `400` — validation error (class-validator DTOs).
