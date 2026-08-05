'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { ReservationDetail } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { usePermission } from '@/lib/auth-context';
import {
  formatOpenTotal,
  ReservationDetailView,
  type ReservationDetailTab,
} from '@/components/reception/reservation-detail/ReservationDetailView';
import { reservationStatus } from '@/components/reception/reservation-detail/reservationStatus';
import { useReservationEmmaFetch } from '@/components/reception/reservation-detail/useReservationEmmaFetch';
import { AppPageChrome, AppPageBody, APP_DARK_CARD } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`${APP_DARK_CARD} px-4 py-3`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-sidebar-muted">{sub}</p>}
    </div>
  );
}

function LoadIndicator({ loaded, fetchedAt }: { loaded: boolean; fetchedAt?: string | null }) {
  return (
    <span className={loaded ? 'text-emerald-300' : 'text-sidebar-muted'}>
      {loaded ? '✓' : '—'}
      {loaded && fetchedAt && (
        <span className="ml-1 text-xs text-sidebar-muted">
          {new Date(fetchedAt).toLocaleString('de-CH')}
        </span>
      )}
    </span>
  );
}

export default function ReservationDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const reservationId = params.reservationId as string;
  const from = searchParams.get('from');
  const backHref =
    from === 'arrivals' ? '/r/arrivals' : from === 'in-house' ? '/r/in-house' : '/r/reservations';
  const backLabel =
    from === 'arrivals' ? 'Anreisen' : from === 'in-house' ? 'Im Haus' : 'Reservierungen';

  const canSync = usePermission('RESERVATIONS_SYNC');
  const { enterMobile } = useReceptionMobileMode();
  const [activeTab, setActiveTab] = useState<ReservationDetailTab>('overview');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reservation', reservationId],
    queryFn: () => api<ReservationDetail>(`/reservations/${reservationId}`),
    enabled: !!reservationId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const {
    fetchError,
    fetchDetail,
    fetchFolio,
    moveFolioCharge,
    isFetchingDetail,
    isFetchingFolio,
    isMovingFolioCharge,
  } = useReservationEmmaFetch(reservationId);

  const status = data ? reservationStatus(data) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title={data?.mainGuestName ?? 'Reservierung'}
        description={`Res.-Nr. ${reservationId}`}
        actions={
          <>
            <AppChromeTools onEnterMobile={enterMobile} />
            <Link
              href={backHref}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-btn border border-sidebar-border px-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              ← {backLabel}
            </Link>
          </>
        }
      />

      <AppPageBody>
        <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">

      {status && (
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      )}

      {isLoading && <p className="text-sm text-sidebar-muted">Lädt…</p>}
      {isError && (
        <p className="text-sm text-rose-400">Reservierung konnte nicht geladen werden.</p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Anreise / Abreise"
              value={`${data.arrivalDate} → ${data.departureDate}`}
              sub={data.nightsStay != null ? `${data.nightsStay} Nächte` : undefined}
            />
            <SummaryCard
              label="Zimmer / Typ"
              value={data.roomId ?? '—'}
              sub={data.roomType ?? undefined}
            />
            <SummaryCard label="Total offen" value={formatOpenTotal(data)} />
            <div className={`${APP_DARK_CARD} px-4 py-3`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">EMMA Daten</p>
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <span className="text-sidebar-muted">Detail: </span>
                  <LoadIndicator loaded={!!data.emmaDetail} fetchedAt={data.detailFetchedAt} />
                </p>
                <p>
                  <span className="text-sidebar-muted">Folio: </span>
                  <LoadIndicator loaded={!!data.emmaFolio} fetchedAt={data.folioFetchedAt} />
                </p>
              </div>
            </div>
          </div>

          {canSync && (
            <div className={`${APP_DARK_CARD} flex flex-wrap items-center gap-2 p-4`}>
              <button
                type="button"
                onClick={() => fetchDetail()}
                disabled={isFetchingDetail || isFetchingFolio || isMovingFolioCharge}
                className="rounded-lg border border-sidebar-border bg-transparent px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
              >
                {isFetchingDetail ? 'Lädt EMMA Detail…' : 'EMMA Detail laden'}
              </button>
              <button
                type="button"
                onClick={() => fetchFolio()}
                disabled={isFetchingFolio || isFetchingDetail || isMovingFolioCharge}
                className="rounded-lg border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50"
              >
                {isFetchingFolio ? 'Lädt Folio…' : 'Folio laden'}
              </button>
            </div>
          )}

          {fetchError && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {fetchError}
            </p>
          )}

          <ReservationDetailView
            data={data}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            canSync={canSync}
            movingCharge={isMovingFolioCharge}
            onMoveCharge={
              canSync
                ? async (sourceFolioId, chargeRowId, destinationFolioId) => {
                    await moveFolioCharge({
                      sourceFolioId,
                      chargeRowId,
                      destinationFolioId,
                      hotelId: data.hotelId,
                    });
                  }
                : undefined
            }
          />
        </>
      )}
        </div>
      </AppPageBody>
    </div>
  );
}
