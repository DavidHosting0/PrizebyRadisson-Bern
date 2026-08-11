import type { SupportedLocale } from '@housekeeping/shared';

/** Inline SVG flags — emoji regional indicators often fail on Windows Chromium. */
export function LocaleFlag({
  locale,
  className,
}: {
  locale: SupportedLocale;
  className?: string;
}) {
  const common = {
    viewBox: '0 0 24 16',
    className,
    role: 'img' as const,
    'aria-hidden': true as const,
  };

  switch (locale) {
    case 'de':
      return (
        <svg {...common}>
          <title>Germany</title>
          <rect width="24" height="16" fill="#000" rx="1.5" />
          <rect y="5.33" width="24" height="5.34" fill="#D00" />
          <rect y="10.67" width="24" height="5.33" fill="#FFCE00" />
        </svg>
      );
    case 'en':
      return (
        <svg {...common}>
          <title>United Kingdom</title>
          <rect width="24" height="16" fill="#012169" rx="1.5" />
          <path d="M0 0 L24 16 M24 0 L0 16" stroke="#fff" strokeWidth="2.6" />
          <path d="M0 0 L24 16 M24 0 L0 16" stroke="#C8102E" strokeWidth="1.4" />
          <path d="M12 0 V16 M0 8 H24" stroke="#fff" strokeWidth="4.2" />
          <path d="M12 0 V16 M0 8 H24" stroke="#C8102E" strokeWidth="2.4" />
        </svg>
      );
    case 'pt':
      return (
        <svg {...common}>
          <title>Portugal</title>
          <rect width="24" height="16" fill="#FF0000" rx="1.5" />
          <rect width="9.5" height="16" fill="#006600" />
          <circle cx="9.5" cy="8" r="3.1" fill="#FFCC00" />
          <circle cx="9.5" cy="8" r="2.2" fill="#FF0000" />
          <circle cx="9.5" cy="8" r="1.1" fill="#FFCC00" />
        </svg>
      );
    case 'es':
      return (
        <svg {...common}>
          <title>Spain</title>
          <rect width="24" height="16" fill="#AA151B" rx="1.5" />
          <rect y="4" width="24" height="8" fill="#F1BF00" />
        </svg>
      );
    case 'tr':
      return (
        <svg {...common}>
          <title>Turkey</title>
          <rect width="24" height="16" fill="#E30A17" rx="1.5" />
          <circle cx="9" cy="8" r="3.5" fill="#fff" />
          <circle cx="10.2" cy="8" r="2.8" fill="#E30A17" />
          <polygon
            fill="#fff"
            points="14.2,8 15.35,7.55 14.7,8.55 14.75,7.25 15.7,7.9 14.45,7.95 15.05,6.95"
          />
        </svg>
      );
    case 'uk':
      return (
        <svg {...common}>
          <title>Ukraine</title>
          <rect width="24" height="16" fill="#0057B7" rx="1.5" />
          <rect y="8" width="24" height="8" fill="#FFD700" />
        </svg>
      );
    default:
      return null;
  }
}
