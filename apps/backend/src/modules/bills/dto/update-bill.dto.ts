import { IsEnum } from 'class-validator';

export enum BillStatus {
  DRAFT = 'DRAFT', APPROVED = 'APPROVED', VERIFIED = 'VERIFIED',
  FINALIZED = 'FINALIZED', CANCELLED = 'CANCELLED',
}

export class UpdateStatusDto {
  @IsEnum(BillStatus) status!: BillStatus;
}

// Edits resend the full bill payload, so updates reuse CreateBillDto (full replace).
