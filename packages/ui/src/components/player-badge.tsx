import type { ReactNode } from 'react';
import { Avatar } from './avatar.js';

export interface PlayerBadgeProps {
  inicial: string;
  nome: string;
  detalhe?: string;
  destaque?: ReactNode;
  tamanho?: 'sm' | 'md';
}

export function PlayerBadge({
  inicial,
  nome,
  detalhe,
  destaque,
  tamanho = 'md',
}: PlayerBadgeProps) {
  return (
    <div className="flex items-center gap-3 border border-border bg-panel px-3 py-2">
      <Avatar inicial={inicial} tamanho={tamanho === 'sm' ? 'sm' : 'md'} />
      <div className="flex-1">
        <p className="text-sm">{nome}</p>
        {detalhe && <p className="text-xs text-text-tertiary">{detalhe}</p>}
      </div>
      {destaque}
    </div>
  );
}
