'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  EditarJogadorBody,
  EditarPrivacidadeBody,
  FuncaoPartida,
  JogadorDTO,
  PerfilJogadorResponse,
  PosicaoLinha,
  PrivacidadeJogador,
} from '@peladafc/contracts';
import { POSICOES_LINHA, ROTULOS_POSICAO_LINHA } from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { Campo } from '@/components/campo';
import { api } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

export default function MeuPerfilPage() {
  const router = useRouter();
  const { estado } = useAuth();

  const [perfil, setPerfil] = useState<PerfilJogadorResponse | null>(null);
  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');
  const [funcao, setFuncao] = useState<FuncaoPartida | ''>('');
  const [posicaoLinha, setPosicaoLinha] = useState<PosicaoLinha | ''>('');
  const [cidadeAtual, setCidadeAtual] = useState('');
  const [privacidade, setPrivacidade] = useState<PrivacidadeJogador | null>(null);

  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (estado.status === 'anonimo') router.replace('/entrar');
  }, [estado.status, router]);

  useEffect(() => {
    if (estado.status !== 'autenticado' || !estado.usuario.jogadorId) return;
    (async () => {
      const p = await api.get<PerfilJogadorResponse>(
        `/jogadores/${estado.usuario.jogadorId}`,
        { auth: true },
      );
      setPerfil(p);
      setNome(p.jogador.nome);
      setApelido(p.jogador.apelido ?? '');
      setFuncao(p.jogador.funcaoPreferida ?? '');
      setPosicaoLinha(p.jogador.posicaoLinha ?? '');
      setCidadeAtual(p.jogador.cidadeAtual ?? '');
      setPrivacidade(p.privacidade);
    })().catch(() => setErro('Erro ao carregar perfil'));
  }, [estado]);

  const salvarDados = async (e: FormEvent) => {
    e.preventDefault();
    if (!perfil) return;
    setAviso(null);
    setErro(null);
    try {
      const body: EditarJogadorBody = {
        nome: nome.trim(),
        apelido: apelido.trim() || null,
        funcaoPreferida: funcao || null,
        posicaoLinha: funcao === 'linha' && posicaoLinha ? posicaoLinha : null,
        cidadeAtual: cidadeAtual.trim() || null,
      };
      await api.put<JogadorDTO>(`/jogadores/${perfil.jogador.id}`, body, { auth: true });
      setAviso('Perfil atualizado.');
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro');
    }
  };

  const togglePriv = async (chave: keyof PrivacidadeJogador) => {
    if (!perfil || !privacidade) return;
    const novo: PrivacidadeJogador = { ...privacidade, [chave]: !privacidade[chave] };
    setPrivacidade(novo);
    try {
      const body: EditarPrivacidadeBody = { [chave]: novo[chave] };
      await api.put(`/jogadores/${perfil.jogador.id}/privacidade`, body, { auth: true });
    } catch {
      setPrivacidade(privacidade); // rollback
    }
  };

  if (!perfil) {
    return <main className="mx-auto max-w-container px-4 py-10 md:px-16 md:py-16 text-text-tertiary">Carregando…</main>;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-4xl uppercase leading-none sm:text-5xl">Meu perfil</h1>

      <form onSubmit={salvarDados} className="mt-8 flex flex-col gap-4">
        <Campo
          rotulo="Nome"
          name="nome"
          required
          minLength={2}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Campo
          rotulo="Apelido"
          name="apelido"
          value={apelido}
          onChange={(e) => setApelido(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Função preferida
          </span>
          <div className="flex overflow-hidden border border-border-strong">
            {(['', 'linha', 'goleiro'] as const).map((f) => (
              <button
                key={f || 'nenhuma'}
                type="button"
                onClick={() => setFuncao(f)}
                className={`flex-1 px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${
                  funcao === f ? 'bg-accent text-black' : 'bg-panel text-text-secondary'
                }`}
              >
                {f === '' ? 'Sem preferência' : f === 'linha' ? 'Linha' : 'Goleiro'}
              </button>
            ))}
          </div>
          {funcao === 'linha' && (
            <select
              value={posicaoLinha}
              onChange={(e) => setPosicaoLinha(e.target.value as PosicaoLinha | '')}
              className="h-11 border border-border-strong bg-panel px-4 text-sm outline-none focus:border-accent"
            >
              <option value="">Posição (opcional)</option>
              {POSICOES_LINHA.map((p) => (
                <option key={p} value={p}>
                  {ROTULOS_POSICAO_LINHA[p]}
                </option>
              ))}
            </select>
          )}
        </div>
        <Campo
          rotulo="Cidade"
          name="cidade"
          value={cidadeAtual}
          onChange={(e) => setCidadeAtual(e.target.value)}
        />
        {aviso && <p className="text-sm text-accent">{aviso}</p>}
        {erro && <p className="text-sm text-coral">{erro}</p>}
        <div>
          <Botao type="submit">Salvar</Botao>
        </div>
      </form>

      {privacidade && (
        <section className="mt-12">
          <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Privacidade
          </h2>
          <ul className="mt-4 flex flex-col divide-y divide-border">
            <ToggleLinha
              rotulo="Perfil público"
              descricao="Quando desligado, só membros das suas peladas veem seu perfil."
              ativo={privacidade.perfilPublico}
              onToggle={() => togglePriv('perfilPublico')}
            />
            <ToggleLinha
              rotulo="Mostrar estatísticas"
              descricao="Gols, assistências, vitórias no seu perfil."
              ativo={privacidade.mostrarEstatisticas}
              onToggle={() => togglePriv('mostrarEstatisticas')}
            />
            <ToggleLinha
              rotulo="Mostrar peladas"
              descricao="Lista das peladas em que você participa."
              ativo={privacidade.mostrarPeladas}
              onToggle={() => togglePriv('mostrarPeladas')}
            />
            <ToggleLinha
              rotulo="Mostrar histórico por temporada"
              descricao="Detalhamento por temporada no seu perfil."
              ativo={privacidade.mostrarHistorico}
              onToggle={() => togglePriv('mostrarHistorico')}
            />
            <ToggleLinha
              rotulo="Calendário público"
              descricao="Deixa qualquer pessoa ver os dias em que você joga."
              ativo={privacidade.mostrarCalendarioPublico}
              onToggle={() => togglePriv('mostrarCalendarioPublico')}
            />
          </ul>
        </section>
      )}
    </main>
  );
}


function ToggleLinha({
  rotulo,
  descricao,
  ativo,
  onToggle,
}: {
  rotulo: string;
  descricao: string;
  ativo: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-4">
      <div>
        <p className="text-sm">{rotulo}</p>
        <p className="mt-1 text-xs text-text-tertiary">{descricao}</p>
      </div>
      <button
        onClick={onToggle}
        className={[
          'border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors',
          ativo
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-border-strong bg-panel text-text-tertiary',
        ].join(' ')}
      >
        {ativo ? 'Ligado' : 'Desligado'}
      </button>
    </li>
  );
}
