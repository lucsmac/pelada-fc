'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  AtualizarCustoRecorrenteBody,
  CriarCustoRecorrenteBody,
  CustoRecorrenteDTO,
  EditarPeladaBody,
  ListarCustosRecorrentesResponse,
  ListarMembrosResponse,
  MembroDTO,
  PeladaDTO,
  TipoCusto,
} from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { api, ApiError } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export default function TesourariaPeladaPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { estado } = useAuth();

  const [pelada, setPelada] = useState<PeladaDTO | null>(null);
  const [membros, setMembros] = useState<MembroDTO[]>([]);
  const [custos, setCustos] = useState<CustoRecorrenteDTO[]>([]);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    if (estado.status === 'anonimo') router.replace('/entrar');
  }, [estado.status, router]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const p = await api.get<PeladaDTO>(`/peladas/${slug}`, { auth: true });
        if (cancelado) return;
        setPelada(p);
        const [m, c] = await Promise.all([
          api.get<ListarMembrosResponse>(`/peladas/${p.id}/membros`),
          api.get<ListarCustosRecorrentesResponse>(
            `/peladas/${p.id}/custos-recorrentes`,
          ),
        ]);
        if (cancelado) return;
        setMembros(m.itens);
        setCustos(c.itens);
      } catch (e) {
        if (cancelado) return;
        setErroCarregar(
          e instanceof ApiError && e.status === 404
            ? 'Pelada não encontrada'
            : e instanceof Error
              ? e.message
              : 'Erro ao carregar',
        );
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [slug]);

  const souAdmin =
    estado.status === 'autenticado' &&
    pelada !== null &&
    (pelada.criadoPorUserId === estado.usuario.id ||
      membros.some(
        (m) => m.papel === 'admin' && m.jogador.userId === estado.usuario.id,
      ));

  const alternarConvidados = async (valor: boolean) => {
    if (!pelada) return;
    setErro(null);
    try {
      const body: EditarPeladaBody = { convidadosPagamCustos: valor };
      const atualizado = await api.put<PeladaDTO>(`/peladas/${pelada.id}`, body, {
        auth: true,
      });
      setPelada(atualizado);
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro ao atualizar');
    }
  };

  const criar = async (body: CriarCustoRecorrenteBody) => {
    if (!pelada) return;
    setErro(null);
    setSucesso(null);
    try {
      const novo = await api.post<CustoRecorrenteDTO>(
        `/peladas/${pelada.id}/custos-recorrentes`,
        body,
        { auth: true },
      );
      setCustos((atuais) => [...atuais, novo]);
      setSucesso(`Custo "${novo.nome}" adicionado`);
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro ao adicionar');
    }
  };

  const atualizar = async (id: string, patch: AtualizarCustoRecorrenteBody) => {
    setErro(null);
    try {
      const atualizado = await api.patch<CustoRecorrenteDTO>(
        `/custos-recorrentes/${id}`,
        patch,
        { auth: true },
      );
      setCustos((atuais) => atuais.map((c) => (c.id === id ? atualizado : c)));
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro ao atualizar');
    }
  };

  const remover = async (id: string, nome: string) => {
    if (!confirm(`Remover "${nome}" da lista de custos?`)) return;
    setErro(null);
    try {
      await api.delete(`/custos-recorrentes/${id}`, { auth: true });
      setCustos((atuais) => atuais.filter((c) => c.id !== id));
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro ao remover');
    }
  };

  if (erroCarregar) {
    return (
      <main className="mx-auto max-w-container px-16 py-16">
        <h1 className="font-display text-4xl uppercase">{erroCarregar}</h1>
        <Link href="/peladas" className="mt-4 inline-block text-accent hover:underline">
          ← Voltar
        </Link>
      </main>
    );
  }

  if (!pelada) {
    return (
      <main className="mx-auto max-w-container px-16 py-16 text-text-tertiary">
        Carregando…
      </main>
    );
  }

  if (!souAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-text-tertiary">
          Só administradores podem gerenciar a tesouraria desta pelada.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div>
        <Link
          href={{ pathname: `/peladas/${pelada.slug}` }}
          className="text-xs text-text-tertiary hover:text-text"
        >
          ← Voltar para a pelada
        </Link>
        <h1 className="mt-2 font-display text-5xl uppercase leading-none">Tesouraria</h1>
        <p className="mt-2 text-sm text-text-secondary">{pelada.nome}</p>
      </div>

      <section className="mt-10">
        <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Configuração
        </h2>
        <label className="mt-4 flex items-center gap-3">
          <input
            type="checkbox"
            checked={pelada.convidadosPagamCustos}
            onChange={(e) => alternarConvidados(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          <span className="text-sm">Convidados avulsos pagam custos da partida</span>
        </label>
        <p className="mt-1 pl-7 text-xs text-text-tertiary">
          Quando desligado, convidados jogam de graça e o custo rateado é dividido só entre
          membros.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Custos recorrentes ({custos.length})
        </h2>
        <p className="mt-3 text-sm text-text-tertiary">
          Aplicam-se a toda partida da pelada. Extras avulsos (bola, juiz de plantão etc.)
          você cadastra na página da partida.
        </p>

        {erro && <p className="mt-3 text-sm text-coral">{erro}</p>}
        {sucesso && <p className="mt-3 text-sm text-accent">{sucesso}</p>}

        <ul className="mt-5 flex flex-col divide-y divide-border">
          {custos.map((c) => (
            <LinhaCusto
              key={c.id}
              custo={c}
              onAtualizar={(patch) => atualizar(c.id, patch)}
              onRemover={() => remover(c.id, c.nome)}
            />
          ))}
          {custos.length === 0 && (
            <li className="py-3 text-xs text-text-tertiary">Nenhum custo cadastrado.</li>
          )}
        </ul>

        <FormNovoCusto onCriar={criar} />
      </section>
    </main>
  );
}

function LinhaCusto({
  custo,
  onAtualizar,
  onRemover,
}: {
  custo: CustoRecorrenteDTO;
  onAtualizar: (patch: AtualizarCustoRecorrenteBody) => Promise<void>;
  onRemover: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(custo.nome);
  const [tipo, setTipo] = useState<TipoCusto>(custo.tipo);
  const [reais, setReais] = useState((custo.valorCentavos / 100).toFixed(2).replace('.', ','));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const valor = Number(reais.replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) return;
    await onAtualizar({
      nome: nome.trim(),
      tipo,
      valorCentavos: Math.round(valor * 100),
    });
    setEditando(false);
  };

  if (editando) {
    return (
      <li className="py-3">
        <form
          onSubmit={salvar}
          className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]"
        >
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="h-9 border border-border-strong bg-panel px-3 text-sm outline-none focus:border-accent"
          />
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoCusto)}
            className="h-9 border border-border-strong bg-panel px-3 text-sm outline-none focus:border-accent"
          >
            <option value="por_jogador">Por jogador</option>
            <option value="rateado">Rateado</option>
          </select>
          <div className="flex items-stretch border border-border-strong bg-panel">
            <span className="grid place-items-center px-2 text-xs text-text-tertiary">R$</span>
            <input
              value={reais}
              onChange={(e) => setReais(e.target.value)}
              className="h-9 w-24 bg-transparent pr-2 text-sm outline-none"
              inputMode="decimal"
            />
          </div>
          <button
            type="submit"
            className="h-9 border border-accent bg-accent/10 px-3 text-[11px] font-bold uppercase text-accent"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="h-9 border border-border-strong bg-panel px-3 text-[11px] font-bold uppercase text-text-tertiary"
          >
            Cancelar
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 py-3 text-sm">
      <span className="flex-1">
        {custo.nome}
        {!custo.ativo && (
          <span className="ml-2 text-[10px] font-bold uppercase text-text-tertiary">
            pausado
          </span>
        )}
      </span>
      <span className="text-xs text-text-tertiary">
        {custo.tipo === 'por_jogador' ? 'por jogador' : 'rateado'}
      </span>
      <span className="w-24 text-right font-mono">{formatarReais(custo.valorCentavos)}</span>
      <button
        onClick={() => onAtualizar({ ativo: !custo.ativo })}
        className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary hover:text-accent"
      >
        {custo.ativo ? 'Pausar' : 'Ativar'}
      </button>
      <button
        onClick={() => setEditando(true)}
        className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary hover:text-accent"
      >
        Editar
      </button>
      <button
        onClick={onRemover}
        className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary hover:text-coral"
      >
        Remover
      </button>
    </li>
  );
}

