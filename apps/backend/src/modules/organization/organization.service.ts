import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

// Fields the client may update on the organization.
const EDITABLE = [
  'legalName', 'tradeName', 'invoiceShortCode', 'gstin', 'pan', 'cin', 'msme', 'taxRegime', 'financialYear',
  'addressLine1', 'addressLine2', 'city', 'state', 'stateCode', 'pincode', 'email', 'phone',
  'bankAccountName', 'bankName', 'bankAccountNumber', 'bankBranch', 'bankIfsc', 'upiId', 'defaultTerms',
] as const;

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  async get(tenantId: string) {
    const org = await this.prisma.withTenant(tenantId, (tx) => tx.organization.findFirst());
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(tenantId: string, data: any) {
    const org = await this.get(tenantId);
    const patch: Record<string, any> = {};
    for (const k of EDITABLE) if (data[k] !== undefined) patch[k] = data[k];
    return this.prisma.withTenant(tenantId, (tx) => tx.organization.update({ where: { id: org.id }, data: patch }));
  }

  async setLogo(tenantId: string, file: Express.Multer.File) {
    const org = await this.get(tenantId);
    const ext = (file.originalname.split('.').pop() || 'png').toLowerCase();
    const { url } = await this.storage.put(tenantId, 'branding', `logo.${ext}`, file.buffer, file.mimetype);
    await this.prisma.withTenant(tenantId, (tx) => tx.organization.update({ where: { id: org.id }, data: { logoUrl: url } }));
    return { logoUrl: url };
  }
}
