'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AdicionarJogadorPartidaBody,
  EventoPartidaDTO,
  FuncaoPartida,
  ModoDesempate,
  PartidaAoVivo,
  RankingTime,
  TimeDTO,
  TipoEvento,
} from '@peladafc/contracts';
import { ROTULOS_MODO_DESEMPATE } from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { IconeGoleiro, IconeLinha } from '@/components/icones-funcao';
import { api, ApiError } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';
import { useChrome } from '@/lib/chrome-context';
import { corLegivel } from '@/lib/cor';
import { tocar, useSom } from '@/lib/sons';
import { useLongPress } from '@/lib/use-long-press';
import { useTimer } from '@/lib/use-timer';
import { useWakeLock } from '@/lib/use-wake-lock';

type JogadorLinha = TimeDTO['jogadores'][number];

interface Selecao {
  teamId: string;
  time: TimeDTO;
  jogadorId: string | null;
  jogadorNome?: string;
  tipo: TipoEvento;
}

interface MenuJogadorState {
  jogador: JogadorLinha;
  timeDoJogador: TimeDTO;
  outrosTimes: TimeDTO[];
}

interface AssistSheetState {
  teamId: string;
  time: TimeDTO;
  jogadorId: string;
  jogadorNome: string;
}

export default function AoVivoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { estado } = useAuth();
  const [partida, setPartida] = useState<PartidaAoVivo | null>(null);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const [menu, setMenu] = useState<MenuJogadorState | null>(null);
  const [adicionandoJogador, setAdicionandoJogador] = useState(false);
  const [perguntarAssist, setPerguntarAssist] = useState<AssistSheetState | null>(null);
  const [mostrarReservas, setMostrarReservas] = useState(false);
  // Substituição iniciada pela coluna do time: abre o sheet de reservas já
  // com o time destino pré-selecionado (pula o passo de "em qual time?").
  const [substituirEmTime, setSubstituirEmTime] = useState<TimeDTO | null>(null);
  // Sheet "tempo esgotado" — mostrada uma vez quando o cronômetro bate
  // `duracaoMinutos`. Confirmação evita finalizar sem querer (permite
  // acréscimos). Flag persistida em sessionStorage pra não reaparecer no F5.
  const [mostrarTempoEsgotado, setMostrarTempoEsgotado] = useState(false);
  const [tempoEsgotadoVisto, setTempoEsgotadoVisto] = useState(false);
  // Ao clicar "+ gol" na coluna do time, abre uma sheet pra escolher qual
  // jogador foi o autor (evita cadastrar gol anônimo por engano quando quem
  // marcou está no meio da lista).
  const [escolhendoAutorGol, setEscolhendoAutorGol] = useState<TimeDTO | null>(null);
  // Sub-fluxo de substituição: reserva escolhido (com nome/avatar), depois
  // usuário escolhe time destino (se >1 time em campo) e quem sai.
  const [substituindo, setSubstituindo] = useState<
    | { entra: { jogadorId: string; nome: string; avatarInicial: string } }
    | null
  >(null);
  // Após escolher o time, guardamos aqui pra abrir a seleção de "quem sai".
  const [subTimeDest, setSubTimeDest] = useState<TimeDTO | null>(null);
  // Racha 3+ times: sheet aberta quando um time em campo bate a meta e o
  // usuário precisa confirmar quem entra na próxima rodada.
  const [fimDeRodada, setFimDeRodada] = useState<
    | { vencedorTeamId: string; perdedorTeamId: string }
    | null
  >(null);
  // Racha 3+ times: sheet de troca dos times em campo (só em `agendada`).
  const [trocandoEmCampo, setTrocandoEmCampo] = useState<
    | { ladoAlvo: 0 | 1 }
    | null
  >(null);
  const [enviando, setEnviando] = useState(false);

  // Mantém a tela ligada enquanto a partida está ao vivo.
  useWakeLock(partida?.status === 'em_andamento');

  // Modo tela cheia: oculta o Cabecalho global e chama a Fullscreen API do
  // browser. Ativado só nesta tela — ao desmontar, restaura tudo.
  const { setOcultarMenu } = useChrome();
  const [telaCheia, setTelaCheia] = useState(false);

  useEffect(() => {
    setOcultarMenu(telaCheia);
    return () => setOcultarMenu(false);
  }, [telaCheia, setOcultarMenu]);

  // Sincroniza estado com a Fullscreen API (usuário pode sair via ESC).
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setTelaCheia(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const alternarTelaCheia = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      setTelaCheia(false);
    } else {
      const req = document.documentElement.requestFullscreen?.();
      if (req) {
        void req.then(() => setTelaCheia(true)).catch(() => setTelaCheia(true));
      } else {
        // Browser sem Fullscreen API (iOS Safari antigo) — ainda oculta chrome.
        setTelaCheia(true);
      }
    }
  }, []);

  const { mudo, alternar: alternarMudo } = useSom();

  // Cronômetro (usado aqui pra disparar a sheet de tempo esgotado e passar o
  // `formatado`/`segundos` pro header). O hook é derivado — não é problema
  // instanciar aqui e também no CabecalhoAoVivo.
  const timer = useTimer(partida ?? { iniciadoEm: null, pausadoEm: null, finalizadoEm: null, duracaoPausadaSegundos: 0 });

  // Restaura flag "usuário já viu a sheet de tempo esgotado" (persistida em
  // sessionStorage pra não reaparecer no F5). Roda uma vez ao carregar o id.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const visto = window.sessionStorage.getItem(`pelada-fc:tempo-esgotado-visto:${id}`) === '1';
    setTempoEsgotadoVisto(visto);
    setMostrarTempoEsgotado(false);
  }, [id]);

  const carregar = useCallback(async () => {
    const p = await api.get<PartidaAoVivo>(`/partidas/${id}`, { auth: true });
    setPartida(p);
    // Modo "gol de ouro aguardando" — se o placar deixou de estar empatado
    // depois do usuário passar pelo /desempate, finaliza automaticamente.
    if (
      p.status === 'em_andamento' &&
      p.placarTimeA !== p.placarTimeB &&
      typeof window !== 'undefined' &&
      window.sessionStorage.getItem(`pelada-fc:gol-de-ouro:${id}`) === '1'
    ) {
      window.sessionStorage.removeItem(`pelada-fc:gol-de-ouro:${id}`);
      try {
        await api.post(`/partidas/${id}/finalizar`, {}, { auth: true });
        const finalizada = await api.get<PartidaAoVivo>(`/partidas/${id}`, { auth: true });
        setPartida(finalizada);
        return finalizada;
      } catch {
        // Ignora — usuário consegue finalizar manualmente.
      }
    }
    return p;
  }, [id]);

  useEffect(() => {
    if (estado.status === 'anonimo') {
      router.replace(`/entrar?redirect=/partidas/${id}/ao-vivo`);
      return;
    }
    if (estado.status !== 'autenticado') return;
    let cancelado = false;
    (async () => {
      try {
        await carregar();
      } catch (err) {
        if (cancelado) return;
        setErroCarregar(
          err instanceof ApiError && err.status === 404 ? 'Partida não encontrada' : 'Erro ao carregar',
        );
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [carregar, estado.status, id, router]);

  useEffect(() => {
    if (partida?.status === 'finalizada') router.replace(`/partidas/${id}/resumo`);
  }, [partida?.status, id, router]);

  const times = useMemo(() => ordenarTimes(partida?.times ?? []), [partida?.times]);
  // Racha de 3+ times: emCampoTeamIds define quais 2 jogam agora. Fallback
  // pros 2 primeiros pra suportar partidas legadas anteriores à feature.
  const emCampoIds = useMemo<[string, string] | null>(() => {
    if (!partida) return null;
    if (partida.emCampoTeamIds.length === 2)
      return [partida.emCampoTeamIds[0]!, partida.emCampoTeamIds[1]!];
    if (times.length >= 2) return [times[0]!.id, times[1]!.id];
    return null;
  }, [partida, times]);
  const timesEmCampoAtivos = useMemo(() => {
    if (!emCampoIds) return times.slice(0, 2);
    const [a, b] = emCampoIds;
    // Preserva a ordem [a, b] (não a ordem alfabética) — o cliente controla
    // qual é "esquerda" (teamA) e qual é "direita" (teamB) no placar.
    return [times.find((t) => t.id === a), times.find((t) => t.id === b)].filter(
      (t): t is TimeDTO => t != null,
    );
  }, [emCampoIds, times]);
  const timesAguardando = useMemo(() => {
    if (!emCampoIds) return [];
    return times.filter((t) => !emCampoIds.includes(t.id));
  }, [emCampoIds, times]);
  // Placar da rodada atual (escopado por rodada_encerrada em 3+ times).
  const placarPorTime = useMemo(() => {
    if (!partida) return new Map<string, number>();
    return contarGolsPorTime(partida.eventos, times);
  }, [partida, times]);
  // Ranking por teamId pra render rápido do foguinho.
  const rankingPorTime = useMemo(() => {
    const mapa = new Map<string, RankingTime>();
    for (const r of partida?.ranking ?? []) mapa.set(r.teamId, r);
    return mapa;
  }, [partida?.ranking]);

  // Racha 3+ times: quando um time em campo atinge a meta, abre a sheet de
  // fim de rodada. Só dispara em `em_andamento` e com sheet fechada.
  useEffect(() => {
    if (!partida) return;
    if (partida.status !== 'em_andamento') return;
    if (partida.times.length < 3) return;
    if (fimDeRodada) return;
    if (partida.emCampoTeamIds.length !== 2) return;
    if (partida.metaGols == null) return;
    const a = partida.emCampoTeamIds[0]!;
    const b = partida.emCampoTeamIds[1]!;
    const gA = placarPorTime.get(a) ?? 0;
    const gB = placarPorTime.get(b) ?? 0;
    if (gA >= partida.metaGols && gA > gB) {
      setFimDeRodada({ vencedorTeamId: a, perdedorTeamId: b });
    } else if (gB >= partida.metaGols && gB > gA) {
      setFimDeRodada({ vencedorTeamId: b, perdedorTeamId: a });
    }
  }, [partida, placarPorTime, fimDeRodada]);

  // Fim do tempo: quando o cronômetro atinge `duracaoMinutos`, abre a sheet
  // de confirmação (não finaliza sozinho — permite acréscimos) e auto-pausa
  // o cronômetro pra congelar o tempo no ponto do fim. Só dispara uma vez
  // por sessão do usuário; o `Continuar` retoma o cronômetro.
  useEffect(() => {
    if (!partida) return;
    if (partida.status !== 'em_andamento') return;
    if (partida.duracaoMinutos == null) return;
    if (tempoEsgotadoVisto || mostrarTempoEsgotado) return;
    if (fimDeRodada) return;
    const limite = partida.duracaoMinutos * 60;
    if (timer.segundos < limite) return;
    setMostrarTempoEsgotado(true);
    tocar('tempoEsgotado');
    if (partida.pausadoEm == null) {
      (async () => {
        try {
          await api.post(`/partidas/${id}/pausar`, {}, { auth: true });
          await carregar();
        } catch {
          // ignora — a sheet ainda funciona; só o timer não pausa
        }
      })();
    }
  }, [partida, timer.segundos, tempoEsgotadoVisto, mostrarTempoEsgotado, fimDeRodada, id, carregar]);

  const marcarTempoEsgotadoVisto = useCallback(() => {
    setTempoEsgotadoVisto(true);
    setMostrarTempoEsgotado(false);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(`pelada-fc:tempo-esgotado-visto:${id}`, '1');
    }
  }, [id]);

  const continuarComAcrescimos = useCallback(async () => {
    marcarTempoEsgotadoVisto();
    if (partida?.pausadoEm != null) {
      try {
        await api.post(`/partidas/${id}/retomar`, {}, { auth: true });
        await carregar();
      } catch {
        // ignora — usuário pode retomar manualmente pelo botão do header
      }
    }
  }, [id, partida?.pausadoEm, marcarTempoEsgotadoVisto, carregar]);
  // Função (goleiro/linha) por jogador vem de Attendance — o server cria uma
  // linha por jogador em partida standalone. Se faltar, default linha.
  const funcaoPorJogador = useMemo(() => {
    const mapa = new Map<string, FuncaoPartida>();
    for (const p of partida?.presencas ?? []) mapa.set(p.jogadorId, p.funcao);
    return mapa;
  }, [partida?.presencas]);
  // Reservas = Attendance.status='lista_espera'. Titulares aparecem no
  // scoreboard como tap-target; reservas só via sheet "Reservas".
  const reservaPorJogador = useMemo(() => {
    const set = new Set<string>();
    for (const p of partida?.presencas ?? []) {
      if (p.status === 'lista_espera') set.add(p.jogadorId);
    }
    return set;
  }, [partida?.presencas]);
  // Times filtrados: só titulares dos 2 times em campo. Reserva só aparece
  // via sheet "Reservas"; time aguardando (racha 3+) só aparece via ranking.
  const timesEmCampo = useMemo(() => {
    return timesEmCampoAtivos.map((t) => ({
      ...t,
      jogadores: t.jogadores.filter((tp) => !reservaPorJogador.has(tp.jogadorId)),
    }));
  }, [timesEmCampoAtivos, reservaPorJogador]);
  // Reservas: TODOS jogadores com Attendance.status='lista_espera',
  // independente de time. Reserva geral (sem TeamPlayer) e reserva-de-time
  // (com TeamPlayer mas rebaixado) coexistem — no sheet ambos aparecem
  // juntos e o usuário escolhe pra qual time entram.
  //
  // Fonte: partida.presencas (que sempre lista todos, mesmo sem TeamPlayer).
  // Ignora times aguardando (racha 3+) — esses times entram inteiros via
  // outra rota (troca de rodada).
  const jogadoresDosTimesEmCampo = useMemo(() => {
    const set = new Set<string>();
    for (const t of timesEmCampoAtivos) {
      for (const tp of t.jogadores) set.add(tp.jogadorId);
    }
    return set;
  }, [timesEmCampoAtivos]);
  const reservas = useMemo(() => {
    if (!partida) return [];
    return partida.presencas
      .filter((p) => p.status === 'lista_espera')
      .map((p) => ({
        jogadorId: p.jogadorId,
        nome: p.jogador.nome,
        avatarInicial: p.jogador.avatarInicial,
        funcao: p.funcao,
      }));
  }, [partida]);
  // Corte de eventos: só considera a rodada atual (após a última âncora
  // `rodada_encerrada`). Gols e expulsões da rodada anterior somem do
  // scoreboard — a soma total só volta na tela de resumo do racha.
  const cortePorRodada = useMemo(() => {
    let cutoff: Date | null = null;
    for (const e of partida?.eventos ?? []) {
      if (e.tipo !== 'rodada_encerrada') continue;
      if (!cutoff || e.criadoEm > cutoff) cutoff = e.criadoEm;
    }
    return cutoff;
  }, [partida?.eventos]);
  // Gols marcados por cada jogador na rodada atual (só gol normal — gol
  // contra não conta pro artilheiro do jogador que fez).
  const golsPorJogador = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const e of partida?.eventos ?? []) {
      if (e.tipo !== 'gol' || !e.jogadorId) continue;
      if (cortePorRodada && e.criadoEm <= cortePorRodada) continue;
      mapa.set(e.jogadorId, (mapa.get(e.jogadorId) ?? 0) + 1);
    }
    return mapa;
  }, [partida?.eventos, cortePorRodada]);
  const expulsos = useMemo(() => {
    const set = new Set<string>();
    for (const e of partida?.eventos ?? []) {
      if (e.tipo !== 'expulsao' || !e.jogadorId) continue;
      if (cortePorRodada && e.criadoEm <= cortePorRodada) continue;
      set.add(e.jogadorId);
    }
    return set;
  }, [partida?.eventos, cortePorRodada]);

  // Último gol (normal ou contra) marcado por cada jogador na rodada atual.
  // Usado pela ação "Remover último gol" no menu do jogador — permite
  // corrigir atribuição errada sem precisar desfazer todos os gols seguintes.
  const ultimoGolPorJogador = useMemo(() => {
    const mapa = new Map<string, EventoPartidaDTO>();
    for (const e of partida?.eventos ?? []) {
      if (e.tipo !== 'gol' && e.tipo !== 'gol_contra') continue;
      if (!e.jogadorId) continue;
      if (cortePorRodada && e.criadoEm <= cortePorRodada) continue;
      const anterior = mapa.get(e.jogadorId);
      if (!anterior || e.criadoEm > anterior.criadoEm) mapa.set(e.jogadorId, e);
    }
    return mapa;
  }, [partida?.eventos, cortePorRodada]);

  if (erroCarregar) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-coral">{erroCarregar}</p>
      </main>
    );
  }
  if (!partida) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-text-secondary">Carregando…</p>
      </main>
    );
  }
  if (times.length < 2) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-coral">Partida sem times</p>
      </main>
    );
  }

  const iniciar = async () => {
    setErro(null);
    try {
      await api.post(`/partidas/${id}/iniciar`, {}, { auth: true });
      tocar('apitoInicio');
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao iniciar');
    }
  };

  // Racha 3+ times: troca quais 2 times estão em campo (só em `agendada` ou
  // entre rodadas). Body espera [teamA, teamB]; UI passa a nova dupla.
  const trocarEmCampo = async (novosIds: [string, string]) => {
    setErro(null);
    try {
      await api.post(
        `/partidas/${id}/em-campo`,
        { emCampoTeamIds: novosIds },
        { auth: true },
      );
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao trocar times');
    }
  };

  // Racha 3+ times: refaz a distribuição dos jogadores entre os times atuais.
  // Só disponível em `agendada`. Usa 5 na linha como default.
  const resortear = async () => {
    setErro(null);
    setEnviando(true);
    try {
      await api.post(
        `/partidas/${id}/resortear`,
        { jogadoresLinha: 5 },
        { auth: true },
      );
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao sortear');
    } finally {
      setEnviando(false);
    }
  };

  // Racha 3+ times: encerra a rodada atual — grava âncora, atualiza ranking,
  // rotaciona times em campo (perdedor sai, entraTeamId entra ou primeiro da
  // fila). Chamado pela sheet de fim de rodada.
  const encerrarRodada = async (vencedorTeamId: string, entraTeamId: string | null) => {
    setErro(null);
    setEnviando(true);
    try {
      await api.post(
        `/partidas/${id}/encerrar-rodada`,
        { vencedorTeamId, entraTeamId },
        { auth: true },
      );
      tocar('apitoFim');
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao encerrar rodada');
    } finally {
      setEnviando(false);
    }
  };

  const marcarEvento = async (
    teamId: string,
    jogadorId: string | null,
    tipo: TipoEvento = 'gol',
    assistenteJogadorId: string | null = null,
  ) => {
    setErro(null);
    setEnviando(true);
    try {
      await api.post(
        `/partidas/${id}/eventos`,
        { teamId, jogadorId, assistenteJogadorId, tipo },
        { auth: true },
      );
      if (tipo === 'gol' || tipo === 'gol_contra') tocar('gol');
      setSelecao(null);
      setPerguntarAssist(null);
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao registrar');
    } finally {
      setEnviando(false);
    }
  };

  // Após confirmar um gol normal com autor identificado, o próximo passo é
  // perguntar "quem deu a assistência?". Gol contra, gol sem autor ou tipos
  // não-gol pulam essa etapa.
  const confirmarSelecao = async (sel: Selecao) => {
    if (sel.tipo === 'gol' && sel.jogadorId && sel.jogadorNome) {
      // Grava o gol primeiro (assist=null) — assim se o usuário sair da tela,
      // o placar já está atualizado. A assist pode ser preenchida via reload.
      // Optamos por: gravar gol sem assist E, se o usuário responder,
      // gravamos o gol atualizando o mesmo evento? Simpler: perguntar antes
      // de gravar — cabe no fluxo mobile de 2 taps.
      setSelecao(null);
      setPerguntarAssist({
        teamId: sel.teamId,
        time: sel.time,
        jogadorId: sel.jogadorId,
        jogadorNome: sel.jogadorNome,
      });
      return;
    }
    await marcarEvento(sel.teamId, sel.jogadorId, sel.tipo, null);
  };

  const expulsar = async (jogadorId: string, timeDoJogador: TimeDTO) => {
    setErro(null);
    try {
      await api.post(
        `/partidas/${id}/eventos`,
        { teamId: timeDoJogador.id, jogadorId, tipo: 'expulsao' },
        { auth: true },
      );
      setMenu(null);
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao expulsar');
    }
  };

  const desfazer = async () => {
    const ultimo = ultimoEventoReversivel(partida.eventos);
    if (!ultimo) return;
    setErro(null);
    try {
      await api.delete(`/partidas/${id}/eventos/${ultimo.id}`, { auth: true });
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao desfazer');
    }
  };

  const pausar = async () => {
    setErro(null);
    try {
      await api.post(`/partidas/${id}/${partida.pausadoEm ? 'retomar' : 'pausar'}`, {}, { auth: true });
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro');
    }
  };

  const finalizar = async () => {
    setErro(null);
    try {
      await api.post(`/partidas/${id}/finalizar`, {}, { auth: true });
      tocar('apitoFim');
      await carregar();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        router.push(`/partidas/${id}/desempate`);
        return;
      }
      setErro(isApiError(err) ? err.mensagem : 'Erro ao finalizar');
    }
  };

  const adicionarJogador = async (nome: string, funcao: FuncaoPartida) => {
    setErro(null);
    setEnviando(true);
    try {
      // Durante a partida só adicionamos como reserva (teamId=null); pra entrar
      // em campo o usuário usa o fluxo de substituição.
      const body: AdicionarJogadorPartidaBody = { teamId: null, nome, funcao };
      await api.post(`/partidas/${id}/jogadores`, body, { auth: true });
      setAdicionandoJogador(false);
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro');
    } finally {
      setEnviando(false);
    }
  };

  // Remove um evento específico (usado pela ação "Remover último gol" no
  // menu do jogador). Diferente do desfazer global, que sempre apaga o último
  // gol/gol_contra da partida — este permite corrigir gol atribuído a jogador
  // errado sem apagar os que vieram depois.
  const removerEvento = async (eventoId: string) => {
    setErro(null);
    try {
      await api.delete(`/partidas/${id}/eventos/${eventoId}`, { auth: true });
      setMenu(null);
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao remover');
    }
  };

  const substituir = async (entraId: string, saiId: string | null, teamId: string | null) => {
    setErro(null);
    setEnviando(true);
    try {
      await api.post(
        `/partidas/${id}/substituir`,
        { entraId, saiId, teamId },
        { auth: true },
      );
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro');
    } finally {
      setEnviando(false);
    }
  };

  const abrirMenuJogador = (jogador: JogadorLinha, timeDoJogador: TimeDTO) => {
    setMenu({
      jogador,
      timeDoJogador,
      outrosTimes: times.filter((t) => t.id !== timeDoJogador.id),
    });
  };

  const desabilitado = enviando || partida.status !== 'em_andamento';
  // Substituir/trocar time devem funcionar também em `agendada` — permite
  // ajustar composição antes de iniciar o cronômetro ou entre rodadas.
  const substituirDesabilitado =
    enviando || (partida.status !== 'em_andamento' && partida.status !== 'agendada');
  const temFila = times.length > 2;

  return (
    <main
      className={`${telaCheia ? 'min-h-screen' : 'min-h-[calc(100vh-76px)]'} bg-bg pb-[calc(96px+env(safe-area-inset-bottom))]`}
    >
      <CabecalhoAoVivo
        partida={partida}
        onPausar={pausar}
        telaCheia={telaCheia}
        onAlternarTelaCheia={alternarTelaCheia}
        mudo={mudo}
        onAlternarMudo={alternarMudo}
      />

      {timesEmCampoAtivos[0] && timesEmCampoAtivos[1] && (
        <PlacarGigante
          placarA={placarPorTime.get(timesEmCampoAtivos[0].id) ?? 0}
          placarB={placarPorTime.get(timesEmCampoAtivos[1].id) ?? 0}
          timeA={timesEmCampoAtivos[0]}
          timeB={timesEmCampoAtivos[1]}
          streakA={rankingPorTime.get(timesEmCampoAtivos[0].id)?.streakVitorias ?? 0}
          streakB={rankingPorTime.get(timesEmCampoAtivos[1].id)?.streakVitorias ?? 0}
          metaGols={partida.metaGols}
          rodadaAtual={temFila ? partida.rodadaAtual : null}
          onTrocarLadoA={
            temFila && partida.status === 'agendada'
              ? () => setTrocandoEmCampo({ ladoAlvo: 0 })
              : undefined
          }
          onTrocarLadoB={
            temFila && partida.status === 'agendada'
              ? () => setTrocandoEmCampo({ ladoAlvo: 1 })
              : undefined
          }
        />
      )}

      {temFila && timesAguardando.length > 0 && (
        <p className="mx-auto max-w-md px-4 text-center text-[11px] uppercase tracking-wider text-text-tertiary">
          ⏳ Aguardando: {timesAguardando.map((t) => t.nome).join(' · ')}
        </p>
      )}

      {reservas.length > 0 && (
        <div className="mx-auto max-w-md px-4 pt-3 text-center">
          <button
            type="button"
            onClick={() => setMostrarReservas(true)}
            className="inline-flex h-9 items-center gap-2 border border-ciano bg-panel px-3 font-display text-xs uppercase tracking-wider text-ciano transition-colors hover:bg-ciano/10"
          >
            🪑 Reservas ({reservas.length})
          </button>
        </div>
      )}

      {partida.status === 'agendada' && (
        <div className="mx-auto flex max-w-md flex-col gap-2 px-4 py-4">
          {temFila && (
            <Botao
              onClick={resortear}
              variante="secundario"
              className="h-12 w-full text-sm"
              carregando={enviando}
            >
              🎲 Sortear novamente
            </Botao>
          )}
          <Botao onClick={iniciar} className="h-14 w-full text-base">
            Iniciar cronômetro
          </Botao>
        </div>
      )}

      <p className="mx-auto max-w-md px-4 pt-3 text-center text-[11px] uppercase tracking-wider text-text-tertiary">
        Toque = gol · Segure = opções (gol contra)
      </p>

      {timesEmCampo[0] && timesEmCampo[1] && (
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2 px-4 pt-2">
          <ColunaTime
            time={timesEmCampo[0]}
            funcaoPorJogador={funcaoPorJogador}
            golsPorJogador={golsPorJogador}
            expulsos={expulsos}
            onTapJogador={(jogador) => abrirSelecaoGol(timesEmCampoAtivos[0]!, jogador, setSelecao)}
            onLongPress={(jogador) => abrirMenuJogador(jogador, timesEmCampoAtivos[0]!)}
            onAdicionarGol={() => setEscolhendoAutorGol(timesEmCampoAtivos[0]!)}
            onSubstituir={() => setSubstituirEmTime(timesEmCampoAtivos[0]!)}
            desabilitado={desabilitado}
            substituirDesabilitado={substituirDesabilitado}
          />
          <ColunaTime
            time={timesEmCampo[1]}
            funcaoPorJogador={funcaoPorJogador}
            golsPorJogador={golsPorJogador}
            expulsos={expulsos}
            onTapJogador={(jogador) => abrirSelecaoGol(timesEmCampoAtivos[1]!, jogador, setSelecao)}
            onLongPress={(jogador) => abrirMenuJogador(jogador, timesEmCampoAtivos[1]!)}
            onAdicionarGol={() => setEscolhendoAutorGol(timesEmCampoAtivos[1]!)}
            onSubstituir={() => setSubstituirEmTime(timesEmCampoAtivos[1]!)}
            desabilitado={desabilitado}
            substituirDesabilitado={substituirDesabilitado}
          />
        </div>
      )}

      {erro && (
        <div className="mx-auto max-w-md px-4 pt-4">
          <p className="text-sm text-coral">{erro}</p>
        </div>
      )}

      {/* Barra inferior só faz sentido durante a partida — em `agendada` os
          botões Desfazer/Finalizar não têm o que fazer. */}
      {partida.status === 'em_andamento' && (
        <BarraFerramentas
          onDesfazer={desfazer}
          onFinalizar={finalizar}
          ultimoReversivel={ultimoEventoReversivel(partida.eventos)}
          times={times}
          finalizavel={partida.status === 'em_andamento'}
        />
      )}

      {escolhendoAutorGol && (
        <SheetEscolherAutorGol
          time={escolhendoAutorGol}
          onCancelar={() => setEscolhendoAutorGol(null)}
          onEscolher={(jogador) => {
            const time = escolhendoAutorGol;
            setEscolhendoAutorGol(null);
            abrirSelecaoGol(time, jogador, setSelecao);
          }}
          onSemAutor={() => {
            const time = escolhendoAutorGol;
            setEscolhendoAutorGol(null);
            abrirSelecaoGol(time, null, setSelecao);
          }}
        />
      )}

      {selecao && (
        <BottomSheetGol
          selecao={selecao}
          onConfirmar={() => confirmarSelecao(selecao)}
          onCancelar={() => setSelecao(null)}
          enviando={enviando}
        />
      )}

      {perguntarAssist && (
        <SheetAssist
          estado={perguntarAssist}
          enviando={enviando}
          onSemAssist={() =>
            marcarEvento(perguntarAssist.teamId, perguntarAssist.jogadorId, 'gol', null)
          }
          onAssist={(assisteId) =>
            marcarEvento(perguntarAssist.teamId, perguntarAssist.jogadorId, 'gol', assisteId)
          }
          onCancelar={() => setPerguntarAssist(null)}
        />
      )}

      {menu && (
        <MenuJogador
          jogador={menu.jogador}
          timeDoJogador={menu.timeDoJogador}
          outrosTimes={menu.outrosTimes}
          expulso={expulsos.has(menu.jogador.jogadorId)}
          ultimoGolId={ultimoGolPorJogador.get(menu.jogador.jogadorId)?.id ?? null}
          onFechar={() => setMenu(null)}
          onEscolherGol={() => {
            setSelecao({
              teamId: menu.timeDoJogador.id,
              time: menu.timeDoJogador,
              jogadorId: menu.jogador.jogadorId,
              jogadorNome: menu.jogador.jogador.nome,
              tipo: 'gol',
            });
            setMenu(null);
          }}
          onEscolherGolContra={(timeBeneficiado) => {
            setSelecao({
              teamId: timeBeneficiado.id,
              time: timeBeneficiado,
              jogadorId: menu.jogador.jogadorId,
              jogadorNome: menu.jogador.jogador.nome,
              tipo: 'gol_contra',
            });
            setMenu(null);
          }}
          onRemoverGol={(eventoId) => removerEvento(eventoId)}
          onExpulsar={() => expulsar(menu.jogador.jogadorId, menu.timeDoJogador)}
        />
      )}

      {adicionandoJogador && (
        <SheetAdicionarJogador
          enviando={enviando}
          onCancelar={() => setAdicionandoJogador(false)}
          onSalvar={adicionarJogador}
        />
      )}

      {mostrarReservas && (
        <SheetReservas
          reservas={reservas}
          onFechar={() => setMostrarReservas(false)}
          onAdicionarJogador={() => {
            setMostrarReservas(false);
            setAdicionandoJogador(true);
          }}
          onColocarEmCampo={(item) => {
            setMostrarReservas(false);
            setSubstituindo({ entra: item });
            // Se só tem 1 time em campo, entra direto nele — pula o passo de
            // escolher time e vai pro passo de "quem sai" (ou entrar sem sair).
            if (timesEmCampoAtivos.length === 1) {
              setSubTimeDest(timesEmCampoAtivos[0]!);
            }
          }}
        />
      )}

      {/* Substituição iniciada pela coluna do time: reusa SheetReservas com
          o time pré-selecionado — na escolha da reserva, já seta subTimeDest
          e vai direto pro "quem sai". */}
      {substituirEmTime && (
        <SheetReservas
          reservas={reservas}
          timeAlvo={substituirEmTime}
          onFechar={() => setSubstituirEmTime(null)}
          onAdicionarJogador={() => {
            setSubstituirEmTime(null);
            setAdicionandoJogador(true);
          }}
          onColocarEmCampo={(item) => {
            const alvo = substituirEmTime;
            setSubstituirEmTime(null);
            setSubstituindo({ entra: item });
            setSubTimeDest(alvo);
          }}
        />
      )}

      {mostrarTempoEsgotado && partida.duracaoMinutos != null && (
        <SheetTempoEsgotado
          duracaoMinutos={partida.duracaoMinutos}
          modoRacha={temFila}
          modoDesempate={partida.modoDesempate}
          placarEmCampo={
            timesEmCampoAtivos[0] && timesEmCampoAtivos[1]
              ? {
                  a: {
                    time: timesEmCampoAtivos[0],
                    gols: placarPorTime.get(timesEmCampoAtivos[0].id) ?? 0,
                  },
                  b: {
                    time: timesEmCampoAtivos[1],
                    gols: placarPorTime.get(timesEmCampoAtivos[1].id) ?? 0,
                  },
                }
              : null
          }
          enviando={enviando}
          onContinuar={continuarComAcrescimos}
          onFinalizarPartida={async () => {
            marcarTempoEsgotadoVisto();
            await finalizar();
          }}
          onIrParaDesempate={() => {
            marcarTempoEsgotadoVisto();
            router.push(`/partidas/${id}/desempate`);
          }}
          onEncerrarRodada={(vencedorTeamId, perdedorTeamId) => {
            marcarTempoEsgotadoVisto();
            setFimDeRodada({ vencedorTeamId, perdedorTeamId });
          }}
        />
      )}

      {substituindo && !subTimeDest && (
        <SheetEscolherTime
          entra={substituindo.entra}
          timesDisponiveis={timesEmCampoAtivos}
          onCancelar={() => setSubstituindo(null)}
          onEscolher={(time) => setSubTimeDest(time)}
        />
      )}

      {substituindo && subTimeDest && (
        <SheetEscolherQuemSai
          entra={substituindo.entra}
          time={subTimeDest}
          titularesEmCampo={
            timesEmCampo.find((t) => t.id === subTimeDest.id)?.jogadores ?? []
          }
          enviando={enviando}
          onCancelar={() => {
            setSubstituindo(null);
            setSubTimeDest(null);
          }}
          onEntrarSemTrocar={async () => {
            await substituir(substituindo.entra.jogadorId, null, subTimeDest.id);
            setSubstituindo(null);
            setSubTimeDest(null);
          }}
          onTrocar={async (saiId) => {
            await substituir(substituindo.entra.jogadorId, saiId, subTimeDest.id);
            setSubstituindo(null);
            setSubTimeDest(null);
          }}
        />
      )}

      {trocandoEmCampo && emCampoIds && (
        <SheetTrocarEmCampo
          candidatos={timesAguardando}
          onCancelar={() => setTrocandoEmCampo(null)}
          onEscolher={async (novoTeamId) => {
            const outroLado = trocandoEmCampo.ladoAlvo === 0 ? emCampoIds[1] : emCampoIds[0];
            const novosIds: [string, string] =
              trocandoEmCampo.ladoAlvo === 0 ? [novoTeamId, outroLado] : [outroLado, novoTeamId];
            setTrocandoEmCampo(null);
            await trocarEmCampo(novosIds);
          }}
        />
      )}

      {fimDeRodada && (
        <SheetFimDeRodada
          vencedor={times.find((t) => t.id === fimDeRodada.vencedorTeamId)!}
          perdedor={times.find((t) => t.id === fimDeRodada.perdedorTeamId)!}
          placarVencedor={placarPorTime.get(fimDeRodada.vencedorTeamId) ?? 0}
          placarPerdedor={placarPorTime.get(fimDeRodada.perdedorTeamId) ?? 0}
          eventosDaRodada={partida.eventos}
          aguardando={timesAguardando}
          enviando={enviando}
          onCancelar={() => setFimDeRodada(null)}
          onConfirmar={async (entraTeamId) => {
            await encerrarRodada(fimDeRodada.vencedorTeamId, entraTeamId);
            setFimDeRodada(null);
          }}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------

function abrirSelecaoGol(
  time: TimeDTO,
  jogador: JogadorLinha | null,
  setSelecao: (s: Selecao) => void,
) {
  setSelecao({
    teamId: time.id,
    time,
    jogadorId: jogador?.jogadorId ?? null,
    jogadorNome: jogador?.jogador.nome,
    tipo: 'gol',
  });
}

function ordenarTimes(times: TimeDTO[]): TimeDTO[] {
  return [...times].sort((a, b) => a.nome.localeCompare(b.nome));
}

// Conta gols por time. Se `escoparPorRodada`, conta só eventos após a última
// âncora `rodada_encerrada` (placar da rodada atual em racha de 3+ times).
// Sem escopo, conta desde o início (retro-compat pra partidas de 2 times).
function contarGolsPorTime(
  eventos: EventoPartidaDTO[],
  times: TimeDTO[],
  escoparPorRodada = true,
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const t of times) mapa.set(t.id, 0);
  let cutoff: Date | null = null;
  if (escoparPorRodada) {
    for (const e of eventos) {
      if (e.tipo !== 'rodada_encerrada') continue;
      if (!cutoff || e.criadoEm > cutoff) cutoff = e.criadoEm;
    }
  }
  for (const e of eventos) {
    if (e.tipo === 'penalti_desempate') continue;
    if (e.tipo === 'expulsao') continue;
    if (e.tipo === 'rodada_encerrada') continue;
    if (cutoff && e.criadoEm <= cutoff) continue;
    mapa.set(e.teamId, (mapa.get(e.teamId) ?? 0) + 1);
  }
  return mapa;
}

// Ícone de fogo pela sequência de vitórias na sessão. 2 = 🔥, 4 = 🔥🔥,
// 6+ = 🔥🔥🔥. Retorna string vazia se streak < 2 (sem indicador).
function iconeStreak(streak: number): string {
  if (streak >= 6) return '🔥🔥🔥';
  if (streak >= 4) return '🔥🔥';
  if (streak >= 2) return '🔥';
  return '';
}

// Último evento reversível pelo botão Desfazer. Inclui gol, gol contra,
// expulsão e substituição — não inclui `rodada_encerrada` (âncora de rodada)
// nem `penalti_desempate` (esses têm fluxo próprio).
function ultimoEventoReversivel(eventos: EventoPartidaDTO[]) {
  const reversiveis = eventos.filter(
    (e) =>
      e.tipo === 'gol' ||
      e.tipo === 'gol_contra' ||
      e.tipo === 'expulsao' ||
      e.tipo === 'substituicao',
  );
  return reversiveis[reversiveis.length - 1] ?? null;
}

// ---------------------------------------------------------------------------

function CabecalhoAoVivo({
  partida,
  onPausar,
  telaCheia,
  onAlternarTelaCheia,
  mudo,
  onAlternarMudo,
}: {
  partida: PartidaAoVivo;
  onPausar: () => void;
  telaCheia: boolean;
  onAlternarTelaCheia: () => void;
  mudo: boolean;
  onAlternarMudo: () => void;
}) {
  const { formatado, segundos } = useTimer(partida);
  const pausada = partida.pausadoEm != null;
  const emAndamento = partida.status === 'em_andamento';
  // Colorir o cronômetro perto do fim: amarelo <= 30s restantes, coral (com
  // pulse) quando estourou o tempo. Só ativa se `duracaoMinutos` estiver
  // definido — modo aberto (sem limite) fica sempre com a cor padrão.
  const limite = partida.duracaoMinutos != null ? partida.duracaoMinutos * 60 : null;
  const restante = limite != null ? limite - segundos : null;
  let corTimer = '';
  if (restante != null) {
    if (restante <= 0) corTimer = 'text-coral animate-pulse';
    else if (restante <= 30) corTimer = 'text-dourado';
  }

  const classeBotao =
    'grid h-8 w-8 place-items-center border border-border text-text-secondary hover:text-text hover:border-text-secondary';

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-nav-bg">
      <div className="mx-auto grid max-w-md grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
        <Link
          href="/"
          className="justify-self-start font-display text-xs uppercase tracking-wider text-text-secondary hover:text-text"
        >
          ← Sair
        </Link>
        <span
          className={[
            'justify-self-center font-display text-2xl uppercase tracking-wider tabular-nums',
            corTimer,
          ]
            .join(' ')
            .trim()}
        >
          {formatado}
        </span>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onAlternarMudo}
            aria-label={mudo ? 'Ativar sons' : 'Silenciar sons'}
            title={mudo ? 'Ativar sons' : 'Silenciar sons'}
            className={classeBotao}
          >
            {mudo ? <IconeSomMudo /> : <IconeSom />}
          </button>
          <button
            type="button"
            onClick={onAlternarTelaCheia}
            aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
            title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
            className={classeBotao}
          >
            {telaCheia ? <IconeSairTelaCheia /> : <IconeTelaCheia />}
          </button>
          {emAndamento ? (
            <button
              onClick={onPausar}
              className="font-display text-xs uppercase tracking-wider text-text-secondary hover:text-text"
            >
              {pausada ? 'Retomar' : 'Pausar'}
            </button>
          ) : (
            <span className="font-display text-xs uppercase tracking-wider text-text-tertiary">
              {partida.status}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

function IconeSom() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16 8a5 5 0 010 8" />
      <path d="M19 5a9 9 0 010 14" />
    </svg>
  );
}

function IconeSomMudo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M17 9l5 6M22 9l-5 6" />
    </svg>
  );
}

