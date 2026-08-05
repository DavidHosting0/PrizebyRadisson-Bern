'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/toast/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { RoleColorPicker } from '@/components/admin/RoleColorPicker';
import { PermissionCategoryList } from '@/components/admin/roles/PermissionCategoryList';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { useOverlayKeyboard } from '@/lib/hooks/useOverlayKeyboard';
import { AppPageChrome, AppPageBody, APP_DARK_CARD, APP_DARK_INPUT } from '@/components/nav/AppPageChrome';
import { AppChromeTools } from '@/components/nav/AppChromeTools';

type RoleSummary = {
  id: string;
  name: string;
  color: string;
  position: number;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  permissions: string[];
};

type RoleMember = {
  id: string;
  name: string;
  email: string;
  titlePrefix: string;
  role: string;
  isActive: boolean;
  avatarUrl: string | null;
};

type RoleDetail = RoleSummary & {
  members: RoleMember[];
};

type PermissionGroup = { id: string; label: string; codes: string[] };

type PermissionCatalog = {
  codes: string[];
  labels: Record<string, string>;
  descriptions: Record<string, string>;
  groups: PermissionGroup[];
};

type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  titlePrefix: string;
  role: string;
  isActive: boolean;
};

type Tab = 'display' | 'permissions' | 'members';

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

export default function AdminRolesPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('display');

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    enabled: me?.role === 'ADMIN',
    queryFn: () => api<RoleSummary[]>('/roles'),
  });

  const { data: detail } = useQuery({
    queryKey: ['role', selectedId],
    enabled: me?.role === 'ADMIN' && !!selectedId,
    queryFn: () => api<RoleDetail>(`/roles/${selectedId}`),
  });

  const { data: catalog } = useQuery({
    queryKey: ['permission-catalog'],
    enabled: me?.role === 'ADMIN',
    queryFn: () => api<PermissionCatalog>('/permissions'),
  });

  // Auto-select the first role on load.
  useEffect(() => {
    if (!selectedId && roles.length > 0) setSelectedId(roles[0].id);
  }, [roles, selectedId]);

  const createMut = useMutation({
    mutationFn: (body: { name: string; color?: string }) =>
      api<RoleDetail>('/roles', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      qc.setQueryData(['role', created.id], created);
      setSelectedId(created.id);
      setTab('display');
      toast.push('Role created', 'success');
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppPageChrome
        title="Roles"
        description="Account type controls which app area a member sees. Roles grant the actual permissions."
        actions={
          <>
            <AppChromeTools />
            <Button
              type="button"
              variant="action"
              className="min-h-[40px]"
              disabled={createMut.isPending}
              onClick={() => {
                const seed = `New role ${roles.length + 1}`;
                createMut.mutate({ name: seed });
              }}
            >
              + Create role
            </Button>
          </>
        }
      />
      <AppPageBody>
        <div className="space-y-6 p-4 md:p-6">
      {isLoading && <p className="text-sm text-sidebar-muted">Loading roles…</p>}

      {!isLoading && (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <RolesList
            roles={roles}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setTab('display');
            }}
          />
          {detail && catalog ? (
            <RoleEditor
              key={detail.id}
              detail={detail}
              catalog={catalog}
              tab={tab}
              onTab={setTab}
              onChanged={() => {
                qc.invalidateQueries({ queryKey: ['roles'] });
                qc.invalidateQueries({ queryKey: ['role', detail.id] });
              }}
              onDeleted={() => {
                qc.invalidateQueries({ queryKey: ['roles'] });
                setSelectedId(null);
              }}
            />
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-card border border-dashed border-sidebar-border bg-white/5 p-10 text-center text-sm text-sidebar-muted">
              {roles.length === 0
                ? 'No roles yet. Create your first role to start grouping permissions.'
                : 'Select a role to edit its permissions and members.'}
            </div>
          )}
        </div>
      )}
        </div>
      </AppPageBody>
    </div>
  );
}

