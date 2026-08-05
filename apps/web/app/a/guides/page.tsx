'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type { GuideDetailDto, GuideListItemDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/toast/ToastProvider';
import { Button } from '@/components/ui/Button';
import { MarkdownContent } from '@/components/guides/MarkdownContent';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

type DraftGuide = {
  title: string;
  summary: string;
  category: string;
  body: string;
  published: boolean;
  sortOrder: number;
};

const emptyDraft = (): DraftGuide => ({
  title: '',
  summary: '',
  category: '',
  body: '',
  published: false,
  sortOrder: 0,
});

function draftFromGuide(guide: GuideDetailDto): DraftGuide {
  return {
    title: guide.title,
    summary: guide.summary ?? '',
    category: guide.category ?? '',
    body: guide.body,
    published: guide.published,
    sortOrder: guide.sortOrder,
  };
}

function draftsEqual(a: DraftGuide, b: DraftGuide): boolean {
  return (
    a.title === b.title &&
    a.summary === b.summary &&
    a.category === b.category &&
    a.body === b.body &&
    a.published === b.published &&
    a.sortOrder === b.sortOrder
  );
}

function parseApiError(raw: string): string {
  try {
    const j = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(j.message)) return j.message.join(', ');
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* plain text */
  }
  return raw || 'Request failed';
}