function IconeTelaCheia() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

function IconeSairTelaCheia() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  );
}

function PlacarGigante({
  placarA,
  placarB,
  timeA,
  timeB,
  metaGols,
  streakA = 0,
  streakB = 0,
  rodadaAtual = null,
  onTrocarLadoA,
  onTrocarLadoB,
}: {
  placarA: number;
  placarB: number;
  timeA: TimeDTO;
  timeB: TimeDTO;
  metaGols: number | null;
  streakA?: number;
  streakB?: number;
  rodadaAtual?: number | null;
  onTrocarLadoA?: () => void;
  onTrocarLadoB?: () => void;
}) {
  const iconeA = iconeStreak(streakA);
  const iconeB = iconeStreak(streakB);
  return (
    <section className="mx-auto max-w-md px-4 py-6">
      {rodadaAtual != null && (
        <p className="mb-2 text-center font-display text-[10px] uppercase tracking-wider text-text-tertiary">
          Rodada {rodadaAtual}
        </p>
      )}
      <div className="grid grid-cols-2 items-end gap-4 text-center">
        <div>
          <p
            className="font-display text-[7.5rem] leading-none tabular-nums"
            style={{ color: corLegivel(timeA.cor, '#F4F5F6') }}
          >
            {placarA}
          </p>
          <p className="mt-1 flex items-center justify-center gap-1 truncate font-display text-sm uppercase tracking-wider">
            {iconeA && <span className="text-base leading-none">{iconeA}</span>}
            <span className="truncate">{timeA.nome}</span>
          </p>
          {onTrocarLadoA && (
            <button
              type="button"
              onClick={onTrocarLadoA}
              className="mx-auto mt-2 inline-flex h-8 items-center gap-1 border border-border-strong bg-panel px-3 font-display text-[11px] uppercase tracking-wider text-text-secondary transition-colors hover:border-accent hover:text-accent"
            >
              ⇄ Trocar
            </button>
          )}
        </div>
        <div>
          <p
            className="font-display text-[7.5rem] leading-none tabular-nums"
            style={{ color: corLegivel(timeB.cor, '#F4F5F6') }}
          >
            {placarB}
          </p>
          <p className="mt-1 flex items-center justify-center gap-1 truncate font-display text-sm uppercase tracking-wider">
            {iconeB && <span className="text-base leading-none">{iconeB}</span>}
            <span className="truncate">{timeB.nome}</span>
          </p>
          {onTrocarLadoB && (
            <button
              type="button"
              onClick={onTrocarLadoB}
              className="mx-auto mt-2 inline-flex h-8 items-center gap-1 border border-border-strong bg-panel px-3 font-display text-[11px] uppercase tracking-wider text-text-secondary transition-colors hover:border-accent hover:text-accent"
            >
              ⇄ Trocar
            </button>
          )}
        </div>
      </div>
      {metaGols != null && (
        <p className="mt-3 text-center text-xs uppercase tracking-wider text-text-tertiary">
          Termina em {metaGols} gol{metaGols > 1 ? 's' : ''}
        </p>
      )}
    </section>
  );
}

