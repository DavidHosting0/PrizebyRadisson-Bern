/** User fields safe to expose in lists / relations (display in app UI). */
export const userPublicSelect = {
  id: true,
  name: true,
  titlePrefix: true,
  avatarS3Key: true,
} as const;
