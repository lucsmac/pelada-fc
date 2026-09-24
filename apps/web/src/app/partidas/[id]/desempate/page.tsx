'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type {
  DeclararDesempateBody,
  ModoDesempate,
  PartidaAoVivo,
  TimeDTO,
} from '@peladafc/contracts';
import { ROTULOS_MODO_DESEMPATE } from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { api, ApiError } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

export default function DesempatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { estado } = useAuth();
  const [partida, setPartida] = useState<PartidaAoVivo | null>(null);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const p = await api.get<PartidaAoVivo>(`/partidas/${id}`, { auth: true });
    setPartida(p);
    return p;
  }, [id]);

  useEffect(() => {
    if (estado.status === 'anonimo') {
      router.replace(`/entrar?redirect=/partidas/${id}/desempate`);
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
          err instanceof ApiError && err.status === 404 ? 'Partida não encontrada' : 'Erro',
        );
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [carregar, estado.status, id, router]);

  // Se já foi finalizada, vai pro resumo.
  useEffect(() => {
    if (partida?.status === 'finalizada') router.replace(`/partidas/${id}/resumo`);
  }, [partida?.status, id, router]);

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

  const [timeA, timeB] = ordenarTimes(partida.times);
  const modo = partida.modoDesempate;
  if (!timeA || !timeB || !modo) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-coral">Partida sem configuração de desempate</p>
      </main>
    );
  }

  const empatado = partida.placarTimeA === partida.placarTimeB;
  if (!empatado) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-text-secondary">
          A partida não está empatada. Voltando pro placar…
        </p>
        <button
          onClick={() => router.replace(`/partidas/${id}/ao-vivo`)}
          className="mt-4 font-display text-sm uppercase tracking-wider text-accent"
        >
          Ir agora
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-76px)] max-w-md px-4 pt-6 pb-[calc(96px+env(safe-area-inset-bottom))]">
      <header className="mb-6 text-center">
        <p className="font-display text-xs uppercase tracking-wider text-text-tertiary">
          Empate
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-wider">
          {ROTULOS_MODO_DESEMPATE[modo]}
        </h1>
        <p className="mt-3 font-display text-4xl leading-none tabular-nums">
          {partida.placarTimeA} <span className="text-text-tertiary">x</span> {partida.placarTimeB}
        </p>
      </header>

      {modo === 'par_impar' && (
        <ModoParImpar partidaId={partida.id} timeA={timeA} timeB={timeB} onDone={carregar} />
      )}
      {(modo === 'penaltis' || modo === 'shootout') && (
        <ModoPenaltis
          partidaId={partida.id}
          modo={modo}
          timeA={timeA}
          timeB={timeB}
          onDone={carregar}
        />
      )}
      {modo === 'gol_de_ouro' && <ModoGolDeOuro partidaId={partida.id} />}
    </main>
  );
}

// ---------------------------------------------------------------------------

function ordenarTimes(times: TimeDTO[]): [TimeDTO | undefined, TimeDTO | undefined] {
  const ord = [...times].sort((a, b) => a.nome.localeCompare(b.nome));
  return [ord[0], ord[1]];
}

// ---- Par ou ímpar (offline) -----------------------------------------------