function FormNovoCusto({
  onCriar,
}: {
  onCriar: (body: CriarCustoRecorrenteBody) => Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoCusto>('por_jogador');
  const [reais, setReais] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    const valor = Number(reais.replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) {
      setErro('Valor inválido');
      return;
    }
    setEnviando(true);
    try {
      await onCriar({
        nome: nome.trim(),
        tipo,
        valorCentavos: Math.round(valor * 100),
        ativo: true,
      });
      setNome('');
      setReais('');
    } catch {
      /* erro já tratado pelo pai */
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="mt-6 border border-border bg-panel-2 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Adicionar custo recorrente
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Aluguel da quadra"
          required
          minLength={1}
          maxLength={80}
          className="h-10 border border-border-strong bg-panel px-3 text-sm outline-none focus:border-accent"
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoCusto)}
          className="h-10 border border-border-strong bg-panel px-3 text-sm outline-none focus:border-accent"
        >
          <option value="por_jogador">Por jogador</option>
          <option value="rateado">Rateado (total)</option>
        </select>
        <div className="flex items-stretch border border-border-strong bg-panel">
          <span className="grid place-items-center px-3 text-xs text-text-tertiary">R$</span>
          <input
            value={reais}
            onChange={(e) => setReais(e.target.value)}
            placeholder="10,00"
            inputMode="decimal"
            required
            className="h-10 w-24 bg-transparent pr-3 text-sm outline-none"
          />
        </div>
        <Botao type="submit" carregando={enviando}>
          Adicionar
        </Botao>
      </div>
      {erro && <p className="mt-2 text-sm text-coral">{erro}</p>}
    </form>
  );
}
