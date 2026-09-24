'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  MODALIDADES,
  MODALIDADE_LABEL,
  SUPERFICIES,
  SUPERFICIE_LABEL,
  TIPOS_LOCAL,
  TIPO_LOCAL_LABEL,
  type CriarLocalBody,
  type LocalDTO,
  type Modalidade,
  type Superficie,
  type TipoLocal,
} from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { Campo } from '@/components/campo';
import { api } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

export default function NovoLocalPage() {
  const router = useRouter();
  const { estado } = useAuth();

  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoLocal>('arena_society');
  const [cidadeNome, setCidadeNome] = useState('');
  const [cidadeUf, setCidadeUf] = useState('');
  const [bairro, setBairro] = useState('');
  const [endereco, setEndereco] = useState('');
  const [superficies, setSuperficies] = useState<Superficie[]>([]);
  const [modalidades, setModalidades] = useState<Modalidade[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (estado.status === 'anonimo') router.replace('/entrar');
  }, [estado.status, router]);

  const toggleSuperficie = (s: Superficie) =>
    setSuperficies((atual) =>
      atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s],
    );

  const toggleModalidade = (m: Modalidade) =>
    setModalidades((atual) =>
      atual.includes(m) ? atual.filter((x) => x !== m) : [...atual, m],
    );

  const submeter = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (modalidades.length === 0) {
      setErro('Selecione ao menos uma modalidade suportada.');
      return;
    }
    setEnviando(true);
    try {
      const body: CriarLocalBody = {
        nome: nome.trim(),
        tipo,
        cidadeNome: cidadeNome.trim(),
        cidadeUf: cidadeUf.trim().toUpperCase(),
        bairro: bairro.trim() || undefined,
        endereco: endereco.trim() || undefined,
        superficies,
        modalidadesSuportadas: modalidades,
      };
      const criado = await api.post<LocalDTO>('/locais', body, { auth: true });
      router.replace(`/locais?destaque=${criado.id}`);
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao cadastrar');
      setEnviando(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="font-display text-5xl uppercase leading-none">Novo local</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Cadastre uma arena, campo ou quadra que a comunidade utiliza.
        </p>
      </div>

      <form onSubmit={submeter} className="flex flex-col gap-6">
        <Campo
          rotulo="Nome do local"
          name="nome"
          required
          minLength={2}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Arena Zona Sul"
        />

        <SeletorEnum
          rotulo="Tipo"
          valor={tipo}
          opcoes={TIPOS_LOCAL}
          rotuloOpcao={(t) => TIPO_LOCAL_LABEL[t]}
          onChange={setTipo}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_120px]">
          <Campo
            rotulo="Cidade"
            name="cidade"
            required
            value={cidadeNome}
            onChange={(e) => setCidadeNome(e.target.value)}
          />
          <Campo
            rotulo="UF"
            name="uf"
            required
            maxLength={2}
            value={cidadeUf}
            onChange={(e) => setCidadeUf(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            placeholder="RN"
          />
        </div>

        <Campo
          rotulo="Bairro (opcional)"
          name="bairro"
          value={bairro}
          onChange={(e) => setBairro(e.target.value)}
        />

        <Campo
          rotulo="Endereço (opcional)"
          name="endereco"
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          placeholder="Rua, número, referência"
        />

        <GrupoChips
          rotulo="Superfícies"
          opcoes={SUPERFICIES}
          selecionadas={superficies}
          rotuloOpcao={(s) => SUPERFICIE_LABEL[s]}
          onToggle={toggleSuperficie}
          auxiliar="Selecione todas que se aplicam."
        />

        <GrupoChips
          rotulo="Modalidades suportadas *"
          opcoes={MODALIDADES}
          selecionadas={modalidades}
          rotuloOpcao={(m) => MODALIDADE_LABEL[m]}
          onToggle={toggleModalidade}
          auxiliar="Pelo menos uma modalidade."
        />

        {erro && <p className="text-sm text-coral">{erro}</p>}

        <div className="flex gap-3">
          <Botao type="submit" carregando={enviando}>
            Cadastrar
          </Botao>
          <Botao type="button" variante="secundario" onClick={() => router.back()}>
            Cancelar
          </Botao>
        </div>
      </form>
    </main>
  );
}

// -- helpers --------------------------------------------------------------

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

interface GrupoChipsProps<T extends string> {
  rotulo: string;
  opcoes: readonly T[];
  selecionadas: T[];
  rotuloOpcao: (o: T) => string;
  onToggle: (o: T) => void;
  auxiliar?: string;
}

function GrupoChips<T extends string>({
  rotulo,
  opcoes,
  selecionadas,
  rotuloOpcao,
  onToggle,
  auxiliar,
}: GrupoChipsProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        {rotulo}
      </span>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((o) => {
          const ativa = selecionadas.includes(o);
          return (
            <button
              type="button"
              key={o}
              onClick={() => onToggle(o)}
              className={[
                'border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors',
                ativa
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border-strong bg-panel text-text-secondary hover:border-accent',
              ].join(' ')}
            >
              {rotuloOpcao(o)}
            </button>
          );
        })}
      </div>
      {auxiliar && <span className="text-xs text-text-tertiary">{auxiliar}</span>}
    </div>
  );
}
