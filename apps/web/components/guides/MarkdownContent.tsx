'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import type { Components } from 'react-markdown';

const markdownClass =
  'markdown-content text-[15px] leading-relaxed text-ink [&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1:first-child]:mt-0 [&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-medium [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 [&_a]:font-medium [&_a]:text-action [&_a]:underline [&_blockquote]:mb-4 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-ink-muted [&_code]:rounded [&_code]:bg-surface-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-muted [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-surface-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm [&_hr]:my-6 [&_hr]:border-border [&_strong]:font-semibold';

const markdownDarkClass =
  'markdown-content text-[15px] leading-relaxed text-slate-100 [&_h1]:mb-4 [&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-white [&_h1:first-child]:mt-0 [&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-medium [&_h3]:text-white [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 [&_a]:font-medium [&_a]:text-action [&_a]:underline [&_blockquote]:mb-4 [&_blockquote]:border-l-4 [&_blockquote]:border-sidebar-border [&_blockquote]:pl-4 [&_blockquote]:text-sidebar-muted [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/25 [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-sidebar-border [&_th]:bg-white/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold [&_th]:text-white [&_td]:border [&_td]:border-sidebar-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm [&_hr]:my-6 [&_hr]:border-sidebar-border [&_strong]:font-semibold [&_strong]:text-white';

function headingId(children: React.ReactNode): string {
  const text = String(children)
    .replace(/[^\w\s-]/g, '')
    .trim();
  return slugifyHeading(text);
}

const markdownComponents: Components = {
  h2: ({ children }) => (
    <h2 id={headingId(children)} className="scroll-mt-6">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={headingId(children)} className="scroll-mt-6">
      {children}
    </h3>
  ),
};

export function MarkdownContent({
  content,
  className,
  dark,
}: {
  content: string;
  className?: string;
  /** Use white/sidebar-muted tokens for rendering on the dark app background. */
  dark?: boolean;
}) {
  return (
    <div className={clsx(dark ? markdownDarkClass : markdownClass, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export type TocEntry = { id: string; text: string; level: 2 | 3 };

export function extractToc(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      const text = h2[1].trim();
      entries.push({ id: slugifyHeading(text), text, level: 2 });
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      const text = h3[1].trim();
      entries.push({ id: slugifyHeading(text), text, level: 3 });
    }
  }
  return entries;
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
