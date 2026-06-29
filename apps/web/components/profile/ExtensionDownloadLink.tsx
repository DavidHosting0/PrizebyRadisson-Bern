'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { extensionDownloadUrl } from '@/lib/extension-download';

type Props = {
  className?: string;
};

export function ExtensionDownloadLink({ className = '' }: Props) {
  const t = useTranslations('profile');

  return (
    <div className={className}>
      <a
        href={extensionDownloadUrl()}
        download="prize-panel-extension.zip"
        className="inline-flex items-center gap-2 text-sm font-medium text-action transition hover:text-action/80"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t('downloadExtension')}
      </a>
      <p className="mt-1 text-xs text-ink-muted">
        {t('downloadExtensionHint')}{' '}
        <Link href="/extension-install" className="font-medium text-ink underline underline-offset-2">
          {t('installInstructions')}
        </Link>
      </p>
    </div>
  );
}