function ColunaTime({
  time,
  funcaoPorJogador,
  golsPorJogador,
  expulsos,
  onTapJogador,
  onLongPress,
  onAdicionarGol,
  onSubstituir,
  desabilitado,
  substituirDesabilitado,
}: {
  time: TimeDTO;
  funcaoPorJogador: Map<string, FuncaoPartida>;
  golsPorJogador: Map<string, number>;
  expulsos: Set<string>;
  onTapJogador: (jogador: JogadorLinha) => void;
  onLongPress: (jogador: JogadorLinha) => void;
  onAdicionarGol: () => void;
  onSubstituir: () => void;
  desabilitado: boolean;
  substituirDesabilitado: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p
        className="border-b-2 pb-2 text-center font-display text-xs uppercase tracking-wider"
        style={{ borderColor: time.cor ?? '#262B32' }}
      >
        {time.nome}
      </p>
      {time.jogadores.map((tp) => (
        <BotaoJogador
          key={tp.id}
          jogador={tp}
          funcao={funcaoPorJogador.get(tp.jogadorId) ?? 'linha'}
          gols={golsPorJogador.get(tp.jogadorId) ?? 0}
          expulso={expulsos.has(tp.jogadorId)}
          cor={time.cor}
          desabilitado={desabilitado}
          onTap={() => onTapJogador(tp)}
          onLongPress={() => onLongPress(tp)}
        />
      ))}
      <button
        type="button"
        disabled={desabilitado}
        onClick={onAdicionarGol}
        className="flex h-12 items-center justify-center border border-dashed border-border-strong bg-panel/50 font-display text-xs uppercase tracking-wider text-text-secondary transition-all active:scale-[0.98] active:bg-accent/10 disabled:opacity-40"
      >
        + gol
      </button>
      <button
        type="button"
        onClick={onSubstituir}
        disabled={substituirDesabilitado}
        className="flex h-10 items-center justify-center border border-dashed border-border font-display text-[10px] uppercase tracking-wider text-text-tertiary transition-all active:scale-[0.98] hover:text-text disabled:opacity-40"
      >
        ⇄ Substituição
      </button>
    </div>
  );
}

