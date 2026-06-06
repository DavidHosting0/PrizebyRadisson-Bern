'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';

export function useReservationEmmaFetch(reservationId: string) {
  const queryClient = useQueryClient();
  const [fetchError, setFetchError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['reservation', reservationId] });
    void queryClient.invalidateQueries({ queryKey: ['arrivals'] });
    void queryClient.invalidateQueries({ queryKey: ['reservations'] });
  };

  const fetchDetailMut = useMutation({
    mutationFn: () =>
      api(`/reservations/${reservationId}/fetch-detail`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onMutate: () => setFetchError(null),
    onSuccess: invalidate,
    onError: (err) => setFetchError((err as Error).message),
  });

  const fetchFolioMut = useMutation({
    mutationFn: () =>
      api(`/reservations/${reservationId}/fetch-folio`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onMutate: () => setFetchError(null),
    onSuccess: invalidate,
    onError: (err) => setFetchError((err as Error).message),
  });

  return {
    fetchError,
    fetchDetail: fetchDetailMut.mutate,
    fetchFolio: fetchFolioMut.mutate,
    isFetchingDetail: fetchDetailMut.isPending,
    isFetchingFolio: fetchFolioMut.isPending,
  };
}
