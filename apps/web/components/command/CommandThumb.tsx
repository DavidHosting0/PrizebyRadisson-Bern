'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { IconBuilding } from '@/components/nav/nav-icons';

const STATUS_RING: Record<string, string> = {
  CLEAN: 'ring-success/60',
  INSPECTED: 'ring-ink-muted/40',
  IN_PROGRESS: 'ring-warning/60',
  DIRTY: 'ring-ink-muted/30',
  OUT_OF_ORDER: 'ring-warning/50',
};

type Props =
  | {
      variant: 'photo';
      src: string | null | undefined;
      alt: string;
      statusRing?: string;
      fallbackIcon?: React.ReactNode;
    }
  | {
      variant: 'initials';
      initials: string;
      tone?: string;
    }
  | {
      variant: 'room';
      roomNumber: string;
      status?: string;
      photoUrl?: string | null;
    }
  | {
      variant: 'icon';
      icon: React.ReactNode;
    };

export function CommandThumb(props: Props) {
  const [imgError, setImgError] = useState(false);

  if (props.variant === 'photo') {
    const showImg = props.src && !imgError;
    return (
      <div
        className={clsx(
          'relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-muted ring-2 ring-inset',
          props.statusRing ?? 'ring-border/60',
        )}
      >
        {showImg ? (
          <img
            src={props.src!}
            alt={props.alt}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-muted">
            {props.fallbackIcon ?? <IconBuilding className="h-5 w-5" />}
          </div>
        )}
      </div>
    );
  }

  if (props.variant === 'initials') {
    return (
      <div
        className={clsx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
          props.tone ?? 'bg-action-muted text-action',
        )}
      >
        {props.initials}
      </div>
    );
  }

  if (props.variant === 'room') {
    const ring = STATUS_RING[props.status ?? ''] ?? 'ring-border/60';
    const showPhoto = props.photoUrl && !imgError;
    if (showPhoto) {
      return (
        <div
          className={clsx(
            'relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-muted ring-2 ring-inset',
            ring,
          )}
        >
          <img
            src={props.photoUrl!}
            alt={`Room ${props.roomNumber}`}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      );
    }
    return (
      <div
        className={clsx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted ring-2 ring-inset',
          ring,
        )}
      >
        <span className="room-num text-xs font-semibold text-ink">{props.roomNumber}</span>
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-muted ring-1 ring-border/80">
      {props.icon}
    </div>
  );
}
