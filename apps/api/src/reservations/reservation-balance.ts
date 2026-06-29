export {
  formatOutstandingAmount,
  outstandingBalanceFetchedAt,
  outstandingBalanceForStorage,
  outstandingFromDetail,
  outstandingFromFolio,
  parseEmmaAmount,
  resolveOutstandingBalance,
  type OutstandingBalanceSource,
  type ResolvedOutstandingBalance,
} from '@housekeeping/shared';

/** Back-compat alias */
export { resolveOutstandingBalance as resolveReservationBalance } from '@housekeeping/shared';

export { outstandingBalanceFetchedAt as balanceFetchedAt } from '@housekeeping/shared';