function BotaoJogador({
  jogador,
  funcao,
  gols,
  expulso,
  cor,
  desabilitado,
  onTap,
  onLongPress,
}: {
  jogador: JogadorLinha;
  funcao: FuncaoPartida;
  gols: number;
  expulso: boolean;
  cor: string | null;
  desabilitado: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  // Expulso não pode marcar gol, mas ainda pode ser inspecionado (long-press
  // continua abrindo o menu — pra rever ou expulsar de novo).
  const efetivoDesabilitado = desabilitado || expulso;
  const handlers = useLongPress({
    onTap: efetivoDesabilitado ? undefined : onTap,
    onLongPress: desabilitado ? () => {} : onLongPress,
  });
  const isGoleiro = funcao === 'goleiro';
  return (
    <button
      type="button"
      disabled={efetivoDesabilitado}
      {...handlers}
      style={{ touchAction: 'none' }}
      className={[
        'flex h-14 select-none items-center gap-2 border border-border-strong bg-panel px-3 text-left text-sm transition-all',
        expulso
          ? 'opacity-50 line-through decoration-coral'
          : 'active:scale-[0.98] active:bg-accent/20 disabled:opacity-40',
      ].join(' ')}
    >
      <span
        className="relative grid h-9 w-9 flex-none place-items-center rounded-full font-display text-base"
        style={{ backgroundColor: cor ?? '#262B32', color: '#0B0D10' }}
      >
        {jogador.jogador.avatarInicial}
        {isGoleiro && (
          <span
            className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-dourado text-[#0B0D10]"
            aria-label="Goleiro"
            title="Goleiro"
          >
            <IconeGoleiro className="h-3 w-3" />
          </span>
        )}
        {expulso && (
          <span
            className="absolute -top-1 -right-1 grid h-4 w-2.5 place-items-center bg-coral text-[8px] font-bold text-[#0B0D10]"
            aria-label="Expulso"
            title="Expulso"
          >
            R
          </span>
        )}
      </span>
      <span className="flex-1 truncate">
        {jogador.jogador.nome}
        {expulso && (
          <span className="ml-2 text-[10px] uppercase tracking-wider text-coral no-underline">
            Expulso
          </span>
        )}
      </span>
      {gols > 0 && (
        <span
          className="grid h-6 min-w-6 flex-none place-items-center gap-1 rounded-full bg-accent px-1.5 font-display text-[11px] tracking-wider text-[#0B0D10]"
          aria-label={`${gols} gol${gols > 1 ? 's' : ''}`}
        >
          ⚽ {gols}
        </span>
      )}
    </button>
  );
}

function BarraFerramentas({
  onDesfazer,
  onFinalizar,
  ultimoReversivel,
  times,
  finalizavel,
}: {
  onDesfazer: () => void;
  onFinalizar: () => void;
  ultimoReversivel: EventoPartidaDTO | null;
  times: TimeDTO[];
  finalizavel: boolean;
}) {
  const legendaDesfazer = ultimoReversivel
    ? descreverEventoReversivel(ultimoReversivel, times)
    : null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-nav-bg px-4 pt-3
                 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex max-w-md gap-2">
        <Botao
          type="button"
          variante="secundario"
          className="h-14 flex-1"
          onClick={onDesfazer}
          disabled={ultimoReversivel == null}
        >
          <span className="flex flex-col items-center leading-tight">
            <span>Desfazer</span>
            {legendaDesfazer && (
              <span className="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-text-tertiary">
                {legendaDesfazer}
              </span>
            )}
          </span>
        </Botao>
        <Botao
          type="button"
          className="h-14 flex-1"
          onClick={onFinalizar}
          disabled={!finalizavel}
        >
          Finalizar
        </Botao>
      </div>
    </div>
  );
}

// Texto auxiliar exibido embaixo de "Desfazer" descrevendo a ação que será
// revertida. Retorna null se o tipo não é reconhecido (defensivo — não deve
// acontecer porque `ultimoEventoReversivel` filtra os tipos).
function descreverEventoReversivel(
  evento: EventoPartidaDTO,
  times: TimeDTO[],
): string | null {
  const time = times.find((t) => t.id === evento.teamId);
  const nomeTime = time?.nome ?? 'time';
  if (evento.tipo === 'gol') return `gol do ${nomeTime}`;
  if (evento.tipo === 'gol_contra') return `gol contra (${nomeTime})`;
  if (evento.tipo === 'expulsao') {
    return evento.jogador
      ? `expulsão de ${evento.jogador.nome}`
      : `expulsão (${nomeTime})`;
  }
  if (evento.tipo === 'substituicao') {
    const entra = evento.jogador?.nome;
    const sai = evento.assistente?.nome;
    if (entra && sai) return `sub: ${sai} → ${entra}`;
    if (entra) return `sub: entrou ${entra}`;
    return `substituição (${nomeTime})`;
  }
  return null;
}

function BottomSheetGol({
  selecao,
  onConfirmar,
  onCancelar,
  enviando,
}: {
  selecao: Selecao;
  onConfirmar: () => void;
  onCancelar: () => void;
  enviando: boolean;
}) {
  const titulo = tituloConfirmacaoGol(selecao);
  const subtitulo = selecao.tipo === 'gol_contra' ? `Conta pro ${selecao.time.nome}` : null;
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onCancelar}>
      <div
        className="w-full border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <div className="text-center">
            <p className="font-display text-lg uppercase tracking-wider">{titulo}</p>
            {subtitulo && (
              <p className="mt-1 text-xs uppercase tracking-wider text-text-tertiary">
                {subtitulo}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Botao
              type="button"
              variante="secundario"
              className="h-14 flex-1"
              onClick={onCancelar}
              disabled={enviando}
            >
              Cancelar
            </Botao>
            <Botao
              type="button"
              className="h-14 flex-1"
              onClick={onConfirmar}
              carregando={enviando}
            >
              Confirmar
            </Botao>
          </div>
        </div>
      </div>
    </div>
  );
}

function tituloConfirmacaoGol(selecao: Selecao): string {
  if (selecao.tipo === 'gol_contra') {
    return selecao.jogadorNome
      ? `Gol contra de ${selecao.jogadorNome}?`
      : `Gol contra pro ${selecao.time.nome}?`;
  }
  return selecao.jogadorNome
    ? `Gol de ${selecao.jogadorNome}?`
    : `Gol do ${selecao.time.nome}?`;
}

function MenuJogador({
  jogador,
  timeDoJogador,
  outrosTimes,
  expulso,
  ultimoGolId,
  onFechar,
  onEscolherGol,
  onEscolherGolContra,
  onRemoverGol,
  onExpulsar,
}: {
  jogador: JogadorLinha;
  timeDoJogador: TimeDTO;
  outrosTimes: TimeDTO[];
  expulso: boolean;
  // Id do último gol/gol_contra do jogador na rodada atual. `null` = jogador
  // não tem gol pra remover na rodada.
  ultimoGolId: string | null;
  onFechar: () => void;
  onEscolherGol: () => void;
  onEscolherGolContra: (timeBeneficiado: TimeDTO) => void;
  onRemoverGol: (eventoId: string) => void;
  onExpulsar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onFechar}>
      <div
        className="w-full border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-2">
          <div className="pb-2 text-center">
            <p className="font-display text-lg uppercase tracking-wider">
              {jogador.jogador.nome}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wider text-text-tertiary">
              {timeDoJogador.nome}
              {expulso && <span className="ml-2 text-coral">· Expulso</span>}
            </p>
          </div>
          {!expulso && (
            <>
              <Botao type="button" className="h-14 w-full text-base" onClick={onEscolherGol}>
                Marcou gol pro {timeDoJogador.nome}
              </Botao>
              {outrosTimes.length === 1 ? (
                <Botao
                  type="button"
                  variante="secundario"
                  className="h-14 w-full text-base"
                  onClick={() => onEscolherGolContra(outrosTimes[0]!)}
                >
                  Gol contra (conta pro {outrosTimes[0]!.nome})
                </Botao>
              ) : (
                <>
                  <p className="pt-1 text-center text-xs uppercase tracking-wider text-text-tertiary">
                    Gol contra beneficia:
                  </p>
                  {outrosTimes.map((t) => (
                    <Botao
                      key={t.id}
                      type="button"
                      variante="secundario"
                      className="h-14 w-full text-base"
                      onClick={() => onEscolherGolContra(t)}
                    >
                      {t.nome}
                    </Botao>
                  ))}
                </>
              )}
              {ultimoGolId && (
                <button
                  type="button"
                  onClick={() => onRemoverGol(ultimoGolId)}
                  className="flex h-12 items-center justify-center border border-border-strong bg-panel-2 font-display text-sm uppercase tracking-wider text-text-secondary transition-colors active:scale-[0.98] hover:border-coral hover:text-coral"
                >
                  Remover último gol
                </button>
              )}
              <button
                type="button"
                onClick={onExpulsar}
                className="flex h-12 items-center justify-center border border-coral bg-panel-2 font-display text-sm uppercase tracking-wider text-coral transition-colors active:scale-[0.98] hover:bg-coral hover:text-[#0B0D10]"
              >
                Expulsar do jogo
              </button>
            </>
          )}
          <Botao
            type="button"
            variante="secundario"
            className="h-12 w-full text-sm"
            onClick={onFechar}
          >
            Cancelar
          </Botao>
        </div>
      </div>
    </div>
  );
}

