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
import { AppPageChrome, AppPageBody } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';
import { useReceptionMobileMode } from '@/lib/reception-mobile-context';

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted/40 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

function LoadIndicator({ loaded, fetchedAt }: { loaded: boolean; fetchedAt?: string | null }) {
  return (
    <span className={loaded ? 'text-emerald-700' : 'text-ink-muted'}>
      {loaded ? '✓' : '—'}
      {loaded && fetchedAt && (
        <span className="ml-1 text-xs text-ink-muted">
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
            <div className="rounded-xl border border-border bg-surface-muted/40 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">EMMA Daten</p>
              <div className="mt-2 space-y-1 text-sm">
                <p>
                  <span className="text-ink-muted">Detail: </span>
                  <LoadIndicator loaded={!!data.emmaDetail} fetchedAt={data.detailFetchedAt} />
                </p>
                <p>
                  <span className="text-ink-muted">Folio: </span>
                  <LoadIndicator loaded={!!data.emmaFolio} fetchedAt={data.folioFetchedAt} />
                </p>
              </div>
            </div>
          </div>

          {canSync && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4">
              <button
                type="button"
                onClick={() => fetchDetail()}
                disabled={isFetchingDetail || isFetchingFolio || isMovingFolioCharge}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
              >
                {isFetchingDetail ? 'Lädt EMMA Detail…' : 'EMMA Detail laden'}
              </button>
              <button
                type="button"
                onClick={() => fetchFolio()}
                disabled={isFetchingFolio || isFetchingDetail || isMovingFolioCharge}
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
              >
                {isFetchingFolio ? 'Lädt Folio…' : 'Folio laden'}
              </button>
            </div>
          )}

          {fetchError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
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
