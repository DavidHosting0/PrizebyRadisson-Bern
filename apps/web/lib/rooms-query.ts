import { queryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Shared React Query key for `GET /api/v1/rooms` (full property list). */
export const ROOMS_LIST_QUERY_KEY = ['rooms', 'list'] as const;

export type RoomListRow = {
  id: string;
  roomNumber: string;
  floor: number | null;
  derivedStatus: string;
};

export function roomsListQueryOptions<T = RoomListRow>() {
  return queryOptions({
    queryKey: ROOMS_LIST_QUERY_KEY,
    queryFn: () => api<T[]>('/rooms'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}