// Aberta pelo botão "+ gol" da coluna do time. Lista os jogadores em campo
// e, se o usuário quiser, permite registrar gol sem autor identificado.
function SheetEscolherAutorGol({
  time,
  onCancelar,
  onEscolher,
  onSemAutor,
}: {
  time: TimeDTO;
  onCancelar: () => void;
  onEscolher: (jogador: JogadorLinha) => void;
  onSemAutor: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onCancelar}>
      <div
        className="w-full max-h-[85vh] overflow-y-auto border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <p className="text-center font-display text-lg uppercase tracking-wider">
            Gol do {time.nome} — quem fez?
          </p>
          <div className="flex flex-col gap-2">
            {time.jogadores.map((tp) => (
              <button
                key={tp.id}
                type="button"
                onClick={() => onEscolher(tp)}
                className="flex h-14 items-center gap-3 border border-border-strong bg-panel-2 px-3 text-left text-sm transition-all active:scale-[0.98] active:bg-accent/20"
              >
                <span
                  className="grid h-9 w-9 flex-none place-items-center rounded-full font-display text-base"
                  style={{ backgroundColor: time.cor ?? '#262B32', color: '#0B0D10' }}
                >
                  {tp.jogador.avatarInicial}
                </span>
                <span className="truncate">{tp.jogador.nome}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onSemAutor}
            className="flex h-12 items-center justify-center border border-dashed border-border-strong bg-panel/50 font-display text-xs uppercase tracking-wider text-text-secondary transition-all active:scale-[0.98]"
          >
            Sem autor identificado
          </button>
          <Botao variante="secundario" className="h-12" onClick={onCancelar}>
            Cancelar
          </Botao>
        </div>
      </div>
    </div>
  );
}

function SheetAssist({
  estado,
  enviando,
  onSemAssist,
  onAssist,
  onCancelar,
}: {
  estado: AssistSheetState;
  enviando: boolean;
  onSemAssist: () => void;
  onAssist: (jogadorId: string) => void;
  onCancelar: () => void;
}) {
  // Só sugere companheiros de time diferentes do próprio autor do gol.
  const candidatos = estado.time.jogadores.filter((tp) => tp.jogadorId !== estado.jogadorId);
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onCancelar}>
      <div
        className="w-full max-h-[85vh] overflow-y-auto border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <p className="text-center font-display text-lg uppercase tracking-wider">
            Gol de {estado.jogadorNome} — quem deu a assist?
          </p>
          <button
            type="button"
            disabled={enviando}
            onClick={onSemAssist}
            className="flex h-12 items-center justify-center border border-dashed border-border-strong bg-panel/50 font-display text-xs uppercase tracking-wider text-text-secondary transition-all active:scale-[0.98] disabled:opacity-40"
          >
            Sem assistência
          </button>
          <div className="flex flex-col gap-2">
            {candidatos.map((tp) => (
              <button
                key={tp.id}
                type="button"
                disabled={enviando}
                onClick={() => onAssist(tp.jogadorId)}
                className="flex h-14 items-center gap-3 border border-border-strong bg-panel-2 px-3 text-left text-sm transition-all active:scale-[0.98] active:bg-accent/20 disabled:opacity-40"
              >
                <span
                  className="grid h-9 w-9 flex-none place-items-center rounded-full font-display text-base"
                  style={{ backgroundColor: estado.time.cor ?? '#262B32', color: '#0B0D10' }}
                >
                  {tp.jogador.avatarInicial}
                </span>
                <span className="truncate">{tp.jogador.nome}</span>
              </button>
            ))}
          </div>
          <Botao
            type="button"
            variante="secundario"
            className="h-12"
            onClick={onCancelar}
            disabled={enviando}
          >
            Cancelar gol
          </Botao>
        </div>
      </div>
    </div>
  );
}

