'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MODALIDADE_LABEL,
  type ConvitePublicoDadosDTO,
  type EntrarConvitePublicoResponse,
  type Modalidade,
} from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { api, ApiError } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

const DIA_LABEL: Record<string, string> = {
  domingo: 'Domingo',
  segunda: 'Segunda',
  terca: 'Terça',
  quarta: 'Quarta',
  quinta: 'Quinta',
  sexta: 'Sexta',
  sabado: 'Sábado',
};

type EstadoEntrada =
  | { tipo: 'idle' }
  | { tipo: 'enviando' }
  | { tipo: 'sucesso'; resultado: EntrarConvitePublicoResponse }
  | { tipo: 'erro'; mensagem: string };

export default function ConvitePublicoPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { estado: auth } = useAuth();

  const [dados, setDados] = useState<ConvitePublicoDadosDTO | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [entrada, setEntrada] = useState<EstadoEntrada>({ tipo: 'idle' });
  const autoEntrouRef = useRef(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const d = await api.get<ConvitePublicoDadosDTO>(`/convite-publico/${token}`);
        if (!cancelado) setDados(d);
      } catch (e) {
        if (cancelado) return;
        if (e instanceof ApiError && e.status === 404) setNaoEncontrado(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [token]);

  const entrar = useCallback(async () => {
    if (!dados) return;
    setEntrada({ tipo: 'enviando' });
    try {
      const r = await api.post<EntrarConvitePublicoResponse>(
        `/convite-publico/${token}/entrar`,
        undefined,
        { auth: true },
      );
      setEntrada({ tipo: 'sucesso', resultado: r });
      if (r.estado === 'membro' || r.estado === 'ja_membro') {
        setTimeout(() => router.push(`/peladas/${r.peladaSlug}`), 900);
      }
    } catch (e) {
      setEntrada({ tipo: 'erro', mensagem: isApiError(e) ? e.mensagem : 'Erro ao entrar' });
    }
  }, [dados, token, router]);

  // Se o usuário voltou de /entrar ou /cadastrar autenticado, entra automaticamente.
  useEffect(() => {
    if (
      auth.status === 'autenticado' &&
      dados &&
      entrada.tipo === 'idle' &&
      !autoEntrouRef.current &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('auto') === '1'
    ) {
      autoEntrouRef.current = true;
      entrar();
    }
  }, [auth.status, dados, entrada.tipo, entrar]);

  if (naoEncontrado) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 py-24 text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
          Convite
        </p>
        <h1 className="font-display text-5xl uppercase leading-none">Link inválido</h1>
        <p className="text-sm text-text-secondary">
          Esse convite não existe ou foi revogado pelo dono da pelada.
        </p>
        <Link
          href="/peladas"
          className="mt-4 text-xs font-bold uppercase tracking-wider text-accent hover:underline"
        >
          Ver peladas públicas →
        </Link>
      </main>
    );
  }

  if (!dados) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 text-center text-text-tertiary">
        Carregando convite…
      </main>
    );
  }

  return (
    <main className="relative overflow-hidden">
      {/* Fundo dramático — glow + trama diagonal */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(199,242,62,0.22),transparent_75%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06] [background-image:repeating-linear-gradient(45deg,#F4F5F6_0_1px,transparent_1px_14px)]"
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16 md:py-24">
        {/* Selo */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 border border-accent bg-accent/10 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-accent">
            <span className="h-1.5 w-1.5 animate-pulse bg-accent" />
            Você foi convidado
          </span>
        </div>

        {/* Hero */}
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-text-secondary">
            {dados.criadoPor.nome} convidou você para
          </p>
          <h1 className="mt-3 font-display text-6xl uppercase leading-[0.9] md:text-7xl">
            {dados.pelada.nome}
          </h1>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-widest text-accent">
            {MODALIDADE_LABEL[dados.pelada.modalidade as Modalidade] ?? dados.pelada.modalidade}
          </p>
          {dados.pelada.descricao && (
            <p className="mx-auto mt-5 max-w-md text-sm text-text-secondary">
              {dados.pelada.descricao}
            </p>
          )}
        </div>

        {/* Grid de dados */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Tile rotulo="Quando">
            <p className="text-text">
              {DIA_LABEL[dados.pelada.diaSemana] ?? dados.pelada.diaSemana}
            </p>
            <p className="text-text-secondary">{dados.pelada.horario}</p>
          </Tile>
          <Tile rotulo="Onde">
            <p className="text-text">{dados.local.nome}</p>
            <p className="text-text-secondary">
              {dados.local.bairro ? `${dados.local.bairro}, ` : ''}
              {dados.local.cidadeNome}/{dados.local.cidadeUf}
            </p>
          </Tile>
          <Tile rotulo="Formato" acento="dourado">
            <p className="text-text">{dados.pelada.totalJogadores} jogadores</p>
            <p className="text-text-secondary">por partida</p>
          </Tile>
        </section>

        {/* Membros */}
        {dados.membrosPreview.length > 0 && (
          <section className="border border-border bg-panel p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
                Já jogam aqui
              </p>
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
                {dados.totalMembros} {dados.totalMembros === 1 ? 'jogador' : 'jogadores'}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {dados.membrosPreview.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-panel-2 font-display text-sm">
                    {m.avatarInicial}
                  </span>
                  <span className="text-xs text-text-secondary">{m.nome.split(' ')[0]}</span>
                </div>
              ))}
              {dados.totalMembros > dados.membrosPreview.length && (
                <span className="text-xs text-text-tertiary">
                  +{dados.totalMembros - dados.membrosPreview.length}
                </span>
              )}
            </div>
          </section>
        )}

        {/* CTA */}
        <div className="mt-2">
          <CTA
            auth={auth.status}
            token={token}
            entrada={entrada}
            aberta={dados.pelada.abertaParaNovos}
            aprovacaoObrigatoria={dados.pelada.aprovacaoObrigatoria}
            entrar={entrar}
            peladaSlug={dados.pelada.slug}
          />
        </div>
      </div>
    </main>
  );
}

function CTA({
  auth,
  token,
  entrada,
  aberta,
  aprovacaoObrigatoria,
  entrar,
  peladaSlug,
}: {
  auth: 'carregando' | 'anonimo' | 'autenticado';
  token: string;
  entrada: EstadoEntrada;
  aberta: boolean;
  aprovacaoObrigatoria: boolean;
  entrar: () => void;
  peladaSlug: string;
}) {
  if (!aberta) {
    return (
      <div className="border border-border-strong bg-panel p-5 text-center text-sm text-text-secondary">
        Essa pelada está fechada para novos jogadores no momento.
      </div>
    );
  }

  if (entrada.tipo === 'sucesso') {
    const r = entrada.resultado;
    if (r.estado === 'membro' || r.estado === 'ja_membro') {
      return (
        <div className="border border-accent bg-accent/10 p-5 text-center">
          <p className="font-display text-2xl uppercase text-accent">Você está dentro!</p>
          <p className="mt-2 text-sm text-text-secondary">Levando você para a pelada…</p>
        </div>
      );
    }
    return (
      <div className="border border-border-strong bg-panel p-5 text-center">
        <p className="font-display text-2xl uppercase">
          {r.estado === 'ja_candidatura' ? 'Já enviamos antes' : 'Candidatura enviada'}
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          O dono da pelada vai avaliar e te aprovar em breve.
        </p>
        <Link
          href={`/peladas/${peladaSlug}`}
          className="mt-4 inline-block text-xs font-bold uppercase tracking-wider text-accent hover:underline"
        >
          Ver a pelada →
        </Link>
      </div>
    );
  }

  if (auth === 'carregando') {
    return (
      <div className="border border-border-strong bg-panel p-5 text-center text-sm text-text-tertiary">
        Verificando sua conta…
      </div>
    );
  }

  if (auth === 'anonimo') {
    return (
      <div className="flex flex-col gap-3">
        <Link
          href={{ pathname: '/cadastrar', query: { convite: token } }}
          className="inline-flex h-12 items-center justify-center bg-accent px-6 text-sm font-bold uppercase tracking-wider text-[#0B0D10] hover:brightness-95"
        >
          Criar conta e entrar
        </Link>
        <Link
          href={{ pathname: '/entrar', query: { convite: token } }}
          className="inline-flex h-11 items-center justify-center border border-border-strong bg-panel px-6 text-sm font-bold uppercase tracking-wider hover:border-accent"
        >
          Já tenho conta
        </Link>
        <p className="text-center text-xs text-text-tertiary">
          {aprovacaoObrigatoria
            ? 'Sua entrada será enviada para aprovação do dono.'
            : 'Você entra na hora — sem precisar de aprovação.'}
        </p>
      </div>
    );
  }

  // autenticado
  return (
    <div className="flex flex-col gap-3">
      <Botao onClick={entrar} carregando={entrada.tipo === 'enviando'}>
        {aprovacaoObrigatoria ? 'Solicitar entrada' : 'Entrar na pelada'}
      </Botao>
      {entrada.tipo === 'erro' && (
        <p className="text-center text-sm text-coral">{entrada.mensagem}</p>
      )}
      <p className="text-center text-xs text-text-tertiary">
        {aprovacaoObrigatoria
          ? 'Sua entrada será enviada para aprovação do admin.'
          : 'Você entra na hora — sem precisar de aprovação.'}
      </p>
    </div>
  );
}

function Tile({
  rotulo,
  acento = 'accent',
  children,
}: {
  rotulo: string;
  acento?: 'accent' | 'dourado';
  children: React.ReactNode;
}) {
  const barra = acento === 'dourado' ? 'border-dourado' : 'border-accent';
  return (
    <div className="border border-border bg-panel-2 p-4">
      <p
        className={`border-b-[3px] ${barra} pb-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary`}
      >
        {rotulo}
      </p>
      <div className="mt-3 text-sm">{children}</div>
    </div>
  );
}
