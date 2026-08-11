import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

export enum BillDirection { INCOMING = 'INCOMING', OUTGOING = 'OUTGOING' }
export enum DocumentType { INVOICE = 'INVOICE', CREDIT_NOTE = 'CREDIT_NOTE', DELIVERY_CHALLAN = 'DELIVERY_CHALLAN' }

export class LineItemDto {
  @IsString() description!: string;
  @IsOptional() @IsString() hsnSacCode?: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsOptional() @IsString() unit?: string;
  @IsNumber() @Min(0) rate!: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number; // line-level
  @IsNumber() @Min(0) gstRate!: number;
  @IsOptional() @IsNumber() @Min(0) cessRate?: number;
}

export class CreateBillDto {
  @IsEnum(BillDirection) direction!: BillDirection;
  @IsOptional() @IsEnum(DocumentType) documentType?: DocumentType;
  @IsOptional() @IsIn(['TAX', 'PROFORMA', 'BILL_OF_SUPPLY']) invoiceType?: string;
  @IsDateString() billDate!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @IsString() vendorInvoiceNo?: string;
  @IsOptional() @IsIn(['PAID', 'UNPAID', 'PARTIAL', 'OVERDUE']) paymentStatus?: string;
  @IsOptional() @IsString() paymentMode?: string;
  @IsOptional() @IsBoolean() itcBlocked?: boolean;
  @IsOptional() @IsString() partyId?: string;
  @IsOptional() @IsString() placeOfSupply?: string;
  @IsOptional() @IsBoolean() reverseCharge?: boolean;
  @IsOptional() @IsNumber() @Min(0) billDiscount?: number;   // bill-level discount
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;   // handling, shipping, etc.
  @IsOptional() @IsIn(['en', 'hi']) language?: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems!: LineItemDto[];
}
