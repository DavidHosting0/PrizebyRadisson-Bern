'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth-context';
import { getHomePath } from '@/lib/permission-routes';

const PRIZEBERN_SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://prizebern.com';

type Props = {
  className?: string;
  /** Compact for mobile bars */
  compact?: boolean;
  /** Set false on login/marketing surfaces without navigation */
  link?: boolean;
};

function shellDashboardFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/(r|s|h|t|a)(?:\/|$)/);
  return match ? `/${match[1]}` : null;
}

export function BrandLogo({ className = '', compact, link = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [siteUrl, setSiteUrl] = useState(PRIZEBERN_SITE_URL);

  useEffect(() => {
    setSiteUrl(window.location.origin);
  }, []);

  const dashboardHref = user ? getHomePath(user) : shellDashboardFromPathname(pathname);
  const isInteractive = link && dashboardHref != null;

  const image = (
    <Image
      src="/PrizeByRadisson.png"
      alt="Prize by Radisson Bern"
      width={240}
      height={56}
      className={clsx(
        'w-auto object-contain object-left',
        compact ? 'h-10 max-w-[220px] sm:h-11' : 'h-11 max-w-[260px] md:h-12',
      )}
      priority
    />
  );

  if (!isInteractive) {
    return (
      <div className={clsx('relative flex shrink-0 items-center', className)}>{image}</div>
    );
  }

  return (
    <a
      href={siteUrl}
      onClick={(e) => {
        if (e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        router.push(dashboardHref);
      }}
      className={clsx(
        'relative flex shrink-0 items-center rounded-lg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-action/40',
        className,
      )}
      title="Dashboard"
    >
      {image}
    </a>
  );
}
