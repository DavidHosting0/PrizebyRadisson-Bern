'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  hotelTodayIso,
  type DailyCleaningPlanResponse,
  type DailyCleaningTaskDto,
} from '@housekeeping/shared';
import { api } from '@/lib/api';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { Card } from '@/components/ui/Card';

export type OpenCleaningTab = 'DIRTY' | 'RESTANT';

type PersonGroup = {
  key: string;
  name: string;
  titlePrefix: string | null;
  tasks: DailyCleaningTaskDto[];
};

export function OpenCleaningTasksView({
  roomHref,
  layout = 'stack',
}: {
  roomHref: (roomId: string) => string;
  layout?: 'stack' | 'grid';
}) {
  const today = hotelTodayIso();
  const [tab, setTab] = useState<OpenCleaningTab>('DIRTY');

  const planQ = useQuery({
    queryKey: ['assignments', 'daily-plan', today],
    queryFn: () =>
      api<DailyCleaningPlanResponse>(
        `/assignments/daily-plan?date=${encodeURIComponent(today)}`,
      ),
    refetchInterval: 30_000,
  });

  const nameById = useMemo(() => {
    const map = new Map<string, { name: string; titlePrefix: string }>();
    const plan = planQ.data;
    if (!plan) return map;
    for (const list of [
      plan.workingToday,
      plan.eligibleCleaners,
      plan.allCleaners,
      plan.manualAssignees,
    ]) {
      for (const a of list ?? []) {
        if (!map.has(a.id)) map.set(a.id, { name: a.name, titlePrefix: a.titlePrefix });
      }
    }
    return map;
  }, [planQ.data]);

  const groups = useMemo((): PersonGroup[] => {
    const open = (planQ.data?.tasks ?? []).filter(
      (t) => t.kind === 'ROOM' && t.workType === tab && !t.completedAt && t.roomId,
    );

    const byPerson = new Map<string, DailyCleaningTaskDto[]>();
    for (const t of open) {
      const key = t.assigneeUserId ?? '__unassigned__';
      const list = byPerson.get(key) ?? [];
      list.push(t);
      byPerson.set(key, list);
    }

    const result: PersonGroup[] = [];
    for (const [key, tasks] of byPerson) {
      tasks.sort((a, b) =>
        (a.roomNumber ?? '').localeCompare(b.roomNumber ?? '', undefined, { numeric: true }),
      );
      if (key === '__unassigned__') {
        result.push({ key, name: 'Unassigned', titlePrefix: null, tasks });
        continue;
      }
      const person = nameById.get(key);
      result.push({
        key,
        name: person?.name ?? key,
        titlePrefix: person?.titlePrefix ?? null,
        tasks,
      });
    }

    result.sort((a, b) => {
      if (a.key === '__unassigned__') return 1;
      if (b.key === '__unassigned__') return -1;
      return a.name.localeCompare(b.name);
    });
    return result;
  }, [planQ.data?.tasks, tab, nameById]);

  const totalOpen = groups.reduce((n, g) => n + g.tasks.length, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex max-w-md rounded-btn border border-sidebar-border/70 bg-sidebar p-1">
        {(
          [
            { id: 'DIRTY' as const, label: 'Departures' },
            { id: 'RESTANT' as const, label: 'Restant' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              'min-h-[44px] flex-1 rounded-btn text-sm font-medium transition-colors',
              tab === t.id ? 'bg-action text-white' : 'text-sidebar-muted hover:text-white',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-sidebar-muted">
        {planQ.isLoading
          ? 'Loading…'
          : `${totalOpen} open ${tab === 'DIRTY' ? 'departure' : 'restant'}${totalOpen === 1 ? '' : 's'}`}
      </p>

      {planQ.isError && (
        <p className="mt-3 text-sm text-danger">Could not load today’s cleaning plan.</p>
      )}

      <ul
        className={clsx(
          'mt-3 min-h-0 flex-1 gap-3 overflow-y-auto pb-2',
          layout === 'grid'
            ? 'grid grid-cols-1 content-start sm:grid-cols-2 xl:grid-cols-3'
            : 'flex flex-col',
        )}
      >
        {groups.map((g) => (
          <li key={g.key}>
            <Card tone="dark" className="h-full p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold text-white">
                  {g.titlePrefix
                    ? formatUserWithTitlePrefix(g.name, g.titlePrefix)
                    : g.name}
                </h2>
                <span className="shrink-0 text-xs tabular-nums text-sidebar-muted">
                  {g.tasks.length}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {g.tasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={roomHref(t.roomId!)}
                      className="flex items-center justify-between gap-3 rounded-btn border border-sidebar-border/50 bg-[#121a26] px-3 py-2.5 transition hover:border-action/40"
                    >
                      <span className="font-medium tabular-nums text-slate-100">
                        Room {t.roomNumber}
                      </span>
                      <span className="text-xs text-sidebar-muted">
                        {t.floor != null ? `Floor ${t.floor}` : 'Open'}
                        {t.overdueDays != null && t.overdueDays > 0
                          ? ` · ${t.overdueDays}d overdue`
                          : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>

      {!planQ.isLoading && groups.length === 0 && (
        <p className="mt-2 text-sm text-sidebar-muted">
          No open {tab === 'DIRTY' ? 'departures' : 'restants'} right now.
        </p>
      )}
    </div>
  );
}
