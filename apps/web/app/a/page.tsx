'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/toast/ToastProvider';
import {
  USER_TITLE_PREFIX_OPTIONS,
  accountTypeForTitlePrefix,
  userTitlePrefixLabel,
} from '@/lib/userTitlePrefix';

type CustomRole = { id: string; name: string; color: string; position: number };

type UserRow = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  titlePrefix: string;
  isActive: boolean;
  createdAt: string;
  permissionGrants?: { permission: string }[];
  roles?: CustomRole[];
};

type PermissionCatalog = {
  codes: string[];
  labels: Record<string, string>;
  descriptions?: Record<string, string>;
  groups?: { id: string; label: string; codes: string[] }[];
};

/** Compact account-type label for the user-card line. */
function accountTypeLabel(r: string) {
  switch (r) {
    case 'HOUSEKEEPER':
      return 'Housekeeper account';
    case 'SUPERVISOR':
      return 'Supervisor account';
    case 'RECEPTION':
      return 'Reception account';
    case 'TECHNICIAN':
      return 'Technician account';
    case 'ADMIN':
      return 'Admin account';
    default:
      return r;
  }
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

export default function AdminUserManagementPage() {
  const { user: me, refreshMe } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    enabled: me?.role === 'ADMIN',
    queryFn: () => api<UserRow[]>('/users'),
  });

  const { data: permCatalog } = useQuery({
    queryKey: ['permission-catalog'],
    enabled: me?.role === 'ADMIN' && (!!createOpen || !!editUser),
    queryFn: () => api<PermissionCatalog>('/permissions'),
  });

  const { data: rolesCatalog = [] } = useQuery({
    queryKey: ['roles'],
    enabled: me?.role === 'ADMIN',
    queryFn: () => api<CustomRole[]>('/roles'),
  });

  const createMut = useMutation({
    mutationFn: (body: {
      email: string;
      password: string;
      name: string;
      phone?: string;
      role: string;
      titlePrefix: string;
      permissionGrants?: string[];
      roleIds?: string[];
    }) => api<UserRow>('/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      setCreateOpen(false);
      toast.push('User created', 'success');
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        name?: string;
        phone?: string | null;
        role?: string;
        titlePrefix?: string;
        isActive?: boolean;
        password?: string;
        permissionGrants?: string[];
        roleIds?: string[];
      };
    }) => api<UserRow>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      setEditUser(null);
      toast.push('User updated', 'success');
      if (vars.id === me?.id) void refreshMe();
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api<void>(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setDeleteTarget(null);
      toast.push('User deleted', 'success');
    },
    onError: (e: Error) => toast.push(parseApiError(e.message), 'warning'),
  });

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">User management</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Create accounts, reset passwords, disable access, or remove users when the database allows it.
          </p>
        </div>
        <Button type="button" variant="action" className="min-h-[44px]" onClick={() => setCreateOpen(true)}>
          + Add user
        </Button>
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading users…</p>}

      <ul className="space-y-3">
        {users.map((u) => (
          <li key={u.id}>
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{u.name}</p>
                <p className="text-sm text-ink-muted">{u.email}</p>
                {u.phone && <p className="text-sm text-ink-muted">{u.phone}</p>}
                <p className="mt-1 text-xs text-ink-muted">
                  <span className="font-medium text-ink/90">{userTitlePrefixLabel(u.titlePrefix)}</span>
                  <span className="mx-1.5 text-ink-muted/60">·</span>
                  {accountTypeLabel(u.role)}
                  {!u.isActive && (
                    <span className="ml-2 font-medium text-danger">· Disabled</span>
                  )}
                  {u.id === me?.id && (
                    <span className="ml-2 font-medium text-ink-muted">· You</span>
                  )}
                </p>
                {u.roles && u.roles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {u.roles.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted/60 px-2 py-0.5 text-[11px] font-medium text-ink"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                        {r.name}
                      </span>
                    ))}
                  </div>
                )}
                {u.permissionGrants && u.permissionGrants.length > 0 && (
                  <p className="mt-1 text-[11px] text-ink-muted">
                    <span className="font-medium text-ink/80">Extra permissions:</span>{' '}
                    {u.permissionGrants.map((g) => g.permission).join(', ')}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" className="min-h-[40px] px-3 text-sm" onClick={() => setEditUser(u)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="min-h-[40px] px-3 text-sm"
                  disabled={u.id === me?.id}
                  onClick={() => setDeleteTarget(u)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {createOpen && (
        <UserUpsertModal
          mode="create"
          catalog={permCatalog}
          rolesCatalog={rolesCatalog}
          onClose={() => setCreateOpen(false)}
          onSubmitCreate={(values) => createMut.mutate(values)}
          submitting={createMut.isPending}
          onValidationError={(msg) => toast.push(msg, 'warning')}
        />
      )}

      {editUser && (
        <UserUpsertModal
          mode="edit"
          catalog={permCatalog}
          rolesCatalog={rolesCatalog}
          initial={editUser}
          onClose={() => setEditUser(null)}
          onSubmitEdit={(body) => updateMut.mutate({ id: editUser.id, body })}
          submitting={updateMut.isPending}
          onValidationError={(msg) => toast.push(msg, 'warning')}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          submitting={deleteMut.isPending}
        />
      )}
    </div>
  );
}

function UserUpsertModal({
  mode,
  catalog,
  rolesCatalog,
  initial,
  onClose,
  onSubmitCreate,
  onSubmitEdit,
  submitting,
  onValidationError,
}: {
  mode: 'create' | 'edit';
  catalog?: PermissionCatalog;
  rolesCatalog?: CustomRole[];
  initial?: UserRow;
  onClose: () => void;
  onSubmitCreate?: (v: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    role: string;
    titlePrefix: string;
    permissionGrants?: string[];
    roleIds?: string[];
  }) => void;
  onSubmitEdit?: (v: {
    name: string;
    phone: string | null;
    role: string;
    titlePrefix: string;
    isActive: boolean;
    password?: string;
    permissionGrants: string[];
    roleIds: string[];
  }) => void;
  submitting: boolean;
  onValidationError?: (msg: string) => void;
}) {
  const [email, setEmail] = useState(initial?.email ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [titlePrefix, setTitlePrefix] = useState<string>(initial?.titlePrefix ?? 'CLEANER');
  // Account type (drives which app shell the user opens after login) is
  // derived from the chosen title prefix; admins don't pick it explicitly.
  const role = accountTypeForTitlePrefix(titlePrefix);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [extraGrantCodes, setExtraGrantCodes] = useState<string[]>(() =>
    initial?.permissionGrants?.map((g) => g.permission) ?? [],
  );
  const [roleIds, setRoleIds] = useState<string[]>(() => initial?.roles?.map((r) => r.id) ?? []);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && initial) {
      setExtraGrantCodes(initial.permissionGrants?.map((g) => g.permission) ?? []);
      setRoleIds(initial.roles?.map((r) => r.id) ?? []);
    }
    if (mode === 'create') {
      setExtraGrantCodes([]);
      setRoleIds([]);
    }
  }, [mode, initial?.id, initial?.permissionGrants, initial?.roles]);


  function toggleGrant(code: string) {
    setExtraGrantCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function toggleRole(id: string) {
    setRoleIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'create') {
      if (!onSubmitCreate) return;
      if (!email.trim() || !password || !name.trim()) return;
      onSubmitCreate({
        email: email.trim(),
        password,
        name: name.trim(),
        phone: phone.trim() || undefined,
        role,
        titlePrefix,
        permissionGrants: extraGrantCodes.length ? extraGrantCodes : undefined,
        roleIds: roleIds.length ? roleIds : undefined,
      });
      return;
    }
    if (!onSubmitEdit || !initial) return;
    const pw = password.trim();
    if (pw && pw.length < 8) {
      onValidationError?.('New password must be at least 8 characters, or leave blank.');
      return;
    }
    const body: {
      name: string;
      phone: string | null;
      role: string;
      titlePrefix: string;
      isActive: boolean;
      password?: string;
      permissionGrants: string[];
      roleIds: string[];
    } = {
      name: name.trim(),
      phone: phone.trim() ? phone.trim() : null,
      role,
      titlePrefix,
      isActive,
      permissionGrants: extraGrantCodes,
      roleIds,
    };
    if (pw.length >= 8) {
      body.password = pw;
    }
    onSubmitEdit(body);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-ink">{mode === 'create' ? 'New user' : 'Edit user'}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {mode === 'create'
            ? 'Set an initial password (min. 8 characters). They sign in with email and password.'
            : 'Leave password blank to keep the current one. Disabled users cannot sign in.'}
        </p>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          {mode === 'create' && (
            <label className="block text-sm">
              <span className="font-medium text-ink">Email</span>
              <input
                className="mt-1 w-full min-h-[44px] rounded-btn border border-border bg-surface px-3 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          )}
          {mode === 'edit' && initial && (
            <div className="rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-sm text-ink-muted">
              <span className="font-medium text-ink">Email</span>
              <p className="mt-0.5 text-ink">{initial.email}</p>
              <p className="mt-1 text-xs">Email cannot be changed here.</p>
            </div>
          )}
          <label className="block text-sm">
            <span className="font-medium text-ink">Full name</span>
            <input
              className="mt-1 w-full min-h-[44px] rounded-btn border border-border bg-surface px-3 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Phone (optional)</span>
            <input
              className="mt-1 w-full min-h-[44px] rounded-btn border border-border bg-surface px-3 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Title prefix</span>
            <p className="mt-0.5 text-xs text-ink-muted">
              Drives where the user lands after login (Cleaner → housekeeper app, Reception → reception app, etc.) and is shown in chat, headers, and lists.
              Permissions on top of this are handled with Roles.
            </p>
            <select
              className="mt-1 w-full min-h-[44px] cursor-pointer rounded-btn border border-border bg-surface px-3 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15"
              value={titlePrefix}
              onChange={(e) => setTitlePrefix(e.target.value)}
            >
              {USER_TITLE_PREFIX_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {mode === 'edit' && (
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border text-action focus:ring-action/30"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="font-medium text-ink">Account active (can sign in)</span>
            </label>
          )}
          <label className="block text-sm">
            <span className="font-medium text-ink">{mode === 'create' ? 'Password' : 'New password (optional)'}</span>
            <input
              className="mt-1 w-full min-h-[44px] rounded-btn border border-border bg-surface px-3 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15"
              type="password"
              autoComplete={mode === 'create' ? 'new-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode === 'create'}
              minLength={mode === 'create' ? 8 : undefined}
              placeholder={mode === 'edit' ? 'Leave blank to keep current' : ''}
            />
            {mode === 'create' && <p className="mt-1 text-xs text-ink-muted">At least 8 characters.</p>}
            {mode === 'edit' && <p className="mt-1 text-xs text-ink-muted">Only filled if you want to reset their password.</p>}
          </label>
          <div className="rounded-lg border border-border bg-surface-muted/40 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">Roles</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Group permissions into reusable bundles. Manage them on the{' '}
                  <a href="/a/roles" className="underline">Roles page</a>.
                </p>
              </div>
              <span className="text-xs text-ink-muted">
                {roleIds.length} of {rolesCatalog?.length ?? 0}
              </span>
            </div>
            {!rolesCatalog?.length && (
              <p className="mt-3 text-xs text-ink-muted">No roles created yet.</p>
            )}
            {!!rolesCatalog?.length && (
              <div className="mt-3 flex flex-wrap gap-2">
                {[...rolesCatalog]
                  .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name))
                  .map((r) => {
                    const active = roleIds.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRole(r.id)}
                        className={
                          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ' +
                          (active
                            ? 'border-ink bg-ink text-white shadow-card'
                            : 'border-border bg-surface text-ink hover:bg-surface-muted')
                        }
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: r.color }}
                        />
                        {r.name}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          <details
            className="rounded-lg border border-border bg-surface-muted/40 px-3 py-3"
            open={showAdvanced}
            onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer select-none text-sm font-medium text-ink">
              Advanced — individual permission overrides
            </summary>
            <p className="mt-2 text-xs text-ink-muted">
              Added on top of account-type defaults and the user&apos;s assigned roles. Prefer roles when you can.
            </p>
            {!catalog?.codes?.length && (
              <p className="mt-2 text-xs text-ink-muted">Loading permission list…</p>
            )}
            {!!catalog?.codes?.length && (
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm">
                {catalog.codes.map((code) => (
                  <li key={code} className="flex gap-2">
                    <input
                      type="checkbox"
                      id={`perm-${mode}-${code}`}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-action focus:ring-action/30"
                      checked={extraGrantCodes.includes(code)}
                      onChange={() => toggleGrant(code)}
                    />
                    <label htmlFor={`perm-${mode}-${code}`} className="cursor-pointer text-ink">
                      <span className="font-mono text-xs text-ink-muted">{code}</span>
                      {catalog.labels[code] && (
                        <span className="mt-0.5 block text-sm text-ink">{catalog.labels[code]}</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" className="min-h-[44px]" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="action" className="min-h-[44px]" disabled={submitting}>
              {mode === 'create' ? 'Create user' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  user,
  onClose,
  onConfirm,
  submitting,
}: {
  user: UserRow;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-lift" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-ink">Delete user?</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Remove <span className="font-medium text-ink">{user.name}</span> ({user.email}) permanently. If they have
          requests, sessions, or other records, deletion will be blocked — disable the account instead.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" className="min-h-[44px]" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant="danger" className="min-h-[44px]" onClick={onConfirm} disabled={submitting}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
