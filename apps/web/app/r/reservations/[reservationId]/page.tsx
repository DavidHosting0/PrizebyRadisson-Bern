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
  const backHref = from === 'arrivals' ? '/r/arrivals' : '/r/reservations';
  const backLabel = from === 'arrivals' ? 'Anreisen' : 'Reservierungen';

  const canSync = usePermission('RESERVATIONS_SYNC');
  const [activeTab, setActiveTab] = useState<ReservationDetailTab>('overview');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reservation', reservationId],
    queryFn: () => api<ReservationDetail>(`/reservations/${reservationId}`),
    enabled: !!reservationId,
  });

  const {
    fetchError,
    fetchDetail,
    fetchFolio,
    isFetchingDetail,
    isFetchingFolio,
  } = useReservationEmmaFetch(reservationId);

  const status = data ? reservationStatus(data) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink"
        >
          ← Zurück zu {backLabel}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-ink md:text-3xl">
              {data?.mainGuestName ?? 'Reservierung'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">Res.-Nr. {reservationId}</p>
            {status && (
              <span
                className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
              >
                {status.label}
              </span>
            )}
          </div>
        </div>
      </header>

      {isLoading && <p className="text-sm text-ink-muted">Lädt…</p>}
      {isError && (
        <p className="text-sm text-rose-700">Reservierung konnte nicht geladen werden.</p>
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
                disabled={isFetchingDetail || isFetchingFolio}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
              >
                {isFetchingDetail ? 'Lädt EMMA Detail…' : 'EMMA Detail laden'}
              </button>
              <button
                type="button"
                onClick={() => fetchFolio()}
                disabled={isFetchingFolio || isFetchingDetail}
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
          />
        </>
      )}
    </div>
  );
}
