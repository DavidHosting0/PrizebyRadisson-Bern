'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { MoveReservationFolioChargeBody, ReservationDetail } from '@housekeeping/shared';
import { api } from '@/lib/api';

export function useReservationEmmaFetch(reservationId: string) {
  const queryClient = useQueryClient();
  const [fetchError, setFetchError] = useState<string | null>(null);

  const applyDetail = (detail: ReservationDetail) => {
    queryClient.setQueryData<ReservationDetail>(['reservation', reservationId], detail);
    void queryClient.invalidateQueries({ queryKey: ['arrivals'] });
    void queryClient.invalidateQueries({ queryKey: ['reservations'] });
  };

  const fetchDetailMut = useMutation({
    mutationFn: () =>
      api<ReservationDetail>(`/reservations/${reservationId}/fetch-detail`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onMutate: () => setFetchError(null),
    onSuccess: applyDetail,
    onError: (err) => setFetchError((err as Error).message),
  });

  const fetchFolioMut = useMutation({
    mutationFn: () =>
      api<ReservationDetail>(`/reservations/${reservationId}/fetch-folio`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onMutate: () => setFetchError(null),
    onSuccess: applyDetail,
    onError: (err) => setFetchError((err as Error).message),
  });

  const moveFolioChargeMut = useMutation({
    mutationFn: (body: MoveReservationFolioChargeBody) =>
      api<ReservationDetail>(`/reservations/${reservationId}/move-folio-charge`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onMutate: () => setFetchError(null),
    onSuccess: applyDetail,
    onError: (err) => setFetchError((err as Error).message),
  });

  return {
    fetchError,
    fetchDetail: fetchDetailMut.mutate,
    fetchFolio: fetchFolioMut.mutate,
    moveFolioCharge: moveFolioChargeMut.mutateAsync,
    isFetchingDetail: fetchDetailMut.isPending,
    isFetchingFolio: fetchFolioMut.isPending,
    isMovingFolioCharge: moveFolioChargeMut.isPending,
  };
}