function SheetAdicionarJogador({
  enviando,
  onCancelar,
  onSalvar,
}: {
  enviando: boolean;
  onCancelar: () => void;
  onSalvar: (nome: string, funcao: FuncaoPartida) => void;
}) {
  const [nome, setNome] = useState('');
  const [funcao, setFuncao] = useState<FuncaoPartida>('linha');
  const podeSalvar = nome.trim().length > 0 && !enviando;
  const salvar = () => {
    if (podeSalvar) onSalvar(nome.trim(), funcao);
  };
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onCancelar}>
      <div
        className="w-full border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <p className="text-center font-display text-lg uppercase tracking-wider">
            Adicionar jogador
          </p>
          <p className="text-center text-xs text-text-tertiary">
            Entra como reserva. Pra colocar em campo, use substituição.
          </p>
          <input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && podeSalvar) {
                e.preventDefault();
                salvar();
              }
            }}
            placeholder="Nome do jogador"
            maxLength={60}
            className="h-14 w-full border border-border-strong bg-panel-2 px-3 text-base text-text placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFuncao('linha')}
              aria-pressed={funcao === 'linha'}
              className={[
                'flex h-12 items-center justify-center gap-2 border font-display text-sm uppercase tracking-wider transition-colors',
                funcao === 'linha'
                  ? 'border-accent bg-panel-2 text-text'
                  : 'border-border-strong bg-panel text-text-tertiary hover:text-text',
              ].join(' ')}
            >
              <IconeLinha className="h-4 w-4" />
              Linha
            </button>
            <button
              type="button"
              onClick={() => setFuncao('goleiro')}
              aria-pressed={funcao === 'goleiro'}
              className={[
                'flex h-12 items-center justify-center gap-2 border font-display text-sm uppercase tracking-wider transition-colors',
                funcao === 'goleiro'
                  ? 'border-dourado bg-panel-2 text-dourado'
                  : 'border-border-strong bg-panel text-text-tertiary hover:text-text',
              ].join(' ')}
            >
              <IconeGoleiro className="h-4 w-4" />
              Goleiro
            </button>
          </div>
          <div className="flex gap-2">
            <Botao
              type="button"
              variante="secundario"
              className="h-14 flex-1"
              onClick={onCancelar}
              disabled={enviando}
            >
              Cancelar
            </Botao>
            <Botao
              type="button"
              className="h-14 flex-1"
              onClick={salvar}
              disabled={!podeSalvar}
              carregando={enviando}
            >
              Adicionar
            </Botao>
          </div>
        </div>
      </div>
    </div>
  );
}

