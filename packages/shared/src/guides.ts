export type GuideListItemDto = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  category: string | null;
  sortOrder: number;
  published: boolean;
  updatedAt: string;
};

export type GuideDetailDto = GuideListItemDto & {
  body: string;
  createdAt: string;
  createdBy: { id: string; name: string; titlePrefix: string };
  updatedBy: { id: string; name: string; titlePrefix: string } | null;
};

export type ReorderGuidesPayload = {
  items: Array<{ id: string; sortOrder: number }>;
};
