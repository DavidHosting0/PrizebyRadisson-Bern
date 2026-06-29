import { NotificationType, UserRole } from '@prisma/client';

/** Role-specific deep link for in-app notification navigation. */
export function notificationLinkPath(
  role: UserRole,
  type: NotificationType,
): string {
  switch (type) {
    case NotificationType.SERVICE_REQUEST_CREATED:
      if (role === UserRole.SUPERVISOR || role === UserRole.ADMIN) return '/s/requests';
      return '/h/requests';
    case NotificationType.TEAM_CHAT_MENTION:
      if (role === UserRole.RECEPTION || role === UserRole.ADMIN) return '/r/chat';
      if (role === UserRole.SUPERVISOR) return '/s/chat';
      if (role === UserRole.TECHNICIAN) return '/t/chat';
      return '/h/chat';
    default:
      return '/h/chat';
  }
}
