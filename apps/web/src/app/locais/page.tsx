'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  MODALIDADE_LABEL,
  TIPO_LOCAL_LABEL,
  SUPERFICIE_LABEL,
  type LocalDTO,
  type ListarLocaisResponse,
} from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function LocaisPage() {
  const { estado } = useAuth();
  const [locais, setLocais] = useState<LocalDTO[] | null>(null);
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState('');
  const [cidade, setCidade] = useState('');
  const [bairro, setBairro] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setErro(null);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (busca.trim()) params.set('busca', busca.trim());
        if (uf.trim().length === 2) params.set('uf', uf.trim().toUpperCase());
        if (cidade.trim()) params.set('cidade', cidade.trim());
        if (bairro.trim()) params.set('bairro', bairro.trim());
        const qs = params.toString();
        const resp = await api.get<ListarLocaisResponse>(`/locais${qs ? `?${qs}` : ''}`);
        if (!cancelado) setLocais(resp.itens);
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : 'Erro ao listar');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [busca, uf, cidade, bairro]);

  return (
    <main className="mx-auto max-w-container px-16 py-12">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-5xl uppercase leading-none">Locais</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Arenas, campos e quadras cadastrados pela comunidade.
          </p>
        </div>
        {estado.status === 'autenticado' && (
          <Link href="/locais/novo">
            <Botao>Cadastrar local</Botao>
          </Link>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)_minmax(0,1fr)]">
        <input
          type="search"
          placeholder="Buscar por nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-11 border border-border-strong bg-panel px-4 text-sm outline-none placeholder:text-text-tertiary focus:border-accent"
        />
        <input
          type="text"
          placeholder="UF"
          maxLength={2}
          value={uf}
          onChange={(e) => setUf(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          className="h-11 border border-border-strong bg-panel px-4 text-sm uppercase outline-none placeholder:text-text-tertiary focus:border-accent"
        />
        <input
          type="text"
          placeholder="Cidade"
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
          className="h-11 border border-border-strong bg-panel px-4 text-sm outline-none placeholder:text-text-tertiary focus:border-accent"
        />
        <input
          type="text"
          placeholder="Bairro"
          value={bairro}
          onChange={(e) => setBairro(e.target.value)}
          className="h-11 border border-border-strong bg-panel px-4 text-sm outline-none placeholder:text-text-tertiary focus:border-accent"
        />
      </div>

      {erro && <p className="mt-6 text-sm text-coral">{erro}</p>}

      <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {locais === null && (
          <li className="col-span-full text-sm text-text-tertiary">Carregando…</li>
        )}
        {locais?.length === 0 && (
          <li className="col-span-full text-sm text-text-tertiary">
            Nenhum local encontrado.
          </li>
        )}
        {locais?.map((l) => <CardLocal key={l.id} local={l} />)}
      </ul>
    </main>
  );
}

function CardLocal({ local }: { local: LocalDTO }) {
  const superficies = useMemo(
    () => local.superficies.map((s) => SUPERFICIE_LABEL[s]).join(' · '),
    [local.superficies],
  );

  return (
    <li className="border border-border bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            {TIPO_LOCAL_LABEL[local.tipo]}
          </p>
          <h2 className="mt-1 font-display text-xl uppercase leading-tight">{local.nome}</h2>
        </div>
        {local.verificado && (
          <span className="border border-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
            Verificado
          </span>
        )}
      </div>
      <p className="mt-3 text-sm text-text-secondary">
        {local.bairro ? `${local.bairro}, ` : ''}
        {local.cidadeNome}/{local.cidadeUf}
      </p>
      {superficies && (
        <p className="mt-2 text-xs text-text-tertiary">{superficies}</p>
      )}
      {local.modalidadesSuportadas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {local.modalidadesSuportadas.map((m) => (
            <span
              key={m}
              className="border border-border-strong bg-panel-2 px-2 py-0.5 text-[11px] font-semibold text-text-secondary"
            >
              {MODALIDADE_LABEL[m]}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
