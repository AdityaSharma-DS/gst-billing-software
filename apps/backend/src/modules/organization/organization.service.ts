import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { WhiteBooksService } from '../gstn/whitebooks.service';

// Fields the client may update on the organization.
const EDITABLE = [
  'legalName', 'tradeName', 'invoiceShortCode', 'gstin', 'pan', 'cin', 'msme', 'taxRegime', 'financialYear',
  'addressLine1', 'addressLine2', 'city', 'state', 'stateCode', 'pincode', 'email', 'phone',
  'bankAccountName', 'bankName', 'bankAccountNumber', 'bankBranch', 'bankIfsc', 'upiId', 'defaultTerms',
  'gspUsername', 'gspPassword',
] as const;

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly gsp: WhiteBooksService,
  ) {}

  /** Raw org row (includes gspPassword) — internal use only. */
  private getRaw(tenantId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const org = await tx.organization.findFirst();
      if (!org) throw new NotFoundException('Organization not found');
      return org;
    });
  }

  async get(tenantId: string) {
    const org = await this.getRaw(tenantId);
    // Never send the NIC API password to the browser; expose only whether it's set.
    const { gspPassword, ...safe } = org as any;
    return { ...safe, gspPassword: gspPassword ? '********' : '', gspPasswordSet: !!gspPassword };
  }

  async update(tenantId: string, data: any) {
    const org = await this.getRaw(tenantId);
    const patch: Record<string, any> = {};
    for (const k of EDITABLE) if (data[k] !== undefined) patch[k] = data[k];
    // Don't overwrite the stored password when the UI echoes the masked value.
    if (patch.gspPassword === '********') delete patch.gspPassword;
    await this.prisma.withTenant(tenantId, (tx) => tx.organization.update({ where: { id: org.id }, data: patch }));
    return this.get(tenantId);
  }

  /** Authenticate against the GSP with this org's NIC credentials. */
  async testGsp(tenantId: string) {
    const org = await this.getRaw(tenantId);
    return this.gsp.testConnection(org);
  }

  async setLogo(tenantId: string, file: Express.Multer.File) {
    const org = await this.get(tenantId);
    const ext = (file.originalname.split('.').pop() || 'png').toLowerCase();
    const { url } = await this.storage.put(tenantId, 'branding', `logo.${ext}`, file.buffer, file.mimetype);
    await this.prisma.withTenant(tenantId, (tx) => tx.organization.update({ where: { id: org.id }, data: { logoUrl: url } }));
    return { logoUrl: url };
  }
}
