export type MirusShift = {
  /** Stable external id (Person UUID or normalized name). Stored in FavurUserMap.favurUserId. */
  externalUserId: string;
  displayName: string;
  startsAt: Date;
  endsAt: Date;
  label?: string | null;
  sourceId: string;
};