function RolesList({
  roles,
  selectedId,
  onSelect,
}: {
  roles: RoleSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) =>
      api<RoleSummary[]>('/roles/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  function move(id: string, dir: 'up' | 'down') {
    const idx = roles.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= roles.length) return;
    const ids = roles.map((r) => r.id);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    reorderMut.mutate(ids);
  }

  return (
    <aside className={APP_DARK_CARD + ' overflow-hidden p-0'}>
      <header className="flex items-center justify-between border-b border-sidebar-border/60 bg-white/5 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
          Roles — {roles.length}
        </p>
      </header>
      <ul className="max-h-[640px] overflow-y-auto py-1">
        {roles.map((r, idx) => {
          const active = r.id === selectedId;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className={clsx(
                  'group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  active ? 'bg-white/10 text-white' : 'text-sidebar-muted hover:bg-white/5',
                )}
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-sidebar"
                  style={{ backgroundColor: r.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">@{r.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-sidebar-muted">
                    <span className="rounded bg-white/10 px-1.5 py-0.5">{r.memberCount}</span>
                    <span>{r.permissions.length} perms</span>
                    {r.isSystem && <span className="text-sidebar-muted/70">system</span>}
                  </span>
                </span>
                <span className="hidden shrink-0 flex-col gap-0.5 group-hover:flex">
                  <button
                    type="button"
                    aria-label="Move up"
                    onClick={(e) => {
                      e.stopPropagation();
                      move(r.id, 'up');
                    }}
                    disabled={idx === 0}
                    className="rounded px-1 text-xs text-sidebar-muted hover:bg-white/10 hover:text-white disabled:opacity-40"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    onClick={(e) => {
                      e.stopPropagation();
                      move(r.id, 'down');
                    }}
                    disabled={idx === roles.length - 1}
                    className="rounded px-1 text-xs text-sidebar-muted hover:bg-white/10 hover:text-white disabled:opacity-40"
                  >
                    ▼
                  </button>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function RoleEditor({
  detail,
  catalog,
  tab,
  onTab,
  onChanged,
  onDeleted,
}: {
  detail: RoleDetail;
  catalog: PermissionCatalog;
  tab: Tab;
  onTab: (t: Tab) => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  return (
    <section className={APP_DARK_CARD + ' overflow-hidden p-0'}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-sidebar-border/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: detail.color }} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-white">@{detail.name}</h2>
            <p className="truncate text-xs text-sidebar-muted">
              {detail.memberCount} {detail.memberCount === 1 ? 'member' : 'members'} ·{' '}
              {detail.permissions.length} {detail.permissions.length === 1 ? 'permission' : 'permissions'}
              {detail.isSystem && ' · system'}
            </p>
          </div>
        </div>
        <nav className="flex rounded-lg border border-sidebar-border bg-white/5 p-0.5">
          {(['display', 'permissions', 'members'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={clsx(
                'rounded-md px-3 py-1.5 text-xs font-medium capitalize',
                tab === t ? 'bg-white/10 text-white' : 'text-sidebar-muted hover:text-white',
              )}
              onClick={() => onTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'display' && <DisplayTab detail={detail} onChanged={onChanged} onDeleted={onDeleted} />}
      {tab === 'permissions' && <PermissionsTab detail={detail} catalog={catalog} onChanged={onChanged} />}
      {tab === 'members' && <MembersTab detail={detail} onChanged={onChanged} />}
    </section>
  );
}

function DisplayTab({
  detail,
  onChanged,
  onDeleted,
}: {
  detail: RoleDetail;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(detail.name);
  const [color, setColor] = useState(detail.color);
  const [description, setDescription] = useState(detail.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deletePanelRef = useRef<HTMLDivElement>(null);
  useOverlayKeyboard({
    open: confirmDelete,
    onClose: () => setConfirmDelete(false),
    containerRef: deletePanelRef,
  });

  const dirty =
    name.trim() !== detail.name ||
    color.toLowerCase() !== detail.color.toLowerCase() ||
    (description ?? '').trim() !== (detail.description ?? '');

  const updateMut = useMutation({
    mutationFn: () =>
      api<RoleDetail>(`/roles/${detail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          color,
          description: description.trim(),
        }),
      }),
    onSuccess: () => {
      onChanged();
      toast.push('Role updated', 'success');
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  const deleteMut = useMutation({
    mutationFn: () => api<void>(`/roles/${detail.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.push('Role deleted', 'success');
      onDeleted();
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  return (
    <div className="space-y-6 p-5">
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
            Role name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className={clsx(APP_DARK_INPUT, 'mt-1 w-full min-h-[44px]')}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">
            Description (optional)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            rows={2}
            className={clsx(APP_DARK_INPUT, 'mt-1 w-full py-2')}
            placeholder="e.g. Backup supervisor — covers room assignments and inspections."
          />
        </label>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-muted">Role color</p>
        <p className="mt-1 text-xs text-sidebar-muted">
          Members display this color next to their name in chat and lists.
        </p>
        <div className="mt-3">
          <RoleColorPicker value={color} onChange={setColor} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sidebar-border/60 pt-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="action"
            className="min-h-[40px]"
            disabled={!dirty || updateMut.isPending}
            onClick={() => updateMut.mutate()}
          >
            Save changes
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-[40px] border border-sidebar-border bg-transparent text-white hover:bg-white/10"
            disabled={!dirty || updateMut.isPending}
            onClick={() => {
              setName(detail.name);
              setColor(detail.color);
              setDescription(detail.description ?? '');
            }}
          >
            Reset
          </Button>
        </div>
        <Button
          type="button"
          variant="danger"
          className="min-h-[40px]"
          disabled={detail.isSystem || deleteMut.isPending}
          onClick={() => setConfirmDelete(true)}
        >
          Delete role
        </Button>
      </div>

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            ref={deletePanelRef}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-ink">Delete this role?</h3>
            <p className="mt-2 text-sm text-ink-muted">
              <span className="font-medium text-ink">{detail.name}</span> will be removed from all{' '}
              {detail.memberCount} member{detail.memberCount === 1 ? '' : 's'}. They will lose
              permissions granted only through this role.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-[40px]"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                className="min-h-[40px]"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
              >
                Delete role
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PermissionsTab({
  detail,
  catalog,
  onChanged,
}: {
  detail: RoleDetail;
  catalog: PermissionCatalog;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(detail.permissions));
  const [search, setSearch] = useState('');

  useEffect(() => {
    setSelected(new Set(detail.permissions));
  }, [detail.id, detail.permissions]);

  const dirty = useMemo(() => {
    const a = [...selected].sort();
    const b = [...detail.permissions].sort();
    return a.length !== b.length || a.some((v, i) => v !== b[i]);
  }, [selected, detail.permissions]);

  const updateMut = useMutation({
    mutationFn: () =>
      api<RoleDetail>(`/roles/${detail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: [...selected] }),
      }),
    onSuccess: () => {
      onChanged();
      toast.push('Permissions saved', 'success');
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog.groups;
    return catalog.groups
      .map((g) => ({
        ...g,
        codes: g.codes.filter((c) => {
          const t = catalog.labels[c]?.toLowerCase() ?? c.toLowerCase();
          const d = catalog.descriptions[c]?.toLowerCase() ?? '';
          return c.toLowerCase().includes(q) || t.includes(q) || d.includes(q);
        }),
      }))
      .filter((g) => g.codes.length > 0);
  }, [catalog, search]);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-sidebar-border/60 bg-[#1A2332] px-5 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search permissions"
          className={clsx(APP_DARK_INPUT, 'h-9 flex-1 min-w-[180px]')}
        />
        <span className="text-xs text-sidebar-muted">{selected.size} selected</span>
        <Button
          type="button"
          variant="secondary"
          className="min-h-[36px] border border-sidebar-border bg-transparent px-3 text-xs text-white hover:bg-white/10"
          onClick={() => setSelected(new Set(detail.permissions))}
          disabled={!dirty}
        >
          Reset
        </Button>
        <Button
          type="button"
          variant="action"
          className="min-h-[36px] px-3 text-xs"
          disabled={!dirty || updateMut.isPending}
          onClick={() => updateMut.mutate()}
        >
          Save
        </Button>
      </div>
      <div className="max-h-[560px] overflow-y-auto px-5 py-4">
        {filteredGroups.length > 0 ? (
          <PermissionCategoryList
            groups={filteredGroups}
            labels={catalog.labels}
            descriptions={catalog.descriptions}
            selected={selected}
            onToggle={toggle}
          />
        ) : (
          <p className="py-12 text-center text-sm text-sidebar-muted">No matching permissions.</p>
        )}
      </div>
    </div>
  );
}

function MembersTab({ detail, onChanged }: { detail: RoleDetail; onChanged: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState('');

  const { data: directory = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api<DirectoryUser[]>('/users'),
  });

  const memberIds = useMemo(() => new Set(detail.members.map((m) => m.id)), [detail.members]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return directory
      .filter((u) => !memberIds.has(u.id))
      .filter((u) =>
        q
          ? u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.role.toLowerCase().includes(q)
          : true,
      )
      .slice(0, 8);
  }, [directory, memberIds, search]);

  const addMut = useMutation({
    mutationFn: (userId: string) =>
      api<RoleDetail>(`/roles/${detail.id}/members/${userId}`, { method: 'POST' }),
    onSuccess: () => {
      onChanged();
      setSearch('');
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) =>
      api<RoleDetail>(`/roles/${detail.id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => onChanged(),
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 border-b border-sidebar-border/60 bg-[#1A2332] px-5 py-3">
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Add a member by name or email"
            className={clsx(APP_DARK_INPUT, 'h-10 w-full')}
          />
          {search && candidates.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-card border border-sidebar-border bg-sidebar shadow-lift">
              {candidates.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => addMut.mutate(u.id)}
                    disabled={addMut.isPending}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/10"
                  >
                    <Avatar name={u.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {formatUserWithTitlePrefix(u.name, u.titlePrefix)}
                      </p>
                      <p className="truncate text-xs text-sidebar-muted">{u.email}</p>
                    </div>
                    <span className="shrink-0 text-xs text-sidebar-muted">{u.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ul className="max-h-[520px] divide-y divide-sidebar-border/40 overflow-y-auto">
        {detail.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-5 py-3">
            <Avatar name={m.name} url={m.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {formatUserWithTitlePrefix(m.name, m.titlePrefix)}
              </p>
              <p className="truncate text-xs text-sidebar-muted">{m.email}</p>
            </div>
            <span className="hidden text-xs text-sidebar-muted sm:block">{m.role}</span>
            <Button
              type="button"
              variant="ghost"
              className="min-h-[36px] px-3 text-xs text-red-400 hover:bg-white/10"
              disabled={removeMut.isPending}
              onClick={() => removeMut.mutate(m.id)}
            >
              Remove
            </Button>
          </li>
        ))}
        {detail.members.length === 0 && (
          <li className="px-5 py-12 text-center text-sm text-sidebar-muted">
            No members yet — search above to add someone.
          </li>
        )}
      </ul>
    </div>
  );
}
