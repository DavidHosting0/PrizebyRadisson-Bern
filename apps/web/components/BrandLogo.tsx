import Image from 'next/image';
import clsx from 'clsx';

type Props = {
  className?: string;
  /** Compact for mobile bars */
  compact?: boolean;
};

export function BrandLogo({ className = '', compact }: Props) {
  return (
    <div className={clsx('relative flex shrink-0 items-center', className)}>
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
    </div>
  );
}
