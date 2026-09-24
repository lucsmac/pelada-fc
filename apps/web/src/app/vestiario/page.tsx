'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  MODALIDADE_LABEL,
  type ListarConvitesResponse,
  type Modalidade,
  type MinhaProximaPartidaResponse,
  type MinhaUltimaPartidaResponse,
  type MinhasCandidaturasResponse,
  type MinhasEstatisticasDTO,
  type MinhasPeladasResponse,
  type SugestoesPeladasResponse,
} from '@peladafc/contracts';
import { api } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';
import { Calendario } from '@/components/calendario';

const DIA_LABEL: Record<string, string> = {
  domingo: 'Dom',
  segunda: 'Seg',
  terca: 'Ter',
  quarta: 'Qua',
  quinta: 'Qui',
  sexta: 'Sex',
  sabado: 'Sáb',
};

export default function VestiarioPage() {
  const router = useRouter();
  const { estado } = useAuth();

  const [peladas, setPeladas] = useState<MinhasPeladasResponse | null>(null);
  const [proxima, setProxima] = useState<MinhaProximaPartidaResponse | null>(null);
  const [ultima, setUltima] = useState<MinhaUltimaPartidaResponse | null>(null);
  const [convites, setConvites] = useState<ListarConvitesResponse | null>(null);
  const [candidaturas, setCandidaturas] = useState<MinhasCandidaturasResponse | null>(null);
  const [estat, setEstat] = useState<MinhasEstatisticasDTO | null>(null);
  const [sugestoes, setSugestoes] = useState<SugestoesPeladasResponse | null>(null);
  const [erros, setErros] = useState<string[]>([]);

  useEffect(() => {
    if (estado.status === 'anonimo') router.replace('/entrar');
  }, [estado.status, router]);

  useEffect(() => {
    if (estado.status !== 'autenticado') return;
    const errs: string[] = [];
    const capturar = (nome: string) => (e: unknown) => {
      errs.push(`${nome}: ${isApiError(e) ? e.mensagem : 'erro'}`);
    };
    Promise.allSettled([
      api
        .get<MinhasPeladasResponse>('/me/peladas', { auth: true })
        .then(setPeladas)
        .catch(capturar('peladas')),
      api
        .get<MinhaProximaPartidaResponse>('/me/partidas/proxima', { auth: true })
        .then(setProxima)
        .catch(capturar('próxima partida')),
      api
        .get<MinhaUltimaPartidaResponse>('/me/partidas/ultima', { auth: true })
        .then(setUltima)
        .catch(capturar('última partida')),
      api
        .get<ListarConvitesResponse>('/convites/meus', { auth: true })
        .then(setConvites)
        .catch(capturar('convites')),
      api
        .get<MinhasCandidaturasResponse>('/me/candidaturas?status=pendente', { auth: true })
        .then(setCandidaturas)
        .catch(capturar('candidaturas')),
      api
        .get<MinhasEstatisticasDTO>('/me/estatisticas', { auth: true })
        .then(setEstat)
        .catch(capturar('estatísticas')),
      api
        .get<SugestoesPeladasResponse>('/me/sugestoes-peladas', { auth: true })
        .then(setSugestoes)
        .catch(capturar('sugestões')),
    ]).then(() => {
      if (errs.length) setErros(errs);
    });
  }, [estado.status]);

  if (estado.status !== 'autenticado') {
    return (
      <main className="mx-auto max-w-container px-6 py-16 text-text-tertiary">Carregando…</main>
    );
  }

  const primeiroNome = estado.usuario.nome.split(' ')[0];

  return (
    <main className="mx-auto max-w-container px-6 py-10 md:px-16">
      {/* Header ---------------------------------------------------------- */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between mb-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-accent">
            Vestiário
          </p>
          <h1 className="mt-2 font-display text-4xl uppercase leading-none sm:text-5xl md:text-6xl">
            Olá, {primeiroNome}.
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            Suas peladas, sua próxima partida e o que está acontecendo por aqui.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/peladas/nova"
            className="inline-flex h-11 items-center bg-accent px-5 text-xs font-bold uppercase tracking-wider text-[#0B0D10] hover:brightness-95"
          >
            Criar pelada
          </Link>
          <Link
            href="/peladas"
            className="inline-flex h-11 items-center border border-border-strong bg-panel px-5 text-xs font-bold uppercase tracking-wider hover:border-accent"
          >
            Explorar
          </Link>
        </div>
      </div>

      {/* Carreira em faixa horizontal ------------------------------------ */}
      <Estatisticas dados={estat} />

      {/* Próxima partida — destaque -------------------------------------- */}
      <ProximaPartida dados={proxima} />

      {/* Grid principal: coluna esquerda cresce com peladas + última;
          aside direito é a "banca" — calendário + inbox + carreira. */}
      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <MinhasPeladas dados={peladas} />
          <UltimaPartida dados={ultima} />
        </div>
        <aside className="flex flex-col gap-6">
          <Calendario />
          <Convites dados={convites} />
          <Candidaturas dados={candidaturas} />
        </aside>
      </div>

      {/* Sugestões ------------------------------------------------------- */}
      <Sugestoes dados={sugestoes} />

      {erros.length > 0 && (
        <p className="mt-8 text-xs text-text-tertiary">
          Alguns dados falharam ao carregar: {erros.join(' · ')}
        </p>
      )}
    </main>
  );
}

// ============================================================================
// Blocos
// ============================================================================

function ProximaPartida({ dados }: { dados: MinhaProximaPartidaResponse | null }) {
  if (dados === null) {
    return <Skeleton titulo="Próxima partida" altura="min-h-[140px]" />;
  }
  if (!dados.partida) {
    return (
      <PartidaVazia
        etiqueta="Próxima partida"
        chamada="A bola tá dormindo"
        subtexto="Nenhum jogo marcado por aqui. Procure uma pelada ou, se você é dono, marca aí e chama a resenha."
        variante="dormindo"
      />
    );
  }
  const p = dados.partida;
  const dataObj = new Date(p.data);
  return (
    <section className="mt-8 border border-accent bg-accent/[0.07] p-6 md:p-8">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-accent">
          Próxima partida
        </p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
          Faltam {diffDias(dataObj)}
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-display text-2xl uppercase leading-none text-text-secondary">
            {p.pelada.nome}
          </p>
          <h2 className="mt-3 font-display text-4xl uppercase leading-none sm:text-5xl md:text-6xl">
            {formatarDataCurta(dataObj)}
          </h2>
          <p className="mt-3 text-sm text-text-secondary">
            {p.local.nome} · {p.local.cidadeNome}/{p.local.cidadeUf}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={{ pathname: `/partidas/${p.id}` }}
            className="inline-flex h-11 items-center bg-accent px-5 text-xs font-bold uppercase tracking-wider text-[#0B0D10] hover:brightness-95"
          >
            Confirmar presença
          </Link>
          <Link
            href={{ pathname: `/peladas/${p.pelada.slug}` }}
            className="inline-flex h-11 items-center border border-border-strong bg-panel px-5 text-xs font-bold uppercase tracking-wider hover:border-accent"
          >
            Ver pelada
          </Link>
        </div>
      </div>
    </section>
  );
}

function MinhasPeladas({ dados }: { dados: MinhasPeladasResponse | null }) {
  return (
    <section>
      <BlocoTitulo>Minhas peladas</BlocoTitulo>
      {dados === null && (
        <p className="mt-4 text-sm text-text-tertiary">Carregando…</p>
      )}
      {dados && dados.itens.length === 0 && (
        <p className="mt-4 text-sm text-text-tertiary">
          Você ainda não participa de nenhuma pelada.{' '}
          <Link href="/peladas" className="text-accent hover:underline">
            Explorar
          </Link>
          .
        </p>
      )}
      {dados && dados.itens.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {dados.itens.map((m) => {
            const prox = m.proximaPartida ? new Date(m.proximaPartida) : null;
            return (
              <li key={m.pelada.id}>
                <Link
                  href={{ pathname: `/peladas/${m.pelada.slug}` }}
                  className="block h-full border border-border bg-panel p-4 hover:border-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-accent">
                        {MODALIDADE_LABEL[m.pelada.modalidade as Modalidade] ??
                          m.pelada.modalidade}
                      </p>
                      <p className="mt-1 font-display text-xl uppercase leading-tight">
                        {m.pelada.nome}
                      </p>
                    </div>
                    {m.papel === 'admin' && (
                      <span className="border border-accent bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent">
                        Dono
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-text-secondary">
                    {DIA_LABEL[m.pelada.diaSemana] ?? m.pelada.diaSemana} · {m.pelada.horario} ·{' '}
                    {m.local.cidadeNome}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-dotted border-border-strong pt-3 text-xs">
                    <span className="text-text-tertiary">{m.totalMembros} membros</span>
                    <span
                      className={prox ? 'font-semibold text-accent' : 'text-text-tertiary'}
                    >
                      {prox ? `Próx: ${formatarDataCurta(prox)}` : 'Sem partida agendada'}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Convites({ dados }: { dados: ListarConvitesResponse | null }) {
  return (
    <section>
      <div className="flex items-baseline justify-between border-b border-dotted border-border-strong pb-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
          Convites recebidos
        </p>
        {dados && dados.total > 0 && (
          <span className="border border-accent bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent">
            {dados.total}
          </span>
        )}
      </div>
      {dados === null && <p className="mt-3 text-sm text-text-tertiary">Carregando…</p>}
      {dados && dados.itens.length === 0 && (
        <p className="mt-3 text-sm text-text-tertiary">Nada pendente por aqui.</p>
      )}
      {dados && dados.itens.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {dados.itens.slice(0, 4).map((c) => (
            <li key={c.id} className="py-3 text-sm">
              <p>
                Convite para{' '}
                {c.pelada && (
                  <Link
                    href={{ pathname: `/peladas/${c.pelada.slug}` }}
                    className="font-semibold text-accent hover:underline"
                  >
                    {c.pelada.nome}
                  </Link>
                )}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {new Date(c.criadoEm).toLocaleDateString('pt-BR')}
              </p>
            </li>
          ))}
        </ul>
      )}
      {dados && dados.total > 4 && (
        <Link
          href="/convites"
          className="mt-3 inline-block text-xs font-bold uppercase tracking-wider text-accent hover:underline"
        >
          Ver todos →
        </Link>
      )}
    </section>
  );
}

function Candidaturas({ dados }: { dados: MinhasCandidaturasResponse | null }) {
  return (
    <section>
      <div className="flex items-baseline justify-between border-b border-dotted border-border-strong pb-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
          Candidaturas pendentes
        </p>
        {dados && dados.total > 0 && (
          <span className="border border-dourado bg-dourado/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-dourado">
            {dados.total}
          </span>
        )}
      </div>
      {dados === null && <p className="mt-3 text-sm text-text-tertiary">Carregando…</p>}
      {dados && dados.itens.length === 0 && (
        <p className="mt-3 text-sm text-text-tertiary">Nenhuma aguardando aprovação.</p>
      )}
      {dados && dados.itens.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {dados.itens.slice(0, 4).map((c) => (
            <li key={c.id} className="py-3 text-sm">
              <Link
                href={{ pathname: `/peladas/${c.pelada.slug}` }}
                className="font-semibold text-accent hover:underline"
              >
                {c.pelada.nome}
              </Link>
              <p className="mt-1 text-xs text-text-tertiary">
                Enviada em {new Date(c.criadoEm).toLocaleDateString('pt-BR')} — aguardando
                aprovação
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UltimaPartida({ dados }: { dados: MinhaUltimaPartidaResponse | null }) {
  if (dados === null) return <Skeleton titulo="Última partida" altura="min-h-[220px]" />;
  if (!dados.partida) {
    return (
      <PartidaVazia
        etiqueta="Última partida"
        chamada="Silêncio no vestiário"
        subtexto="Ainda não teve resenha por aqui. Assim que o primeiro placar cair, vamos começar a contar histórias."
        variante="silencio"
      />
    );
  }
  const p = dados.partida;
  return (
    <section className="border border-border bg-panel p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
          Última partida
        </p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
          {new Date(p.data).toLocaleDateString('pt-BR')}
        </p>
      </div>
      <Link
        href={{ pathname: `/partidas/${p.id}` }}
        className="mt-3 inline-block font-display text-2xl uppercase leading-tight hover:text-accent"
      >
        {p.pelada.nome}
      </Link>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
            Time A
          </p>
          <p className="font-display text-5xl leading-none">{p.placarTimeA}</p>
        </div>
        <p className="font-display text-2xl text-text-tertiary">×</p>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
            Time B
          </p>
          <p className="font-display text-5xl leading-none">{p.placarTimeB}</p>
        </div>
      </div>
      {p.destaques.length > 0 && (
        <div className="mt-5 border-t border-dotted border-border-strong pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
            Destaques
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {p.destaques.map((d) => (
              <li key={d.jogadorId} className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#1C2027] font-display text-xs">
                  {d.avatarInicial}
                </span>
                <span className="flex-1">{d.nome}</span>
                <span className="text-xs text-text-secondary">
                  {d.gols}G · {d.assistencias}A
                </span>
                {d.foiMvp && (
                  <span className="border border-dourado bg-dourado/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-dourado">
                    MVP
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Estatisticas({ dados }: { dados: MinhasEstatisticasDTO | null }) {
  return (
    <section className="mt-8 flex flex-col divide-y divide-border border border-border bg-panel-2 sm:flex-row sm:divide-x sm:divide-y-0">
      <div className="flex items-center gap-4 px-6 py-4">
        <p className="font-display text-5xl leading-none text-dourado">
          {dados?.rating ?? '—'}
        </p>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">
            Rating
          </p>
          <p className="mt-0.5 font-display text-sm uppercase leading-none text-text">
            Sua carreira
          </p>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-3 divide-x divide-y divide-border md:grid-cols-6 md:divide-y-0">
        <StatInline rotulo="Partidas" valor={dados?.partidas ?? '—'} />
        <StatInline rotulo="Gols" valor={dados?.gols ?? '—'} />
        <StatInline rotulo="Assist." valor={dados?.assistencias ?? '—'} />
        <StatInline
          rotulo="Vitórias"
          valor={dados?.vitorias ?? '—'}
          acento="accent"
        />
        <StatInline
          rotulo="MVPs"
          valor={dados?.mvps ?? '—'}
          acento="dourado"
        />
        <StatInline
          rotulo="V/E/D"
          valor={dados ? `${dados.vitorias}·${dados.empates}·${dados.derrotas}` : '—'}
        />
      </div>
    </section>
  );
}

function StatInline({
  rotulo,
  valor,
  acento,
}: {
  rotulo: string;
  valor: number | string;
  acento?: 'accent' | 'dourado';
}) {
  const cor =
    acento === 'dourado'
      ? 'text-dourado'
      : acento === 'accent'
        ? 'text-accent'
        : 'text-text';
  return (
    <div className="flex flex-col items-center justify-center px-3 py-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary">
        {rotulo}
      </p>
      <p className={`mt-1 font-display text-2xl leading-none ${cor}`}>{valor}</p>
    </div>
  );
}

function Sugestoes({ dados }: { dados: SugestoesPeladasResponse | null }) {
  return (
    <section className="mt-10">
      <BlocoTitulo>Sugestões pra você</BlocoTitulo>
      {dados === null && <p className="mt-4 text-sm text-text-tertiary">Carregando…</p>}
      {dados && dados.itens.length === 0 && (
        <p className="mt-4 text-sm text-text-tertiary">
          Sem sugestões por enquanto. Explore todas as{' '}
          <Link href="/peladas" className="text-accent hover:underline">
            peladas públicas
          </Link>
          .
        </p>
      )}
      {dados && dados.itens.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {dados.itens.map((p) => (
            <li key={p.id}>
              <Link
                href={{ pathname: `/peladas/${p.slug}` }}
                className="block h-full border border-border bg-panel p-4 hover:border-accent"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-accent">
                  {MODALIDADE_LABEL[p.modalidade as Modalidade] ?? p.modalidade}
                </p>
                <p className="mt-1 font-display text-xl uppercase leading-tight">{p.nome}</p>
                <p className="mt-2 text-xs text-text-secondary">
                  {DIA_LABEL[p.diaSemana] ?? p.diaSemana} · {p.horario} · {p.local.cidadeNome}
                </p>
                <p className="mt-3 border-t border-dotted border-border-strong pt-3 text-xs text-text-tertiary">
                  {p.totalMembros} membros · {p.local.nome}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ============================================================================
// Utilitários visuais
// ============================================================================

function BlocoTitulo({ children }: { children: ReactNode }) {
  return (
    <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-widest text-text-secondary">
      {children}
    </h2>
  );
}

function PartidaVazia({
  etiqueta,
  chamada,
  subtexto,
  variante,
}: {
  etiqueta: string;
  chamada: string;
  subtexto: string;
  variante: 'dormindo' | 'silencio';
}) {
  return (
    <section className="mt-8 overflow-hidden border border-dashed border-border-strong bg-panel">
      <div className="grid grid-cols-1 items-center gap-6 p-8 md:grid-cols-[auto_1fr] md:gap-10 md:p-10">
        <div className="flex justify-center md:justify-start">
          {variante === 'dormindo' ? <BolaDormindoSVG /> : <BolaParadaSVG />}
        </div>
        <div className="text-center md:text-left">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
            {etiqueta}
          </p>
          <h3 className="mt-2 font-display text-3xl uppercase leading-tight md:text-4xl">
            {chamada}
          </h3>
          <p className="mt-3 max-w-md text-sm text-text-secondary md:mx-0">{subtexto}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * Bola de futebol clássica com Zzz — reforça o "dormindo".
 * Usa currentColor pra herdar cor via text-*.
 */
function BolaDormindoSVG() {
  return (
    <svg
      viewBox="0 0 140 120"
      width="140"
      height="120"
      className="text-text-tertiary"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Zzz's */}
      <g className="text-accent" stroke="currentColor" strokeWidth="1.8">
        <path d="M96 12 h10 l-10 12 h10" />
        <path d="M110 30 h8 l-8 10 h8" opacity="0.7" />
        <path d="M122 46 h6 l-6 8 h6" opacity="0.45" />
      </g>
      {/* Ball */}
      <g transform="translate(10 30)">
        <circle cx="45" cy="45" r="43" />
        <polygon points="45,22 63,35 56,55 34,55 27,35" fill="currentColor" opacity="0.15" />
        <polygon points="45,22 63,35 56,55 34,55 27,35" />
        <line x1="45" y1="22" x2="45" y2="4" />
        <line x1="63" y1="35" x2="82" y2="26" />
        <line x1="56" y1="55" x2="72" y2="72" />
        <line x1="34" y1="55" x2="18" y2="72" />
        <line x1="27" y1="35" x2="8" y2="26" />
      </g>
      {/* Chão / sombra */}
      <ellipse cx="55" cy="115" rx="42" ry="3" fill="currentColor" opacity="0.2" stroke="none" />
    </svg>
  );
}

/**
 * Bola parada com traços de "poeira" — sensação de estagnação.
 */
function BolaParadaSVG() {
  return (
    <svg
      viewBox="0 0 140 120"
      width="140"
      height="120"
      className="text-text-tertiary"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Traços laterais (poeira / silêncio) */}
      <g opacity="0.55">
        <line x1="100" y1="50" x2="118" y2="46" />
        <line x1="102" y1="62" x2="122" y2="62" />
        <line x1="100" y1="74" x2="118" y2="78" />
        <line x1="24" y1="50" x2="6" y2="46" />
        <line x1="22" y1="62" x2="2" y2="62" />
        <line x1="24" y1="74" x2="6" y2="78" />
      </g>
      {/* Ball */}
      <g transform="translate(25 20)">
        <circle cx="45" cy="45" r="43" />
        <polygon points="45,22 63,35 56,55 34,55 27,35" fill="currentColor" opacity="0.15" />
        <polygon points="45,22 63,35 56,55 34,55 27,35" />
        <line x1="45" y1="22" x2="45" y2="4" />
        <line x1="63" y1="35" x2="82" y2="26" />
        <line x1="56" y1="55" x2="72" y2="72" />
        <line x1="34" y1="55" x2="18" y2="72" />
        <line x1="27" y1="35" x2="8" y2="26" />
      </g>
      <ellipse cx="70" cy="115" rx="42" ry="3" fill="currentColor" opacity="0.2" stroke="none" />
    </svg>
  );
}

function Skeleton({ titulo, altura }: { titulo: string; altura: string }) {
  return (
    <section
      className={`mt-8 border border-border bg-panel p-6 ${altura} animate-pulse`}
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
        {titulo}
      </p>
    </section>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatarDataCurta(d: Date) {
  const dia = String(d.getDate()).padStart(2, '0');
  const mesAbrev = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][d.getMonth()];
  return `${dia} ${mesAbrev} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function diffDias(d: Date) {
  const ms = d.getTime() - Date.now();
  if (ms < 0) return 'agora';
  const dias = Math.floor(ms / 86_400_000);
  const horas = Math.floor((ms % 86_400_000) / 3_600_000);
  if (dias === 0) return `${horas}h`;
  if (dias === 1) return '1 dia';
  return `${dias} dias`;
}
