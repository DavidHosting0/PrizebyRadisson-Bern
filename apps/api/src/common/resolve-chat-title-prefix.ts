import type { UserTitlePrefix } from '@prisma/client';

/** Chat display prefix: profile override, else admin app-area titlePrefix. */
export function resolveChatTitlePrefix(user: {
  titlePrefix: UserTitlePrefix | string;
  chatTitlePrefix?: UserTitlePrefix | string | null;
}): string {
  return (user.chatTitlePrefix ?? user.titlePrefix) as string;
}