function ModoParImpar({
  partidaId,
  timeA,
  timeB,
  onDone,
}: {
  partidaId: string;
  timeA: TimeDTO;
  timeB: TimeDTO;
  onDone: () => Promise<PartidaAoVivo>;
}) {
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const declarar = async (vencedor: TimeDTO) => {
    setErro(null);
    setEnviando(vencedor.id);
    try {
      const body: DeclararDesempateBody = {
        vencedorTeamId: vencedor.id,
        golsPenaltisTimeA: 0,
        golsPenaltisTimeB: 0,
      };
      await api.post(`/partidas/${partidaId}/desempate`, body, { auth: true });
      await onDone();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro');
      setEnviando(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm text-text-secondary">
        Decidam no par ou ímpar e toque no vencedor
      </p>
      {[timeA, timeB].map((t) => (
        <button
          key={t.id}
          onClick={() => declarar(t)}
          disabled={enviando != null}
          className="flex h-24 items-center justify-center border-2 bg-panel font-display text-2xl uppercase tracking-wider transition-transform active:scale-[0.98] disabled:opacity-40"
          style={{ borderColor: t.cor ?? '#262B32', color: t.cor ?? undefined }}
        >
          {enviando === t.id ? '...' : `${t.nome} venceu`}
        </button>
      ))}
      {erro && <p className="text-center text-sm text-coral">{erro}</p>}
    </div>
  );
}

// ---- Pênaltis / Shootout ---------------------------------------------------

function ModoPenaltis({
  partidaId,
  modo,
  timeA,
  timeB,
  onDone,
}: {
  partidaId: string;
  modo: ModoDesempate;
  timeA: TimeDTO;
  timeB: TimeDTO;
  onDone: () => Promise<PartidaAoVivo>;
}) {
  const [golsA, setGolsA] = useState(0);
  const [golsB, setGolsB] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const declarar = async () => {
    if (golsA === golsB) {
      setErro('Precisa ter um vencedor — placar não pode empatar');
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const vencedor = golsA > golsB ? timeA.id : timeB.id;
      const body: DeclararDesempateBody = {
        vencedorTeamId: vencedor,
        golsPenaltisTimeA: golsA,
        golsPenaltisTimeB: golsB,
      };
      await api.post(`/partidas/${partidaId}/desempate`, body, { auth: true });
      await onDone();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro');
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-center text-sm text-text-secondary">
        {modo === 'penaltis'
          ? 'Cobrem os pênaltis e vá atualizando o placar'
          : 'Cobrem o shootout e vá atualizando o placar'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <ContadorPenaltis time={timeA} valor={golsA} onChange={setGolsA} />
        <ContadorPenaltis time={timeB} valor={golsB} onChange={setGolsB} />
      </div>
      {erro && <p className="text-center text-sm text-coral">{erro}</p>}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-nav-bg px-4 pt-3
                   pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto max-w-md">
          <Botao
            onClick={declarar}
            carregando={enviando}
            disabled={golsA === golsB}
            className="h-14 w-full text-base"
          >
            Definir vencedor
          </Botao>
        </div>
      </div>
    </div>
  );
}

function ContadorPenaltis({
  time,
  valor,
  onChange,
}: {
  time: TimeDTO;
  valor: number;
  onChange: (n: number) => void;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 border bg-panel p-4"
      style={{ borderColor: time.cor ?? '#262B32' }}
    >
      <p className="truncate font-display text-sm uppercase tracking-wider">{time.nome}</p>
      <p
        className="font-display text-6xl leading-none tabular-nums"
        style={{ color: time.cor ?? undefined }}
      >
        {valor}
      </p>
      <div className="flex w-full gap-2">
        <button
          onClick={() => onChange(Math.max(0, valor - 1))}
          className="h-12 flex-1 border border-border-strong font-display text-xl active:scale-95"
        >
          −
        </button>
        <button
          onClick={() => onChange(valor + 1)}
          className="h-12 flex-1 border border-accent bg-accent font-display text-xl text-[#0B0D10] active:scale-95"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ---- Gol de ouro (não usa POST /desempate — volta pro placar) --------------

function ModoGolDeOuro({ partidaId }: { partidaId: string }) {
  const router = useRouter();
  const voltar = () => {
    // Marca no sessionStorage que a partida está em modo "próximo gol vence"
    // — a tela ao-vivo lê essa flag e chama finalizar assim que o placar
    // deixar de estar empatado. Isso cobre o caso em que a meta ainda não
    // foi atingida (o server sozinho só auto-finaliza por meta).
    try {
      sessionStorage.setItem(chaveGolDeOuro(partidaId), '1');
    } catch {
      // storage indisponível (private mode) — segue sem: o usuário pode
      // finalizar manualmente pelo botão da tela ao vivo.
    }
    router.replace(`/partidas/${partidaId}/ao-vivo`);
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="border border-accent bg-panel p-6 text-center">
        <p className="font-display text-2xl uppercase leading-tight tracking-wider">
          Volta pro campo
        </p>
        <p className="mt-3 text-sm text-text-secondary">
          Quem fizer o próximo gol vence. Marque o gol na tela ao vivo — o app finaliza
          sozinho assim que o placar mudar.
        </p>
      </div>
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-nav-bg px-4 pt-3
                   pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto max-w-md">
          <Botao onClick={voltar} className="h-14 w-full text-base">
            Voltar ao placar
          </Botao>
        </div>
      </div>
    </div>
  );
}

// Chave compartilhada com a tela ao-vivo. Exporta em runtime seria overkill;
// a string vive em dois lugares, mas o padrão é curto e imutável.
function chaveGolDeOuro(partidaId: string): string {
  return `pelada-fc:gol-de-ouro:${partidaId}`;
}
