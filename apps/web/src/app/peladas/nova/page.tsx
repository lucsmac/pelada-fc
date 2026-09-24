'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DIAS_SEMANA,
  MODALIDADES,
  MODALIDADE_LABEL,
  TIPO_LOCAL_LABEL,
  type CriarPeladaBody,
  type ListarLocaisResponse,
  type LocalDTO,
  type Modalidade,
  type PeladaDTO,
} from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { Campo } from '@/components/campo';
import { api } from '@/lib/api';
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

const gerarSlug = (nome: string) =>
  nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export default function NovaPeladaPage() {
  const router = useRouter();
  const { estado } = useAuth();

  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [descricao, setDescricao] = useState('');
  const [modalidade, setModalidade] = useState<Modalidade>('fut7');
  const [locais, setLocais] = useState<LocalDTO[] | null>(null);
  const [localId, setLocalId] = useState('');
  const [diaSemana, setDiaSemana] = useState<CriarPeladaBody['diaSemana']>('quinta');
  const [horario, setHorario] = useState('20:00');
  const [quantidadeTimes, setQuantidadeTimes] = useState(2);
  const [jogadoresPorTime, setJogadoresPorTime] = useState(7);
  const [goleirosPorTime, setGoleirosPorTime] = useState(1);
  const [tamanhoReserva, setTamanhoReserva] = useState(4);
  const [goleirosPagam, setGoleirosPagam] = useState(true);
  const [publica, setPublica] = useState(true);
  const [abertaParaNovos, setAbertaParaNovos] = useState(true);
  const [aprovacaoObrigatoria, setAprovacaoObrigatoria] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [slugEditadoManualmente, setSlugEditadoManualmente] = useState(false);

  useEffect(() => {
    if (estado.status === 'anonimo') router.replace('/entrar');
  }, [estado.status, router]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const resp = await api.get<ListarLocaisResponse>('/locais?porPagina=50');
        if (!cancelado) setLocais(resp.itens);
      } catch {
        if (!cancelado) setLocais([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!slugEditadoManualmente) setSlug(gerarSlug(nome));
  }, [nome, slugEditadoManualmente]);

  const localSelecionado = useMemo(
    () => locais?.find((l) => l.id === localId),
    [locais, localId],
  );

  const submeter = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!localId) {
      setErro('Selecione um local.');
      return;
    }
    setEnviando(true);
    try {
      const body: CriarPeladaBody = {
        slug,
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        modalidade,
        localId,
        diaSemana,
        horario,
        quantidadeTimes,
        jogadoresPorTime,
        goleirosPorTime,
        tamanhoReserva,
        goleirosPagam,
        publica,
        abertaParaNovos,
        aprovacaoObrigatoria,
        convidadosPagamCustos: true,
      };
      const criado = await api.post<PeladaDTO>('/peladas', body, { auth: true });
      router.replace(`/peladas/${criado.slug}`);
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao criar pelada');
      setEnviando(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="font-display text-4xl uppercase leading-none sm:text-5xl">Nova pelada</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Você será o dono. Depois de criar, pode adicionar jogadores (com ou sem conta).
        </p>
      </div>

      <form onSubmit={submeter} className="flex flex-col gap-6">
        <Campo
          rotulo="Nome"
          name="nome"
          required
          minLength={2}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Pelada dos Amigos"
        />
        <Campo
          rotulo="Slug (URL)"
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugEditadoManualmente(true);
            setSlug(gerarSlug(e.target.value));
          }}
          auxiliar={`peladafc.dev/peladas/${slug || '...'}`}
        />
        <Campo
          rotulo="Descrição (opcional)"
          name="descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />

        <SeletorEnum
          rotulo="Modalidade"
          valor={modalidade}
          opcoes={MODALIDADES}
          rotuloOpcao={(m) => MODALIDADE_LABEL[m]}
          onChange={setModalidade}
        />

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Local
          </span>
          {locais === null ? (
            <p className="text-sm text-text-tertiary">Carregando locais…</p>
          ) : locais.length === 0 ? (
            <div className="border border-border-strong bg-panel-2 p-4 text-sm text-text-secondary">
              Nenhum local cadastrado ainda.{' '}
              <Link href="/locais/novo" className="text-accent hover:underline">
                Cadastrar novo local
              </Link>
              .
            </div>
          ) : (
            <select
              required
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              className="h-11 border border-border-strong bg-panel px-4 text-sm outline-none focus:border-accent"
            >
              <option value="">Selecione…</option>
              {locais.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome} · {TIPO_LOCAL_LABEL[l.tipo]} · {l.cidadeNome}/{l.cidadeUf}
                </option>
              ))}
            </select>
          )}
          {localSelecionado && (
            <p className="text-xs text-text-tertiary">
              {localSelecionado.bairro && `${localSelecionado.bairro}, `}
              {localSelecionado.cidadeNome}/{localSelecionado.cidadeUf}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SeletorEnum
            rotulo="Dia da semana"
            valor={diaSemana}
            opcoes={DIAS_SEMANA}
            rotuloOpcao={(d) => DIA_LABEL[d] ?? d}
            onChange={setDiaSemana}
          />
          <Campo
            rotulo="Horário"
            type="time"
            name="horario"
            required
            value={horario}
            onChange={(e) => setHorario(e.target.value)}
          />
        </div>

        <fieldset className="flex flex-col gap-4 border border-border-strong bg-panel p-4">
          <legend className="px-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Formato da partida
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo
              rotulo="Quantidade de times"
              type="number"
              name="quantidadeTimes"
              required
              min={2}
              max={8}
              value={quantidadeTimes}
              onChange={(e) => setQuantidadeTimes(Number(e.target.value))}
            />
            <Campo
              rotulo="Jogadores por time (incluindo goleiro)"
              type="number"
              name="jogadoresPorTime"
              required
              min={3}
              max={15}
              value={jogadoresPorTime}
              onChange={(e) => setJogadoresPorTime(Number(e.target.value))}
              auxiliar="Goleiro + Jogadores da linha"
            />
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                Time com goleiro
              </span>
              <label className="flex h-11 items-center gap-2 border border-border-strong bg-panel px-3 text-sm">
                <input
                  type="checkbox"
                  checked={goleirosPorTime > 0}
                  onChange={(e) => setGoleirosPorTime(e.target.checked ? 1 : 0)}
                  className="h-4 w-4 accent-accent"
                />
                Cada time tem 1 goleiro
              </label>
            </div>
            <Campo
              rotulo="Tamanho da lista de espera"
              type="number"
              name="tamanhoReserva"
              required
              min={0}
              max={30}
              value={tamanhoReserva}
              onChange={(e) => setTamanhoReserva(Number(e.target.value))}
              auxiliar="Máximo na lista de espera"
            />
          </div>
          <p className="text-xs text-text-tertiary">
            Total por partida:{' '}
            <span className="font-bold text-text">
              {quantidadeTimes * jogadoresPorTime}
            </span>{' '}
            jogadores ({quantidadeTimes * goleirosPorTime} goleiros +{' '}
            {quantidadeTimes * Math.max(0, jogadoresPorTime - goleirosPorTime)} linha)
          </p>
          <CheckboxLinha
            rotulo="Goleiros pagam custos"
            checked={goleirosPagam}
            onChange={setGoleirosPagam}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-3 border border-border-strong bg-panel p-4">
          <legend className="px-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Visibilidade e entrada
          </legend>
          <CheckboxLinha
            rotulo="Pelada pública (aparece na descoberta)"
            checked={publica}
            onChange={setPublica}
          />
          <CheckboxLinha
            rotulo="Aberta para receber novos jogadores"
            checked={abertaParaNovos}
            onChange={setAbertaParaNovos}
          />
          <CheckboxLinha
            rotulo="Exigir aprovação para entrar"
            checked={aprovacaoObrigatoria}
            onChange={setAprovacaoObrigatoria}
          />
        </fieldset>

        {erro && <p className="text-sm text-coral">{erro}</p>}

        <div className="flex gap-3">
          <Botao type="submit" carregando={enviando}>
            Criar pelada
          </Botao>
          <Botao type="button" variante="secundario" onClick={() => router.back()}>
            Cancelar
          </Botao>
        </div>
      </form>
    </main>
  );
}

interface SeletorEnumProps<T extends string> {
  rotulo: string;
  valor: T;
  opcoes: readonly T[];
  rotuloOpcao: (o: T) => string;
  onChange: (v: T) => void;
}
function SeletorEnum<T extends string>({
  rotulo,
  valor,
  opcoes,
  rotuloOpcao,
  onChange,
}: SeletorEnumProps<T>) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        {rotulo}
      </span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-11 border border-border-strong bg-panel px-4 text-sm outline-none focus:border-accent"
      >
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {rotuloOpcao(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxLinha({
  rotulo,
  checked,
  onChange,
}: {
  rotulo: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-accent"
      />
      {rotulo}
    </label>
  );
}
