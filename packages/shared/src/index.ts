// Shared types used across backend, web, and mobile.

export type UserRole = 'ADMIN' | 'ACCOUNTANT' | 'VIEWER';
export type BillDirection = 'INCOMING' | 'OUTGOING';
export type BillStatus = 'DRAFT' | 'APPROVED' | 'VERIFIED' | 'FINALIZED' | 'CANCELLED';

export type ReturnType =
  | 'GSTR1' | 'GSTR2B' | 'GSTR3B' | 'GSTR4'
  | 'GSTR5' | 'GSTR6' | 'GSTR7' | 'GSTR8' | 'GSTR9';

export interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; role: UserRole; fullName: string; tenantId?: string };
}

export interface LineItem {
  description: string;
  hsnSacCode?: string;
  quantity: number;
  rate: number;
  discount?: number;
  gstRate: number;
  cessRate?: number;
}