type ReservaFlat = {
  jogadorId: string;
  nome: string;
  avatarInicial: string;
  funcao: FuncaoPartida;
};

function SheetReservas({
  reservas,
  timeAlvo,
  onFechar,
  onColocarEmCampo,
  onAdicionarJogador,
}: {
  reservas: ReservaFlat[];
  // Se definido, a sheet mostra "Substituição no {timeAlvo.nome}" e o caller
  // é responsável por pular a etapa de escolher time (setSubTimeDest direto).
  timeAlvo?: TimeDTO;
  onFechar: () => void;
  onColocarEmCampo: (item: ReservaFlat) => void;
  onAdicionarJogador: () => void;
}) {
  const modoSubstituicao = timeAlvo != null;
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onFechar}>
      <div
        className="w-full max-h-[85vh] overflow-y-auto border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <p className="text-center font-display text-lg uppercase tracking-wider">
            {modoSubstituicao
              ? `⇄ Substituição no ${timeAlvo.nome}`
              : `🪑 Reservas (${reservas.length})`}
          </p>
          <p className="text-center text-xs text-text-tertiary">
            {modoSubstituicao
              ? 'Escolha quem entra. Você define quem sai no próximo passo.'
              : 'Toque em um jogador pra colocar em campo. Você escolhe em qual time ele entra e (opcional) quem sai.'}
          </p>
          {reservas.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-tertiary">
              Nenhum jogador na reserva.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {reservas.map((r) => (
                <button
                  key={r.jogadorId}
                  type="button"
                  onClick={() => onColocarEmCampo(r)}
                  className="flex h-14 items-center gap-3 border border-border-strong bg-panel-2 px-3 text-left text-sm transition-all active:scale-[0.98] active:bg-accent/20"
                >
                  <span
                    className="relative grid h-9 w-9 flex-none place-items-center rounded-full bg-panel font-display text-base text-text"
                    style={{ boxShadow: 'inset 0 0 0 1px #262B32' }}
                  >
                    {r.avatarInicial}
                    {r.funcao === 'goleiro' && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-dourado text-[#0B0D10]"
                        aria-label="Goleiro"
                      >
                        <IconeGoleiro className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                  <span className="flex-1 truncate">{r.nome}</span>
                  <span className="font-display text-[10px] uppercase tracking-wider text-ciano">
                    {modoSubstituicao ? '→ quem sai' : '→ escolher time'}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={onAdicionarJogador}
            className="flex h-12 items-center justify-center border border-dashed border-border font-display text-xs uppercase tracking-wider text-text-secondary transition-colors hover:text-text"
          >
            + adicionar jogador
          </button>
          <Botao variante="secundario" className="h-12" onClick={onFechar}>
            Fechar
          </Botao>
        </div>
      </div>
    </div>
  );
}

function SheetEscolherTime({
  entra,
  timesDisponiveis,
  onCancelar,
  onEscolher,
}: {
  entra: { nome: string; avatarInicial: string };
  timesDisponiveis: TimeDTO[];
  onCancelar: () => void;
  onEscolher: (time: TimeDTO) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onCancelar}>
      <div
        className="w-full max-h-[85vh] overflow-y-auto border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <p className="text-center font-display text-lg uppercase tracking-wider">
            {entra.nome} entra em qual time?
          </p>
          <div className="flex flex-col gap-2">
            {timesDisponiveis.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onEscolher(t)}
                className="flex h-14 items-center gap-3 border border-border-strong bg-panel-2 px-3 text-left text-sm transition-all active:scale-[0.98] active:bg-accent/20"
              >
                <span
                  className="h-6 w-6 flex-none"
                  style={{ backgroundColor: t.cor ?? '#5C6470' }}
                />
                <span className="flex-1 font-display uppercase tracking-wider">{t.nome}</span>
                <span className="text-xs text-text-tertiary">{t.jogadores.length} jogadores</span>
              </button>
            ))}
          </div>
          <Botao variante="secundario" className="h-12" onClick={onCancelar}>
            Cancelar
          </Botao>
        </div>
      </div>
    </div>
  );
}

function SheetEscolherQuemSai({
  entra,
  time,
  titularesEmCampo,
  enviando,
  onCancelar,
  onEntrarSemTrocar,
  onTrocar,
}: {
  entra: { nome: string; avatarInicial: string };
  time: TimeDTO;
  titularesEmCampo: JogadorLinha[];
  enviando: boolean;
  onCancelar: () => void;
  onEntrarSemTrocar: () => void;
  onTrocar: (saiJogadorId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onCancelar}>
      <div
        className="w-full max-h-[85vh] overflow-y-auto border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <p className="text-center font-display text-lg uppercase tracking-wider">
            {entra.nome} entra pelo {time.nome}
          </p>
          <p className="text-center text-xs text-text-tertiary">
            Escolha quem sai (opcional).
          </p>
          <Botao
            className="h-12 w-full text-sm"
            variante="secundario"
            onClick={onEntrarSemTrocar}
            disabled={enviando}
          >
            Entrar sem tirar ninguém
          </Botao>
          <div className="flex flex-col gap-2">
            {titularesEmCampo.map((tp) => (
              <button
                key={tp.id}
                type="button"
                disabled={enviando}
                onClick={() => onTrocar(tp.jogadorId)}
                className="flex h-14 items-center gap-3 border border-border-strong bg-panel-2 px-3 text-left text-sm transition-all active:scale-[0.98] active:bg-coral/20 disabled:opacity-40"
              >
                <span
                  className="grid h-9 w-9 flex-none place-items-center rounded-full font-display text-base"
                  style={{ backgroundColor: time.cor ?? '#262B32', color: '#0B0D10' }}
                >
                  {tp.jogador.avatarInicial}
                </span>
                <span className="flex-1 truncate">{tp.jogador.nome}</span>
                <span className="font-display text-[10px] uppercase tracking-wider text-coral">
                  sai
                </span>
              </button>
            ))}
          </div>
          <Botao
            variante="secundario"
            className="h-12"
            onClick={onCancelar}
            disabled={enviando}
          >
            Cancelar
          </Botao>
        </div>
      </div>
    </div>
  );
}

// Sheet pra trocar um dos times em campo por um time aguardando. Usada só
// em `agendada` — durante a partida, a troca acontece via /encerrar-rodada.
function SheetTrocarEmCampo({
  candidatos,
  onCancelar,
  onEscolher,
}: {
  candidatos: TimeDTO[];
  onCancelar: () => void;
  onEscolher: (teamId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onCancelar}>
      <div
        className="w-full max-h-[85vh] overflow-y-auto border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <p className="text-center font-display text-lg uppercase tracking-wider">
            Trocar time em campo
          </p>
          <p className="text-center text-xs text-text-tertiary">
            Escolha qual time aguardando entra no lugar.
          </p>
          {candidatos.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-tertiary">
              Nenhum time aguardando.
            </p>
          ) : (
            candidatos.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onEscolher(t.id)}
                className="flex h-14 items-center gap-3 border border-border-strong bg-panel-2 px-3 text-left text-sm transition-all active:scale-[0.98] active:bg-accent/20"
              >
                <span
                  className="h-4 w-4 flex-none"
                  style={{ backgroundColor: t.cor ?? '#5C6470' }}
                />
                <span className="flex-1 truncate font-display uppercase tracking-wider">
                  {t.nome}
                </span>
                <span className="font-display text-[10px] uppercase tracking-wider text-accent">
                  entra
                </span>
              </button>
            ))
          )}
          <Botao variante="secundario" className="h-12" onClick={onCancelar}>
            Cancelar
          </Botao>
        </div>
      </div>
    </div>
  );
}

