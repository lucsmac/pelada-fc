'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  MODALIDADE_LABEL,
  ROTULOS_POSICAO_LINHA,
  TIPO_LOCAL_LABEL,
  type LinkConvitePublicoDTO,
  type ListarMembrosResponse,
  type ListarPartidasResponse,
  type ListarTemporadasResponse,
  type LocalDTO,
  type MembroDTO,
  type PartidaDTO,
  type PeladaDTO,
  type RankingResponse,
  type TemporadaDTO,
} from '@peladafc/contracts';
import { api, ApiError } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';
import { Botao } from '@/components/botao';
import { IconeGoleiro, IconeInterrogacao, IconeLinha } from '@/components/icones-funcao';

const DIA_LABEL: Record<string, string> = {
  domingo: 'Domingos',
  segunda: 'Segundas',
  terca: 'Terças',
  quarta: 'Quartas',
  quinta: 'Quintas',
  sexta: 'Sextas',
  sabado: 'Sábados',
};

const DIA_CURTO: Record<string, string> = {
  domingo: 'Dom',
  segunda: 'Seg',
  terca: 'Ter',
  quarta: 'Qua',
  quinta: 'Qui',
  sexta: 'Sex',
  sabado: 'Sáb',
};

const STATUS_PARTIDA_LABEL: Record<string, string> = {
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

export default function PeladaDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { estado } = useAuth();
  const [pelada, setPelada] = useState<PeladaDTO | null>(null);
  const [local, setLocal] = useState<LocalDTO | null>(null);
  const [membros, setMembros] = useState<MembroDTO[] | null>(null);
  const [partidas, setPartidas] = useState<PartidaDTO[] | null>(null);
  const [temporada, setTemporada] = useState<TemporadaDTO | null>(null);
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const p = await api.get<PeladaDTO>(`/peladas/${slug}`);
        if (cancelado) return;
        setPelada(p);
        const [l, m, parts, temps, rk] = await Promise.all([
          api.get<LocalDTO>(`/locais/${p.localId}`),
          api.get<ListarMembrosResponse>(`/peladas/${p.id}/membros`),
          api
            .get<ListarPartidasResponse>(`/peladas/${p.id}/partidas`)
            .catch(() => ({ itens: [], total: 0 }) as ListarPartidasResponse),
          api
            .get<ListarTemporadasResponse>(`/peladas/${p.id}/temporadas`)
            .catch(() => ({ itens: [], total: 0 }) as ListarTemporadasResponse),
          api
            .get<RankingResponse>(`/peladas/${p.id}/rankings?categoria=geral`)
            .catch(
              () =>
                ({
                  categoria: 'geral',
                  temporadaId: null,
                  peladaId: p.id,
                  linhas: [],
                }) as RankingResponse,
            ),
        ]);
        if (cancelado) return;
        setLocal(l);
        setMembros(m.itens);
        setPartidas(parts.itens);
        setTemporada(temps.itens.find((t) => t.id === p.temporadaAtualId) ?? temps.itens[0] ?? null);
        setRanking(rk);
      } catch (e) {
        if (cancelado) return;
        if (e instanceof ApiError && e.status === 404) setNaoEncontrada(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [slug]);

  const proximaPartida = useMemo(() => {
    if (!partidas) return null;
    const agora = Date.now();
    const futuras = partidas
      .filter((p) => p.status === 'agendada' || p.status === 'em_andamento')
      .filter((p) => new Date(p.data).getTime() >= agora - 12 * 3600_000)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
    return futuras[0] ?? null;
  }, [partidas]);

  const ultimaPartida = useMemo(() => {
    if (!partidas) return null;
    return (
      partidas
        .filter((p) => p.status === 'finalizada')
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())[0] ?? null
    );
  }, [partidas]);

  const estatisticasPelada = useMemo(() => {
    const finalizadas = partidas?.filter((p) => p.status === 'finalizada') ?? [];
    const totalGols = finalizadas.reduce((acc, p) => acc + p.placarTimeA + p.placarTimeB, 0);
    const totalMvps = ranking?.linhas.reduce((a, l) => a + l.estatisticas.mvps, 0) ?? 0;
    const mediaGols = finalizadas.length ? totalGols / finalizadas.length : 0;
    return {
      totalPartidas: finalizadas.length,
      totalGols,
      totalMvps,
      mediaGolsPorJogo: Number(mediaGols.toFixed(1)),
    };
  }, [partidas, ranking]);

  if (naoEncontrada) {
    return (
      <main className="mx-auto max-w-container px-16 py-16">
        <h1 className="font-display text-4xl uppercase">Pelada não encontrada</h1>
        <Link href="/peladas" className="mt-4 inline-block text-accent hover:underline">
          ← Voltar
        </Link>
      </main>
    );
  }

  if (!pelada) {
    return (
      <main className="mx-auto max-w-container px-16 py-16 text-text-tertiary">Carregando…</main>
    );
  }

  const souAdmin =
    estado.status === 'autenticado' &&
    (pelada.criadoPorUserId === estado.usuario.id ||
      membros?.some((m) => m.papel === 'admin' && m.jogador.userId === estado.usuario.id));

  const souMembro =
    estado.status === 'autenticado' &&
    membros?.some((m) => m.jogador.userId === estado.usuario.id);

  const top3 = ranking?.linhas.slice(0, 3) ?? [];

  return (
    <main className="mx-auto max-w-container px-6 py-10 md:px-16">
      <CabecalhoPelada pelada={pelada} local={local} />

      <div className="mt-8">
        <StripPelada
          temporada={temporada}
          proximaPartida={proximaPartida}
          totalMembros={membros?.length ?? 0}
          limiteMembros={pelada.limiteMembros}
          diaSemana={pelada.diaSemana}
          horario={pelada.horario}
          souMembro={!!souMembro}
          souAdmin={!!souAdmin}
          slug={pelada.slug}
          publica={pelada.publica}
          abertaParaNovos={pelada.abertaParaNovos}
          estadoAuth={estado.status}
        />

        <div className="mt-8 flex flex-wrap gap-2">
          <Link
            href={`/peladas/${pelada.slug}/partidas`}
            className="border border-border-strong bg-panel px-4 py-2 text-xs font-bold uppercase tracking-wider hover:border-accent"
          >
            Partidas
          </Link>
          <Link
            href={`/peladas/${pelada.slug}/ranking`}
            className="border border-border-strong bg-panel px-4 py-2 text-xs font-bold uppercase tracking-wider hover:border-accent"
          >
            Ranking
          </Link>
          <Link
            href={`/peladas/${pelada.slug}/temporadas`}
            className="border border-border-strong bg-panel px-4 py-2 text-xs font-bold uppercase tracking-wider hover:border-accent"
          >
            Temporadas
          </Link>
          {souAdmin && (
            <>
              <Link
                href={`/peladas/${pelada.slug}/gerenciar`}
                className="border border-border-strong bg-panel px-4 py-2 text-xs font-bold uppercase tracking-wider hover:border-accent"
              >
                Gerenciar
              </Link>
              <Link
                href={`/peladas/${pelada.slug}/tesouraria`}
                className="border border-border-strong bg-panel px-4 py-2 text-xs font-bold uppercase tracking-wider hover:border-accent"
              >
                Tesouraria
              </Link>
            </>
          )}
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-6">
            {pelada.descricao && (
              <Painel titulo="Sobre">
                <p className="text-sm leading-relaxed text-text-secondary">{pelada.descricao}</p>
              </Painel>
            )}

            <Painel titulo="Estatísticas da pelada">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <BlocoEstat rotulo="Partidas" valor={estatisticasPelada.totalPartidas} />
                <BlocoEstat rotulo="Gols" valor={estatisticasPelada.totalGols} />
                <BlocoEstat
                  rotulo="Média/jogo"
                  valor={estatisticasPelada.mediaGolsPorJogo}
                  detalhe="gols"
                />
                <BlocoEstat
                  rotulo="MVPs"
                  valor={estatisticasPelada.totalMvps}
                  acentoDourado
                />
              </div>
            </Painel>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <CardProximaPartida partida={proximaPartida} />
              <CardUltimaPartida partida={ultimaPartida} peladaSlug={pelada.slug} />
            </div>

            <Painel
              titulo="Ranking geral — Top 3"
              acao={
                <Link
                  href={`/peladas/${pelada.slug}/ranking`}
                  className="text-[11px] font-bold uppercase tracking-wider text-accent hover:underline"
                >
                  Ver completo →
                </Link>
              }
            >
              {top3.length === 0 ? (
                <p className="text-sm text-text-tertiary">
                  Nenhuma partida finalizada ainda. O ranking aparece após registrar resultados.
                </p>
              ) : (
                <ol className="flex flex-col divide-y divide-border">
                  {top3.map((l) => (
                    <li key={l.jogadorId} className="flex items-center gap-4 py-3">
                      <span
                        className={[
                          'grid h-8 w-8 place-items-center font-display text-lg',
                          l.posicao === 1
                            ? 'bg-dourado text-[#0B0D10]'
                            : l.posicao === 2
                              ? 'bg-[#C0C6CC] text-[#0B0D10]'
                              : 'bg-[#B87333] text-[#0B0D10]',
                        ].join(' ')}
                      >
                        {l.posicao}
                      </span>
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-[#1C2027] font-display text-sm">
                        {l.avatarInicial}
                      </span>
                      <span className="flex-1 text-sm">{l.nome}</span>
                      <div className="flex gap-3 text-xs text-text-secondary">
                        <span>
                          <b className="font-display text-base text-text">
                            {l.estatisticas.partidas}
                          </b>{' '}
                          J
                        </span>
                        <span>
                          <b className="font-display text-base text-text">
                            {l.estatisticas.gols}
                          </b>{' '}
                          G
                        </span>
                        <span>
                          <b className="font-display text-base text-text">
                            {l.estatisticas.vitorias}
                          </b>{' '}
                          V
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Painel>

            <Painel
              titulo={`Jogadores (${membros?.length ?? 0})`}
              acao={
                souAdmin && (
                  <Link
                    href={`/peladas/${pelada.slug}/gerenciar`}
                    className="text-[11px] font-bold uppercase tracking-wider text-accent hover:underline"
                  >
                    Gerenciar →
                  </Link>
                )
              }
            >
              {membros === null ? (
                <p className="text-sm text-text-tertiary">Carregando…</p>
              ) : (
                <JogadoresPorFuncao membros={membros} />
              )}
            </Painel>
          </div>

          <aside className="flex flex-col gap-6">
            <Painel titulo="Onde">
              <p className="text-text">{local?.nome ?? '—'}</p>
              <p className="text-sm text-text-secondary">
                {local
                  ? `${local.bairro ? local.bairro + ', ' : ''}${local.cidadeNome}/${local.cidadeUf}`
                  : ''}
              </p>
              {local && (
                <p className="mt-2 text-xs text-text-tertiary">{TIPO_LOCAL_LABEL[local.tipo]}</p>
              )}
            </Painel>

            <Painel titulo="Formato">
              <p className="text-text">{pelada.totalJogadores} jogadores/partida</p>
              <p className="text-sm text-text-secondary">
                {pelada.abertaParaNovos ? 'Aberta para novos jogadores' : 'Fechada'}
                {pelada.aprovacaoObrigatoria && pelada.abertaParaNovos ? ' · aprovação obrigatória' : ''}
              </p>
              {pelada.limiteMembros && (
                <p className="mt-2 text-xs text-text-tertiary">
                  Limite: {pelada.limiteMembros} membros
                </p>
              )}
            </Painel>

            {estado.status === 'autenticado' && (souMembro || souAdmin) && (
              <CardConviteRapido pelada={pelada} />
            )}

            <PainelRankings slug={pelada.slug} />

            <PainelAvatares membros={membros} slug={pelada.slug} />
          </aside>
        </div>

        {estado.status === 'autenticado' && !souMembro && pelada.publica && (
          <BotoesInteracao peladaId={pelada.id} aberta={pelada.abertaParaNovos} />
        )}
      </div>
    </main>
  );
}

function CabecalhoPelada({ pelada, local }: { pelada: PeladaDTO; local: LocalDTO | null }) {
  return (
    <header>
      <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
        {MODALIDADE_LABEL[pelada.modalidade]}
      </p>
      <h1 className="mt-1 font-display text-5xl uppercase leading-none md:text-6xl">
        {pelada.nome}
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text-secondary">
        {local && (
          <span className="flex items-center gap-2">
            <IconePin />
            <span className="text-text">{local.nome}</span>
            <span className="text-text-tertiary">·</span>
            <span>
              {local.bairro ? `${local.bairro}, ` : ''}
              {local.cidadeNome}/{local.cidadeUf}
            </span>
          </span>
        )}
        <span className="flex items-center gap-2">
          <IconeCalendario /> {DIA_LABEL[pelada.diaSemana] ?? pelada.diaSemana} · {pelada.horario}
        </span>
        <SelinhoPreco pelada={pelada} />
        <div className="flex flex-wrap gap-2">
          <BadgePlano>
            <IconeVisibilidade />
            {pelada.publica ? 'Pública' : 'Privada'}
          </BadgePlano>
          {pelada.abertaParaNovos && <BadgePlano acento>Aberta</BadgePlano>}
        </div>
      </div>
    </header>
  );
}

function SelinhoPreco({ pelada }: { pelada: PeladaDTO }) {
  if (pelada.precoEstimadoCentavos === undefined) return null;
  if (pelada.precoEstimadoCentavos === 0) {
    return (
      <span className="flex items-center gap-2">
        <IconeMoeda />
        <span className="text-text">Grátis</span>
      </span>
    );
  }
  const valor = (pelada.precoEstimadoCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  return (
    <span className="flex items-center gap-2">
      <IconeMoeda />
      <span className="text-text">
        {pelada.precoTemRateado ? '~' : ''}
        {valor}
      </span>
      <span className="text-text-tertiary">por jogador</span>
    </span>
  );
}

function IconeMoeda() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.5c-.4-1-1.5-1.7-3-1.7-1.9 0-3 1-3 2.2 0 3 6 1.5 6 4.5 0 1.2-1.1 2.2-3 2.2-1.5 0-2.6-.7-3-1.7M12 6.5v11" />
    </svg>
  );
}

function StripPelada({
  temporada,
  proximaPartida,
  totalMembros,
  limiteMembros,
  diaSemana,
  horario,
  souMembro,
  souAdmin,
  slug,
  publica,
  abertaParaNovos,
  estadoAuth,
}: {
  temporada: TemporadaDTO | null;
  proximaPartida: PartidaDTO | null;
  totalMembros: number;
  limiteMembros: number | null;
  diaSemana: string;
  horario: string;
  souMembro: boolean;
  souAdmin: boolean;
  slug: string;
  publica: boolean;
  abertaParaNovos: boolean;
  estadoAuth: string;
}) {
  const proximoTexto = proximaPartida
    ? `${new Date(proximaPartida.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · ${new Date(proximaPartida.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : `${DIA_CURTO[diaSemana] ?? diaSemana} · ${horario}`;

  return (
    <div className="grid grid-cols-1 gap-0 border border-border-strong bg-panel-2 md:grid-cols-[1fr_1fr_1fr_auto]">
      <StripItem
        rotulo="Temporada atual"
        cor="text-dourado"
        icone={<IconeTrofeu />}
        titulo={
          temporada
            ? `${temporada.ano} · T${temporada.numero}`
            : 'Sem temporada'
        }
        detalhe={temporada?.nome ?? undefined}
      />
      <StripItem
        rotulo={proximaPartida ? 'Próxima partida' : 'Horário'}
        cor="text-accent"
        icone={<IconeCalendario />}
        titulo={proximoTexto}
        detalhe={proximaPartida ? STATUS_PARTIDA_LABEL[proximaPartida.status] : 'Sem partida agendada'}
        href={proximaPartida ? `/partidas/${proximaPartida.id}` : undefined}
      />
      <StripItem
        rotulo="Jogadores"
        cor="text-accent"
        icone={<IconeGrupo />}
        titulo={`${totalMembros}${limiteMembros ? ` / ${limiteMembros}` : ''}`}
        detalhe={totalMembros === 1 ? 'membro' : 'membros'}
      />
      <div className="flex items-center justify-center border-t border-border-strong px-6 py-4 md:border-l md:border-t-0">
        {souAdmin ? (
          <Link
            href={`/peladas/${slug}/partidas`}
            className="inline-flex h-11 items-center justify-center bg-accent px-6 text-sm font-bold uppercase tracking-wider text-[#0B0D10] hover:brightness-95"
          >
            Gerenciar partidas
          </Link>
        ) : souMembro ? (
          <Link
            href={`/peladas/${slug}/partidas`}
            className="inline-flex h-11 items-center justify-center bg-accent px-6 text-sm font-bold uppercase tracking-wider text-[#0B0D10] hover:brightness-95"
          >
            Confirmar presença
          </Link>
        ) : estadoAuth === 'autenticado' && publica && abertaParaNovos ? (
          <a
            href="#candidatar"
            className="inline-flex h-11 items-center justify-center bg-accent px-6 text-sm font-bold uppercase tracking-wider text-[#0B0D10] hover:brightness-95"
          >
            Candidatar-se
          </a>
        ) : estadoAuth !== 'autenticado' && publica && abertaParaNovos ? (
          <Link
            href={`/entrar?next=/peladas/${slug}`}
            className="inline-flex h-11 items-center justify-center bg-accent px-6 text-sm font-bold uppercase tracking-wider text-[#0B0D10] hover:brightness-95"
          >
            Fazer login para entrar
          </Link>
        ) : (
          <span className="px-2 text-xs text-text-tertiary">Pelada {publica ? 'aberta' : 'privada'}</span>
        )}
      </div>
    </div>
  );
}

function StripItem({
  rotulo,
  titulo,
  detalhe,
  icone,
  cor,
  href,
}: {
  rotulo: string;
  titulo: string;
  detalhe?: string;
  icone: React.ReactNode;
  cor: string;
  href?: string;
}) {
  const conteudo = (
    <div className="flex items-start gap-3 border-t border-dotted border-border-strong px-6 py-4 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0">
      <span className={['mt-1 shrink-0', cor].join(' ')}>{icone}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
          {rotulo}
        </div>
        <div className="mt-0.5 truncate font-display text-lg uppercase text-text">{titulo}</div>
        {detalhe && (
          <div className="mt-0.5 truncate text-xs text-text-secondary">{detalhe}</div>
        )}
      </div>
    </div>
  );
  return href ? (
    <Link href={{ pathname: href }} className="group hover:bg-panel">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

function Painel({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-panel p-6">
      <header className="mb-4 flex items-center justify-between border-b border-dotted border-border-strong pb-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          {titulo}
        </h2>
        {acao}
      </header>
      {children}
    </section>
  );
}

function BlocoEstat({
  rotulo,
  valor,
  detalhe,
  acentoDourado,
}: {
  rotulo: string;
  valor: number | string;
  detalhe?: string;
  acentoDourado?: boolean;
}) {
  return (
    <div className="bg-panel-2 p-4">
      <div
        className={[
          'border-b-[3px] pb-2 text-[10px] font-bold uppercase tracking-wider text-text-secondary',
          acentoDourado ? 'border-dourado' : 'border-accent',
        ].join(' ')}
      >
        {rotulo}
      </div>
      <div className="mt-3 font-display text-3xl text-text">{valor}</div>
      {detalhe && <div className="mt-1 text-[11px] text-text-tertiary">{detalhe}</div>}
    </div>
  );
}

function CardProximaPartida({ partida }: { partida: PartidaDTO | null }) {
  if (!partida) {
    return (
      <Painel titulo="Próxima partida">
        <p className="text-sm text-text-tertiary">Nenhuma partida agendada.</p>
      </Painel>
    );
  }
  const data = new Date(partida.data);
  return (
    <Painel titulo="Próxima partida">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-4xl uppercase leading-none">
            {data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
            {STATUS_PARTIDA_LABEL[partida.status]}
          </p>
        </div>
        <Link
          href={`/partidas/${partida.id}`}
          className="border border-border-strong bg-panel-2 px-4 py-2 text-xs font-bold uppercase tracking-wider hover:border-accent"
        >
          Abrir
        </Link>
      </div>
    </Painel>
  );
}

function CardUltimaPartida({
  partida,
  peladaSlug,
}: {
  partida: PartidaDTO | null;
  peladaSlug: string;
}) {
  if (!partida) {
    return (
      <Painel titulo="Última partida">
        <p className="text-sm text-text-tertiary">Nenhuma partida finalizada ainda.</p>
      </Painel>
    );
  }
  const data = new Date(partida.data);
  return (
    <Painel
      titulo="Última partida"
      acao={
        <Link
          href={`/peladas/${peladaSlug}/partidas`}
          className="text-[11px] font-bold uppercase tracking-wider text-accent hover:underline"
        >
          Todas →
        </Link>
      }
    >
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            Time A
          </p>
          <p className="font-display text-5xl leading-none">{partida.placarTimeA}</p>
        </div>
        <span className="font-display text-2xl text-text-tertiary">·</span>
        <div className="flex-1 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            Time B
          </p>
          <p className="font-display text-5xl leading-none">{partida.placarTimeB}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-dotted border-border-strong pt-3 text-xs">
        <span className="text-text-secondary">
          {data.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
        <Link
          href={`/partidas/${partida.id}`}
          className="font-bold uppercase tracking-wider text-accent hover:underline"
        >
          Ver detalhes →
        </Link>
      </div>
    </Painel>
  );
}

function CardConviteRapido({ pelada }: { pelada: PeladaDTO }) {
  const [token, setToken] = useState<string | null>(pelada.tokenConvitePublico);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const origem = typeof window === 'undefined' ? '' : window.location.origin;
  const url = token ? `${origem}/c/${token}` : null;

  const gerar = async () => {
    setErro(null);
    setGerando(true);
    try {
      const r = await api.post<LinkConvitePublicoDTO>(
        `/peladas/${pelada.id}/link-convite`,
        undefined,
        { auth: true },
      );
      setToken(r.token);
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro ao gerar');
    } finally {
      setGerando(false);
    }
  };

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setErro('Copie manualmente');
    }
  };

  const whatsapp = url
    ? `https://wa.me/?text=${encodeURIComponent(`Bora jogar na ${pelada.nome}? ${url}`)}`
    : null;

  return (
    <Painel titulo="Convite rápido">
      <p className="text-xs text-text-tertiary">
        Compartilhe o link com quem você quer chamar pra jogar.
      </p>
      {!token ? (
        <div className="mt-4">
          <Botao variante="secundario" onClick={gerar} carregando={gerando}>
            Gerar link
          </Botao>
          {erro && <p className="mt-2 text-xs text-coral">{erro}</p>}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-stretch border border-border-strong bg-panel-2">
            <input
              readOnly
              value={url ?? ''}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-[11px] text-text outline-none"
            />
            <button
              onClick={copiar}
              className="border-l border-border-strong bg-panel px-3 text-[11px] font-bold uppercase tracking-wider hover:border-accent hover:text-accent"
            >
              {copiado ? 'Copiado ✓' : 'Copiar'}
            </button>
          </div>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center border border-border-strong bg-panel px-3 text-[11px] font-bold uppercase tracking-wider hover:border-accent"
            >
              Enviar no WhatsApp
            </a>
          )}
          {erro && <p className="text-xs text-coral">{erro}</p>}
        </div>
      )}
    </Painel>
  );
}

function PainelRankings({ slug }: { slug: string }) {
  const categorias: { key: string; rotulo: string }[] = [
    { key: 'artilharia', rotulo: 'Artilharia' },
    { key: 'vitorias', rotulo: 'Vitórias' },
    { key: 'assistencias', rotulo: 'Assistências' },
    { key: 'mvp', rotulo: 'MVP' },
    { key: 'aproveitamento', rotulo: 'Aproveitamento' },
  ];
  return (
    <Painel titulo="Ver rankings">
      <div className="flex flex-wrap gap-2">
        {categorias.map((c) => (
          <Link
            key={c.key}
            href={`/peladas/${slug}/ranking?categoria=${c.key}`}
            className="border border-border-strong bg-panel-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary hover:border-accent hover:text-accent"
          >
            {c.rotulo}
          </Link>
        ))}
      </div>
    </Painel>
  );
}

function JogadoresPorFuncao({ membros }: { membros: MembroDTO[] }) {
  if (membros.length === 0) {
    return <p className="text-sm text-text-tertiary">Sem membros ainda.</p>;
  }
  const goleiros = membros.filter((m) => m.jogador.funcaoPreferida === 'goleiro');
  const linha = membros.filter((m) => m.jogador.funcaoPreferida === 'linha');
  const semFuncao = membros.filter((m) => m.jogador.funcaoPreferida === null);

  return (
    <div className="flex flex-col gap-3">
      <GrupoJogadores
        titulo="Goleiros"
        cor="dourado"
        icone={<IconeGoleiro className="h-3.5 w-3.5" />}
        membros={goleiros}
      />
      <GrupoJogadores
        titulo="Linha"
        cor="accent"
        icone={<IconeLinha className="h-3.5 w-3.5" />}
        membros={linha}
      />
      {semFuncao.length > 0 && (
        <GrupoJogadores
          titulo="Sem função"
          cor="muted"
          icone={<IconeInterrogacao className="h-3.5 w-3.5" />}
          membros={semFuncao}
        />
      )}
    </div>
  );
}

function GrupoJogadores({
  titulo,
  cor,
  icone,
  membros,
}: {
  titulo: string;
  cor: 'dourado' | 'accent' | 'muted';
  icone: React.ReactNode;
  membros: MembroDTO[];
}) {
  const paleta =
    cor === 'dourado'
      ? { texto: 'text-dourado', chip: 'border-dourado/30' }
      : cor === 'accent'
        ? { texto: 'text-accent', chip: 'border-accent/30' }
        : { texto: 'text-text-tertiary', chip: 'border-border-strong border-dashed' };

  return (
    <div>
      <div className={`flex items-center gap-1.5 ${paleta.texto}`}>
        {icone}
        <span className="text-[10px] font-bold uppercase tracking-wider">
          {titulo} · {membros.length}
        </span>
      </div>
      {membros.length === 0 ? (
        <p className="mt-1 text-xs italic text-text-tertiary">Nenhum definido.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {membros.map((m) => {
            const detalhe =
              m.jogador.funcaoPreferida === 'linha' && m.jogador.posicaoLinha
                ? ROTULOS_POSICAO_LINHA[m.jogador.posicaoLinha]
                : null;
            return (
              <li
                key={m.id}
                className={`flex items-center gap-2 border ${paleta.chip} bg-panel-2 px-2.5 py-1.5`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#1C2027] font-display text-xs">
                  {m.jogador.avatarInicial}
                </span>
                <span className="text-xs">
                  {m.jogador.nome}
                  {m.papel === 'admin' && (
                    <span className="ml-1.5 text-[9px] font-bold uppercase text-accent">
                      dono
                    </span>
                  )}
                  {detalhe && (
                    <span className="ml-1.5 text-[9px] font-bold uppercase text-text-tertiary">
                      {detalhe}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PainelAvatares({
  membros,
  slug,
}: {
  membros: MembroDTO[] | null;
  slug: string;
}) {
  const preview = membros?.slice(0, 4) ?? [];
  const restante = Math.max(0, (membros?.length ?? 0) - preview.length);
  const cores = ['bg-[#0E7A42]', 'bg-[#B9760F]', 'bg-[#1D4ED8]', 'bg-[#3A4650]'];
  return (
    <Painel titulo="Jogadores">
      {membros === null ? (
        <p className="text-sm text-text-tertiary">Carregando…</p>
      ) : membros.length === 0 ? (
        <p className="text-sm text-text-tertiary">Sem membros ainda.</p>
      ) : (
        <>
          <div className="flex">
            {preview.map((m, i) => (
              <Link
                key={m.id}
                href={`/jogadores/${m.jogador.id}`}
                className={[
                  'grid h-9 w-9 place-items-center rounded-full border-2 border-panel font-display text-sm text-white first:ml-0 -ml-2 hover:z-10',
                  cores[i % cores.length],
                ].join(' ')}
                title={m.jogador.nome}
              >
                {m.jogador.avatarInicial}
              </Link>
            ))}
            {restante > 0 && (
              <span className="-ml-2 grid h-9 w-9 place-items-center rounded-full border-2 border-panel bg-border-strong text-[11px] font-bold text-text-secondary">
                +{restante}
              </span>
            )}
          </div>
          <p className="mt-3 font-display text-2xl uppercase">
            {membros.length} {membros.length === 1 ? 'jogador' : 'jogadores'}
          </p>
          <Link
            href={`/peladas/${slug}/ranking`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-accent hover:underline"
          >
            Ver ranking →
          </Link>
        </>
      )}
    </Painel>
  );
}

function BotoesInteracao({ peladaId, aberta }: { peladaId: string; aberta: boolean }) {
  const [seguindo, setSeguindo] = useState(false);

  const toggle = async () => {
    try {
      if (seguindo) {
        await api.delete(`/peladas/${peladaId}/follow`, { auth: true });
        setSeguindo(false);
      } else {
        await api.post(`/peladas/${peladaId}/follow`, undefined, { auth: true });
        setSeguindo(true);
      }
    } catch {
      /* noop */
    }
  };

  return (
    <div className="mt-10 flex flex-col gap-4" id="candidatar">
      <div>
        <Botao variante="secundario" onClick={toggle}>
          {seguindo ? 'Seguindo ✓' : 'Seguir pelada'}
        </Botao>
      </div>
      {aberta && <Candidatar peladaId={peladaId} />}
    </div>
  );
}

function Candidatar({ peladaId }: { peladaId: string }) {
  const [mensagem, setMensagem] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const submeter = async () => {
    setErro(null);
    setEnviando(true);
    try {
      await api.post(`/peladas/${peladaId}/candidaturas`, { mensagem }, { auth: true });
      setEnviado(true);
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro');
    } finally {
      setEnviando(false);
    }
  };

  if (enviado) {
    return (
      <section className="border border-accent bg-accent/10 p-4 text-sm text-accent">
        Candidatura enviada! O dono vai avaliar em breve.
      </section>
    );
  }

  return (
    <section className="border border-border-strong bg-panel p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Quer entrar nessa pelada?
      </p>
      <textarea
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder="Mensagem (opcional)"
        rows={2}
        className="mt-3 w-full border border-border-strong bg-panel-2 p-3 text-sm outline-none focus:border-accent"
      />
      {erro && <p className="mt-2 text-sm text-coral">{erro}</p>}
      <div className="mt-3">
        <Botao onClick={submeter} carregando={enviando}>
          Candidatar-se
        </Botao>
      </div>
    </section>
  );
}

function BadgePlano({
  children,
  acento,
}: {
  children: React.ReactNode;
  acento?: boolean;
}) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
        acento
          ? 'bg-accent text-[#0B0D10]'
          : 'border border-border-strong bg-panel-2 text-text-secondary',
      ].join(' ')}
    >
      {children}
    </span>
  );
}

function IconePin() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21.5s7-7.2 7-12.6a7 7 0 1 0-14 0c0 5.4 7 12.6 7 12.6Z" />
      <circle cx="12" cy="8.8" r="2.4" />
    </svg>
  );
}

function IconeCalendario() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </svg>
  );
}

function IconeTrofeu() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5" />
      <path d="M12 13v3M9 20h6M9.5 20c0-2 .8-3 2.5-3s2.5 1 2.5 3" />
    </svg>
  );
}

function IconeGrupo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17.3" cy="9" r="2.3" />
      <path d="M16 14.4c2.6.5 4.3 2.5 4.3 5.6" />
    </svg>
  );
}

function IconeVisibilidade() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
