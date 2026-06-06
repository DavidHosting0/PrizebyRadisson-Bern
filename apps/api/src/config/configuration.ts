export default () => ({
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-change-me',
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  },
  s3: {
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET ?? 'housekeeping',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
  crypto: {
    secretKey: process.env.FAVUR_ENCRYPTION_KEY ?? process.env.JWT_ACCESS_SECRET,
  },
  emma: {
    /** Set `false` to disable cron + action-triggered room-status sync. */
    autoSync: process.env.EMMA_AUTO_SYNC !== 'false',
    /** Nest cron expression; default every 5 minutes. */
    autoSyncCron: process.env.EMMA_AUTO_SYNC_CRON ?? '0 */5 * * * *',
    /** Debounce ms after room activity before OData pull (default 20s). */
    actionSyncDebounceMs: parseInt(process.env.EMMA_ACTION_SYNC_DEBOUNCE_MS ?? '20000', 10),
    /** Wait after first room list/detail read before pulling EMMA (default 5s). */
    viewSyncDebounceMs: parseInt(process.env.EMMA_VIEW_SYNC_DEBOUNCE_MS ?? '5000', 10),
    /** Minimum gap between view-triggered EMMA pulls (default 90s). */
    viewSyncMinIntervalMs: parseInt(process.env.EMMA_VIEW_SYNC_MIN_INTERVAL_MS ?? '90000', 10),
    /** `true` / `1` / `verbose` — ausführliche $batch- und Parsing-Logs. */
    debug: process.env.EMMA_DEBUG,
    reservationAutoSync: process.env.EMMA_RESERVATION_AUTO_SYNC !== 'false',
    reservationSyncCron: process.env.EMMA_RESERVATION_SYNC_CRON ?? '0 */3 * * * *',
    reservationRetentionDays: parseInt(process.env.EMMA_RESERVATION_RETENTION_DAYS ?? '30', 10),
  },
});
