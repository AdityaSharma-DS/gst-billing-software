import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentTenant } from '../../common/tenancy/tenant.decorator';
import { WhiteBooksService } from './whitebooks.service';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const first = (...v: any[]) => v.find((x) => x != null && x !== '') ?? '';

/** Normalize the varied NIC/GSP "GSTIN details" shapes into a flat address. */
function normalize(raw: any) {
  const d = raw?.data ?? raw ?? {};
  const p = d.pradr?.addr ?? d.pradr ?? d.principalAddress ?? d.addr ?? {};
  const addressParts = [
    first(p.bno, p.AddrBno, d.addBno, d.AddrBno),
    first(p.bnm, p.AddrBnm, d.addBnm),
    first(p.flno, d.addFlno),
    first(p.st, p.AddrSt, d.addSt),
    first(p.loc, p.AddrLoc, d.addLoc),
  ].filter(Boolean);
  const stateCode = first(p.stcd, d.stateCode, d.stcd);
  return {
    gstin: first(d.gstin, d.Gstin),
    name: first(d.tradeNam, d.tradeName, d.TradeName, d.lgnm, d.legalName, d.LegalName),
    legalName: first(d.lgnm, d.legalName, d.LegalName),
    address: addressParts.join(', '),
    city: first(p.dst, p.loc, p.AddrLoc, d.city),
    pincode: first(p.pncd, p.AddrPncd, d.pinCode, d.pncd),
    stateCode: stateCode ? String(stateCode).padStart(2, '0') : '',
    stateName: '',
    status: first(d.sts, d.status, d.Status),
  };
}

@Controller('gstn')
@UseGuards(JwtAuthGuard)
export class GstnController {
  constructor(private readonly wb: WhiteBooksService) {}

  /**
   * Look up a counterparty GSTIN's registered details via the GST API's
   * "Search Taxpayer" (needs only the platform GST Client ID/Secret — no
   * per-taxpayer login). The frontend falls back to the offline
   * state-from-code derivation when this can't run.
   */
  @Get('gstin/:gstin')
  async lookup(@CurrentTenant() _tenantId: string, @Param('gstin') gstin: string) {
    const g = (gstin || '').toUpperCase().trim();
    if (!GSTIN_RE.test(g)) throw new BadRequestException('Invalid GSTIN format');
    const raw = await this.wb.searchTaxpayer(g);
    const out = normalize(raw);
    out.stateName = out.stateCode;       // the API returns the state *name* in stcd
    out.stateCode = g.slice(0, 2);       // authoritative 2-digit code from the GSTIN
    return out;
  }
}
