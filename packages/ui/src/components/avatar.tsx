export interface AvatarProps {
  inicial: string;
  tamanho?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TAMANHOS = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-base',
  lg: 'h-20 w-20 text-3xl',
} as const;

export function Avatar({ inicial, tamanho = 'md', className }: AvatarProps) {
  return (
    <span
      className={[
        'grid place-items-center rounded-full bg-[#1C2027] font-display leading-none',
        TAMANHOS[tamanho],
        className ?? '',
      ].join(' ')}
    >
      {inicial}
    </span>
  );
}
