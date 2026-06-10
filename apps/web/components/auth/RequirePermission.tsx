'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  getFirstAllowedPath,
  getHomePath,
  hasPermission,
  type NavItem,
  type PermissionCode,
} from '@/lib/permission-routes';

type Props = {
  permission?: PermissionCode;
  permissions?: PermissionCode[];
  /** Shell nav used to pick a fallback when access is denied. */
  shellNav?: NavItem[];
  children: ReactNode;
};

export function RequirePermission({ permission, permissions, shellNav, children }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();

  const required = permission ? [permission] : (permissions ?? []);
  const allowed =
    !user || user.role === 'ADMIN' || required.length === 0
      ? true
      : required.some((code) => hasPermission(user, code));

  useEffect(() => {
    if (loading || !user) return;
    if (user.role === 'ADMIN') return;
    if (required.length === 0) return;
    if (allowed) return;

    const fallback = shellNav
      ? getFirstAllowedPath(user, shellNav)
      : getHomePath(user);
    if (fallback && fallback !== path) {
      router.replace(fallback);
    } else {
      router.replace('/login');
    }
  }, [loading, user, allowed, required.length, shellNav, path, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
