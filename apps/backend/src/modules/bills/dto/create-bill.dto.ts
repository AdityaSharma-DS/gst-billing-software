import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, ValidateNested,
} from 'class-validator';

export enum BillDirection { INCOMING = 'INCOMING', OUTGOING = 'OUTGOING' }

export class LineItemDto {
  @IsString() description!: string;
  @IsOptional() @IsString() hsnSacCode?: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsString() unit?: string;
  @IsNumber() rate!: number;
  @IsOptional() @IsNumber() discount?: number;
  @IsNumber() gstRate!: number;
  @IsOptional() @IsNumber() cessRate?: number;
}

export class CreateBillDto {
  @IsEnum(BillDirection) direction!: BillDirection;
  @IsDateString() billDate!: string;
  @IsOptional() @IsString() partyId?: string;
  @IsOptional() @IsString() placeOfSupply?: string;
  @IsOptional() @IsBoolean() reverseCharge?: boolean;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems!: LineItemDto[];
}