// Sheet aberta quando o cronômetro atinge `duracaoMinutos`. Confirmação
// evita finalizar sem querer (permite acréscimos). Em 2 times empatados,
// vai direto pra tela de desempate configurada. Em racha 3+, encerra a
// rodada atual — se empatado, força continuar (não dá pra encerrar rodada
// empatada).
function SheetTempoEsgotado({
  duracaoMinutos,
  modoRacha,
  modoDesempate,
  placarEmCampo,
  enviando,
  onContinuar,
  onFinalizarPartida,
  onIrParaDesempate,
  onEncerrarRodada,
}: {
  duracaoMinutos: number;
  modoRacha: boolean;
  modoDesempate: ModoDesempate | null;
  placarEmCampo: {
    a: { time: TimeDTO; gols: number };
    b: { time: TimeDTO; gols: number };
  } | null;
  enviando: boolean;
  onContinuar: () => void;
  onFinalizarPartida: () => void;
  onIrParaDesempate: () => void;
  onEncerrarRodada: (vencedorTeamId: string, perdedorTeamId: string) => void;
}) {
  const empatado =
    placarEmCampo != null && placarEmCampo.a.gols === placarEmCampo.b.gols;
  const vencedor =
    placarEmCampo != null && placarEmCampo.a.gols !== placarEmCampo.b.gols
      ? placarEmCampo.a.gols > placarEmCampo.b.gols
        ? placarEmCampo.a
        : placarEmCampo.b
      : null;
  const perdedor =
    placarEmCampo != null && vencedor
      ? vencedor.time.id === placarEmCampo.a.time.id
        ? placarEmCampo.b
        : placarEmCampo.a
      : null;
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onContinuar}>
      <div
        className="w-full border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <div className="text-center">
            <p className="font-display text-lg uppercase tracking-wider text-coral">
              ⏱ Tempo esgotado
            </p>
            <p className="mt-1 text-xs uppercase tracking-wider text-text-tertiary">
              {duracaoMinutos} min completos
            </p>
          </div>
          {modoRacha ? (
            empatado ? (
              <p className="rounded border border-border-strong bg-panel-2 px-3 py-3 text-center text-sm text-text-secondary">
                Rodada empatada — joguem até desempatar ou continuem com acréscimos.
              </p>
            ) : (
              <Botao
                type="button"
                className="h-14 w-full text-base"
                onClick={() => {
                  if (vencedor && perdedor)
                    onEncerrarRodada(vencedor.time.id, perdedor.time.id);
                }}
                disabled={enviando || !vencedor}
              >
                Encerrar rodada ({vencedor?.time.nome ?? '—'} venceu)
              </Botao>
            )
          ) : empatado && modoDesempate ? (
            <Botao
              type="button"
              className="h-14 w-full text-base"
              onClick={onIrParaDesempate}
              disabled={enviando}
            >
              Definir desempate ({ROTULOS_MODO_DESEMPATE[modoDesempate].toLowerCase()})
            </Botao>
          ) : (
            <Botao
              type="button"
              className="h-14 w-full text-base"
              onClick={onFinalizarPartida}
              carregando={enviando}
            >
              Finalizar partida
            </Botao>
          )}
          <Botao
            type="button"
            variante="secundario"
            className="h-12 w-full text-sm"
            onClick={onContinuar}
            disabled={enviando}
          >
            Continuar (acréscimos)
          </Botao>
        </div>
      </div>
    </div>
  );
}

// Sheet aberta quando um time em campo bate a meta. Confirma o vencedor,
// mostra quem entra por default (primeiro aguardando) e permite trocar.
function SheetFimDeRodada({
  vencedor,
  perdedor,
  placarVencedor,
  placarPerdedor,
  eventosDaRodada,
  aguardando,
  enviando,
  onCancelar,
  onConfirmar,
}: {
  vencedor: TimeDTO;
  perdedor: TimeDTO;
  placarVencedor: number;
  placarPerdedor: number;
  eventosDaRodada: EventoPartidaDTO[];
  aguardando: TimeDTO[];
  enviando: boolean;
  onCancelar: () => void;
  onConfirmar: (entraTeamId: string | null) => void;
}) {
  const [entraTeamId, setEntraTeamId] = useState<string | null>(aguardando[0]?.id ?? null);

  // Gols da rodada: filtra tipo=gol/gol_contra após o último rodada_encerrada.
  // Já veio filtrado pelo caller (partida.eventos completo), então re-escopa
  // aqui pra garantir isolamento por rodada.
  let cutoff: Date | null = null;
  for (const e of eventosDaRodada) {
    if (e.tipo !== 'rodada_encerrada') continue;
    if (!cutoff || e.criadoEm > cutoff) cutoff = e.criadoEm;
  }
  const golsDaRodada = eventosDaRodada.filter((e) => {
    if (e.tipo !== 'gol' && e.tipo !== 'gol_contra') return false;
    if (cutoff && e.criadoEm <= cutoff) return false;
    return true;
  });
  const golsVencedor = golsDaRodada.filter((e) => e.teamId === vencedor.id);
  const golsPerdedor = golsDaRodada.filter((e) => e.teamId === perdedor.id);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70" onClick={onCancelar}>
      <div
        className="w-full max-h-[90vh] overflow-y-auto border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <p className="text-center font-display text-xs uppercase tracking-wider text-text-tertiary">
            Rodada encerrada
          </p>

          {/* Destaque grande do vencedor */}
          <div className="flex flex-col items-center gap-2 border border-border-strong bg-panel-2 px-4 py-5">
            <div className="flex items-center gap-2">
              <span className="text-xl leading-none">🏆</span>
              <span className="font-display text-[10px] uppercase tracking-wider text-text-tertiary">
                Vencedor
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="h-5 w-5 flex-none"
                style={{ backgroundColor: vencedor.cor ?? '#5C6470' }}
              />
              <span
                className="font-display text-3xl uppercase tracking-wider"
                style={{ color: corLegivel(vencedor.cor, '#F4F5F6') }}
              >
                {vencedor.nome}
              </span>
            </div>
            <p className="mt-1 font-display text-2xl tabular-nums text-text">
              {placarVencedor} × {placarPerdedor}
            </p>
            <p className="font-display text-[11px] uppercase tracking-wider text-text-tertiary">
              vs {perdedor.nome}
            </p>
          </div>

          {/* Gols da rodada */}
          {golsDaRodada.length > 0 && (
            <div className="flex flex-col gap-2 border border-border bg-panel-2 p-3">
              <p className="font-display text-[10px] uppercase tracking-wider text-text-tertiary">
                ⚽ Gols da rodada
              </p>
              {golsVencedor.length > 0 && (
                <ListaGolsRodada time={vencedor} gols={golsVencedor} />
              )}
              {golsPerdedor.length > 0 && (
                <ListaGolsRodada time={perdedor} gols={golsPerdedor} />
              )}
            </div>
          )}

          {/* Seleção do time que entra */}
          <div className="flex flex-col gap-2">
            <p className="text-center text-xs text-text-tertiary">
              {perdedor.nome} sai · quem entra no lugar?
            </p>
            {aguardando.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">
                Nenhum time aguardando.
              </p>
            ) : (
              aguardando.map((t) => {
                const ativo = entraTeamId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setEntraTeamId(t.id)}
                    className={[
                      'flex h-14 items-center gap-3 border px-3 text-left text-sm transition-all active:scale-[0.98]',
                      ativo
                        ? 'border-accent bg-panel-2'
                        : 'border-border-strong bg-panel-2 hover:border-accent',
                    ].join(' ')}
                  >
                    <span
                      className="h-4 w-4 flex-none"
                      style={{ backgroundColor: t.cor ?? '#5C6470' }}
                    />
                    <span className="flex-1 truncate font-display uppercase tracking-wider">
                      {t.nome}
                    </span>
                    {ativo && (
                      <span className="font-display text-[10px] uppercase tracking-wider text-accent">
                        entra
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <Botao
            className="h-14"
            onClick={() => onConfirmar(entraTeamId)}
            carregando={enviando}
            disabled={aguardando.length > 0 && !entraTeamId}
          >
            Confirmar e continuar
          </Botao>
          <Botao
            variante="secundario"
            className="h-12"
            onClick={onCancelar}
            disabled={enviando}
          >
            Cancelar
          </Botao>
        </div>
      </div>
    </div>
  );
}

// Lista de gols de um time numa rodada. Mostra autor + assistente (se houver).
// Contra-gols são marcados explicitamente pra não confundir com gol normal.
function ListaGolsRodada({
  time,
  gols,
}: {
  time: TimeDTO;
  gols: EventoPartidaDTO[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 flex-none"
          style={{ backgroundColor: time.cor ?? '#5C6470' }}
        />
        <span className="font-display text-[11px] uppercase tracking-wider">
          {time.nome} <span className="text-text-tertiary">({gols.length})</span>
        </span>
      </div>
      <ul className="ml-5 flex flex-col gap-0.5">
        {gols.map((g) => (
          <li key={g.id} className="flex items-center gap-2 text-xs">
            <span className="tabular-nums text-text-tertiary">
              {formatarMinuto(g.minutoJogo)}
            </span>
            <span className="flex-1 truncate">
              {g.jogador?.nome ?? 'Sem autor'}
              {g.tipo === 'gol_contra' && (
                <span className="ml-1 text-[10px] uppercase text-coral">(GC)</span>
              )}
              {g.assistente && (
                <span className="ml-1 text-[10px] uppercase text-text-tertiary">
                  · ass. {g.assistente.nome}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatarMinuto(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
