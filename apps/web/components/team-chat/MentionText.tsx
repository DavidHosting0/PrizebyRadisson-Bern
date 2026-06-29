'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';

type MentionUser = { id: string; name: string };

type Props = {
  body: string;
  mentions?: MentionUser[];
  className?: string;
};

/** Render chat message body with @mention highlights when metadata is available. */
export function MentionText({ body, mentions = [], className }: Props) {
  if (mentions.length === 0) {
    return <span className={clsx('whitespace-pre-wrap break-words', className)}>{body}</span>;
  }

  const byName = new Map(mentions.map((m) => [m.name.toLowerCase(), m]));
  const parts: ReactNode[] = [];
  const re = /@([^\s@]+(?:\s+[^\s@]+)*)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    const start = match.index;
    if (start > last) parts.push(body.slice(last, start));

    const mentionText = match[1];
    const hit = byName.get(mentionText.toLowerCase());
    if (hit) {
      parts.push(
        <span key={`${start}-${hit.id}`} className="font-semibold text-action">
          @{mentionText}
        </span>,
      );
    } else {
      parts.push(`@${mentionText}`);
    }
    last = start + match[0].length;
  }

  if (last < body.length) parts.push(body.slice(last));

  return <span className={clsx('whitespace-pre-wrap break-words', className)}>{parts}</span>;
}
