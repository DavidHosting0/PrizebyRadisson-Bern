import clsx from 'clsx';

const LOGO_URL =
  typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('PrizeByRadisson.png')
    : '/PrizeByRadisson.png';

type Props = {
  className?: string;
  /** Smaller for panel header */
  compact?: boolean;
  /** White logo on dark sidebar chrome (same as web AppSidebar) */
  onDark?: boolean;
};

export function BrandLogo({ className = '', compact, onDark }: Props) {
  return (
    <div className={clsx('relative flex shrink-0 items-center', className)}>
      <img
        src={LOGO_URL}
        alt="Prize by Radisson Bern"
        className={clsx(
          'w-auto object-contain object-left',
          compact ? 'h-7 max-w-[150px]' : 'h-8 max-w-[170px]',
          onDark && 'brightness-0 invert',
        )}
      />
    </div>
  );
}

export function brandLogoUrl(): string {
  return LOGO_URL;
}
