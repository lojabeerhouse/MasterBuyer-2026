import type { PurchaseOrderStatus } from '../types';

export const OPEN_STATUSES: PurchaseOrderStatus[] = ['draft', 'sent', 'confirmed', 'in_transit', 'awaiting'];
export const CHECK_STATUSES: PurchaseOrderStatus[] = ['received_unchecked'];
export const DONE_STATUSES: PurchaseOrderStatus[] = ['received', 'entered_system', 'fully_checked'];

export function isOpenOrder(status: PurchaseOrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function needsCheck(status: PurchaseOrderStatus): boolean {
  return CHECK_STATUSES.includes(status);
}
