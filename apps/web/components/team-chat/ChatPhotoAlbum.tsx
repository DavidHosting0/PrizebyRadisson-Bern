'use client';

import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

type LightboxProps = {
  urls: string[];
  index: number;
  alt: string;
  closeLabel: string;
  prevLabel: string;
  nextLabel: string;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

export function ChatPhotoLightbox({
  urls,
  index,
  alt,
  closeLabel,
  prevLabel,
  nextLabel,
  onClose,
  onIndexChange,
}: LightboxProps) {
  const safeIndex = Math.max(0, Math.min(index, urls.length - 1));
  const url = urls[safeIndex];
  const multi = urls.length > 1;

  const go = useCallback(
    (delta: number) => {
      if (!multi) return;
      const next = (safeIndex + delta + urls.length) % urls.length;
      onIndexChange(next);
    },
    [multi, onIndexChange, safeIndex, urls.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  if (typeof document === 'undefined' || !url) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/92 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-between px-3 py-3 sm:px-5">
        <p className="text-sm font-medium text-white/80 tabular-nums">
          {multi ? `${safeIndex + 1} / ${urls.length}` : '\u00a0'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label={closeLabel}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6 sm:px-10"
        onClick={(e) => e.stopPropagation()}
      >
        {multi && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-4"
            aria-label={prevLabel}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />

        {multi && (
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-4"
            aria-label={nextLabel}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {multi && (
        <div className="flex shrink-0 justify-center gap-1.5 overflow-x-auto px-4 pb-4">
          {urls.map((thumb, i) => (
            <button
              key={`${thumb}-${i}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onIndexChange(i);
              }}
              className={clsx(
                'h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition',
                i === safeIndex ? 'ring-action' : 'ring-transparent opacity-60 hover:opacity-100',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

type GalleryProps = {
  urls: string[];
  alt: string;
  hasText: boolean;
  moreLabel: (n: number) => string;
  onOpen: (index: number) => void;
};

/** WhatsApp-style tile grid: up to 4 tiles, last shows +N when more remain. */
export function ChatPhotoAlbum({ urls, alt, hasText, moreLabel, onOpen }: GalleryProps) {
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const visible = urls.filter((_, i) => !failed[i]);
  if (visible.length === 0) return null;

  const show = visible.slice(0, 4);
  const overflow = Math.max(0, visible.length - 4);

  const gridClass =
    show.length === 1
      ? 'grid-cols-1'
      : show.length === 3
        ? 'grid-cols-2 grid-rows-2'
        : 'grid-cols-2';

  return (
    <div
      className={clsx(
        'grid gap-0.5 overflow-hidden rounded-xl',
        gridClass,
        hasText ? 'mb-2' : '',
        show.length === 1 ? 'max-w-xs' : 'w-full max-w-sm',
      )}
    >
      {show.map((url, i) => {
        const isLast = i === show.length - 1 && overflow > 0;
        const cell =
          show.length === 1
            ? 'min-h-[160px] max-h-72'
            : show.length === 3 && i === 0
              ? 'row-span-2 min-h-[220px]'
              : 'aspect-square min-h-[108px]';
        return (
          <button
            key={`${url}-${i}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const originalIndex = urls.indexOf(url);
              onOpen(originalIndex >= 0 ? originalIndex : i);
            }}
            className={clsx(
              'relative overflow-hidden bg-white/5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-action',
              cell,
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={alt}
              loading="lazy"
              decoding="async"
              onError={() => setFailed((prev) => ({ ...prev, [urls.indexOf(url)]: true }))}
              className="h-full w-full object-cover"
            />
            {isLast && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold text-white">
                {moreLabel(overflow)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
