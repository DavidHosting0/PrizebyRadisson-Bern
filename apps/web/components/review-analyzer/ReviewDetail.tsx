'use client';

import type { GuestReviewRow } from '@/lib/review-analyzer-api';
import { RaBadge, sentimentTone, priorityTone } from './RaUi';

export function ReviewDetail({
  review,
  onBack,
  backLabel = 'Back',
}: {
  review: GuestReviewRow;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="space-y-3 text-sm text-white">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium text-sky-300 hover:text-sky-200"
        >
          ← {backLabel}
        </button>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <RaBadge>{review.score.toFixed(1)}/10</RaBadge>
        <RaBadge tone={sentimentTone(review.analysis?.sentiment)}>
          {review.analysis?.sentiment ?? '—'}
        </RaBadge>
        <span className="text-xs text-sidebar-muted">
          {new Date(review.reviewedAt).toLocaleDateString()}
        </span>
      </div>

      <div className="grid gap-1 text-xs text-sidebar-muted sm:grid-cols-2">
        <p>
          <span className="font-semibold text-white/70">Guest:</span>{' '}
          {review.guestName ?? '—'}
          {review.guestCountry ? ` · ${review.guestCountry}` : ''}
        </p>
        <p>
          <span className="font-semibold text-white/70">Stay:</span>{' '}
          {review.travelType ?? '—'}
          {review.roomCategory ? ` · ${review.roomCategory}` : ''}
          {review.language ? ` · ${review.language}` : ''}
        </p>
      </div>

      {review.positiveText ? (
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-400/80">Positive</p>
          <p className="mt-1 whitespace-pre-wrap text-sidebar-muted">{review.positiveText}</p>
        </div>
      ) : null}

      {review.negativeText ? (
        <div>
          <p className="text-xs font-semibold uppercase text-rose-400/80">Negative</p>
          <p className="mt-1 whitespace-pre-wrap text-sidebar-muted">{review.negativeText}</p>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-semibold uppercase text-sidebar-muted">Full text</p>
        <p className="mt-1 whitespace-pre-wrap text-sidebar-muted">{review.fullText}</p>
      </div>

      {review.analysis ? (
        <>
          <div>
            <p className="text-xs font-semibold uppercase text-sidebar-muted">AI summary</p>
            <p className="mt-1">{review.analysis.summaryEn}</p>
          </div>
          {review.analysis.translationEn ? (
            <div>
              <p className="text-xs font-semibold uppercase text-sidebar-muted">Translation (EN)</p>
              <p className="mt-1 whitespace-pre-wrap text-sidebar-muted">
                {review.analysis.translationEn}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-semibold uppercase text-sidebar-muted">Positives</p>
            <ul className="mt-1 list-disc pl-4 text-emerald-300">
              {(review.analysis.positives as Array<{ text: string }>).map((p, i) => (
                <li key={i}>{p.text}</li>
              ))}
              {!review.analysis.positives?.length ? (
                <li className="list-none text-sidebar-muted">—</li>
              ) : null}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-sidebar-muted">Negatives</p>
            <ul className="mt-1 list-disc pl-4 text-rose-300">
              {(review.analysis.negatives as Array<{ text: string }>).map((p, i) => (
                <li key={i}>{p.text}</li>
              ))}
              {!review.analysis.negatives?.length ? (
                <li className="list-none text-sidebar-muted">—</li>
              ) : null}
            </ul>
          </div>
        </>
      ) : (
        <p className="text-sidebar-muted">Not analyzed yet</p>
      )}

      {review.categoryScores?.length ? (
        <div>
          <p className="text-xs font-semibold uppercase text-sidebar-muted">Category scores</p>
          <ul className="mt-1 grid grid-cols-2 gap-1 text-xs text-sidebar-muted">
            {review.categoryScores.map((c) => (
              <li key={c.category} className="flex justify-between gap-2">
                <span>{c.category}</span>
                <span className="tabular-nums text-white">{c.score.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-semibold uppercase text-sidebar-muted">Topics</p>
        <ul className="mt-1 space-y-1">
          {review.mentions.map((m) => (
            <li key={m.id} className="flex flex-col gap-0.5 border-t border-sidebar-border/30 pt-1">
              <div className="flex items-center justify-between gap-2">
                <span>
                  {m.topic.name} · {m.polarity}
                </span>
                {m.priority ? <RaBadge tone={priorityTone(m.priority)}>{m.priority}</RaBadge> : null}
              </div>
              {m.evidence ? (
                <p className="text-xs text-sidebar-muted">“{m.evidence}”</p>
              ) : null}
              {m.cluster ? (
                <p className="text-[11px] text-sidebar-muted">Cluster: {m.cluster.title}</p>
              ) : null}
            </li>
          ))}
          {!review.mentions.length ? (
            <li className="text-xs text-sidebar-muted">No topics</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
