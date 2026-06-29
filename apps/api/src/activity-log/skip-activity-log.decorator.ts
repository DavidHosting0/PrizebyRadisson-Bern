import { SetMetadata } from '@nestjs/common';

export const SKIP_ACTIVITY_LOG_KEY = 'skipActivityLog';

/** Skip automatic activity logging for high-frequency or internal endpoints. */
export const SkipActivityLog = () => SetMetadata(SKIP_ACTIVITY_LOG_KEY, true);
