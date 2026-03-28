import Image from 'next/image';

type Props = {
  className?: string;
  /** Compact for mobile bars */
  compact?: boolean;
};

export function BrandLogo({ className = '', compact }: Props) {
  const h = compact ? 28 : 36;
  return (
    <div className={`relative flex items-center ${className}`} style={{ height: h }}>
      <Image
        src="/PrizeByRadisson.png"
        alt="Prize by Radisson Bern"
        width={200}
        height={48}
        className="h-7 w-auto max-w-[200px] object-contain object-left md:h-9"
        priority
      />
    </div>
  );
}