export default function AdminGuidesPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<DraftGuide>(emptyDraft());
  const [savedDraft, setSavedDraft] = useState<DraftGuide>(emptyDraft());
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: guides = [], isLoading } = useQuery({
    queryKey: ['guides', 'admin'],
    enabled: me?.role === 'ADMIN',
    queryFn: () => api<GuideListItemDto[]>('/guides?all=true'),
  });

  const { data: detail } = useQuery({
    queryKey: ['guide', selectedId],
    enabled: me?.role === 'ADMIN' && !!selectedId && selectedId !== 'new',
    queryFn: () => api<GuideDetailDto>(`/guides/${selectedId}`),
  });

  useEffect(() => {
    if (!selectedId && guides.length > 0) setSelectedId(guides[0].id);
  }, [guides, selectedId]);

  useEffect(() => {
    if (selectedId === 'new') {
      const next = emptyDraft();
      setDraft(next);
      setSavedDraft(next);
      return;
    }
    if (detail) {
      const next = draftFromGuide(detail);
      setDraft(next);
      setSavedDraft(next);
    }
  }, [detail, selectedId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const g of guides) {
      if (g.category) set.add(g.category);
    }
    if (draft.category.trim()) set.add(draft.category.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [guides, draft.category]);

  const dirty = !draftsEqual(draft, savedDraft);

  const selectGuide = (id: string | 'new') => {
    if (dirty) {
      const ok = window.confirm('You have unsaved changes. Discard them?');
      if (!ok) return;
    }
    setSelectedId(id);
    setDeleteOpen(false);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        title: draft.title.trim(),
        summary: draft.summary.trim() || null,
        category: draft.category.trim() || null,
        body: draft.body,
        published: draft.published,
        sortOrder: draft.sortOrder,
      };
      if (!payload.title) throw new Error('Title is required');
      if (selectedId === 'new') {
        return api<GuideDetailDto>('/guides', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      return api<GuideDetailDto>(`/guides/${selectedId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['guides'] });
      qc.setQueryData(['guide', saved.id], saved);
      setSelectedId(saved.id);
      const next = draftFromGuide(saved);
      setDraft(next);
      setSavedDraft(next);
      toast.push('Guide saved', 'success');
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  const deleteMut = useMutation({
    mutationFn: () => api(`/guides/${selectedId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guides'] });
      setSelectedId(null);
      setDeleteOpen(false);
      toast.push('Guide deleted', 'success');
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Guides"
        description="Create and publish markdown guides for the reception desk."
        actions={
          <>
            <AppChromeTools />
            <Button type="button" variant="action" className="min-h-[40px]" onClick={() => selectGuide('new')}>
              New guide
            </Button>
          </>
        }
      />
      <AppPageBody>
        <div className="space-y-6 p-4 md:p-6">
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className={APP_DARK_CARD + ' h-fit p-0'}>
          <div className="border-b border-sidebar-border/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">All guides</p>
          </div>
          {isLoading && <p className="p-4 text-sm text-sidebar-muted">Loading…</p>}
          <ul className="max-h-[70vh] overflow-y-auto">
            {guides.map((guide) => (
              <li key={guide.id}>
                <button
                  type="button"
                  onClick={() => selectGuide(guide.id)}
                  className={clsx(
                    'w-full border-b border-sidebar-border/40 px-4 py-3 text-left transition-colors last:border-b-0',
                    selectedId === guide.id ? 'bg-action/20' : 'hover:bg-white/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-white">{guide.title}</span>
                    {!guide.published && (
                      <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
                        Draft
                      </span>
                    )}
                  </div>
                  {guide.category && (
                    <p className="mt-1 text-xs text-sidebar-muted">{guide.category}</p>
                  )}
                </button>
              </li>
            ))}
            {guides.length === 0 && !isLoading && (
              <li className="p-4 text-sm text-sidebar-muted">No guides yet.</li>
            )}
          </ul>
        </div>

        <div className="space-y-4">
          {!selectedId ? (
            <div className={APP_DARK_CARD + ' p-5'}>
              <p className="text-sm text-sidebar-muted">Select a guide or create a new one.</p>
            </div>
          ) : (
            <>
              <div className={APP_DARK_CARD + ' space-y-4 p-5'}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium uppercase tracking-wide text-sidebar-muted">Title</span>
                    <input
                      className={clsx(APP_DARK_INPUT, 'mt-1 w-full py-2')}
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium uppercase tracking-wide text-sidebar-muted">Category</span>
                    <input
                      className={clsx(APP_DARK_INPUT, 'mt-1 w-full py-2')}
                      value={draft.category}
                      onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                      list="guide-categories"
                    />
                    <datalist id="guide-categories">
                      {categories.map((cat) => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-sidebar-muted">Summary</span>
                  <textarea
                    className={clsx(APP_DARK_INPUT, 'mt-1 w-full py-2')}
                    rows={2}
                    maxLength={200}
                    value={draft.summary}
                    onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                    placeholder="Short excerpt shown on the guide card"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={draft.published}
                      onChange={(e) => setDraft((d) => ({ ...d, published: e.target.checked }))}
                    />
                    Published
                  </label>
                  <label className="flex items-center gap-2 text-sm text-white">
                    <span className="text-sidebar-muted">Sort order</span>
                    <input
                      type="number"
                      min={0}
                      className={clsx(APP_DARK_INPUT, 'w-20 py-1')}
                      value={draft.sortOrder}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) || 0 }))
                      }
                    />
                  </label>
                </div>
              </div>

              <div className={APP_DARK_CARD + ' p-0'}>
                <div className="border-b border-sidebar-border/60 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Body (Markdown)</p>
                </div>
                <div className="grid min-h-[420px] lg:grid-cols-2">
                  <textarea
                    className="min-h-[420px] w-full resize-y border-0 border-r border-sidebar-border/60 bg-transparent px-4 py-3 font-mono text-sm text-white placeholder:text-sidebar-muted focus:outline-none"
                    value={draft.body}
                    onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                    placeholder="# Guide title&#10;&#10;Write your guide in markdown…"
                  />
                  <div className="min-h-[420px] overflow-y-auto border-t border-sidebar-border/60 bg-surface px-4 py-3 lg:border-t-0">
                    {draft.body.trim() ? (
                      <MarkdownContent content={draft.body} />
                    ) : (
                      <p className="text-sm text-ink-muted">Preview will appear here.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="action"
                  disabled={saveMut.isPending || !draft.title.trim()}
                  onClick={() => saveMut.mutate()}
                >
                  {saveMut.isPending ? 'Saving…' : 'Save guide'}
                </Button>
                {selectedId !== 'new' && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="border border-sidebar-border bg-transparent text-white hover:bg-white/10"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete
                  </Button>
                )}
                {dirty && <span className="text-sm text-amber-300">Unsaved changes</span>}
              </div>

              {deleteOpen && selectedId !== 'new' && (
                <div className={APP_DARK_CARD + ' border-red-500/30 bg-red-500/10 p-5'}>
                  <p className="text-sm font-medium text-white">Delete this guide?</p>
                  <p className="mt-1 text-sm text-sidebar-muted">This cannot be undone.</p>
                  <div className="mt-4 flex gap-2">
                    <Button
                      type="button"
                      variant="danger"
                      disabled={deleteMut.isPending}
                      onClick={() => deleteMut.mutate()}
                    >
                      {deleteMut.isPending ? 'Deleting…' : 'Delete'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="border border-sidebar-border bg-transparent text-white hover:bg-white/10"
                      onClick={() => setDeleteOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
        </div>
      </AppPageBody>
    </div>
  );
}
