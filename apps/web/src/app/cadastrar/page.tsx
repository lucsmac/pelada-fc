'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Botao } from '@/components/botao';
import { Campo } from '@/components/campo';
import { formatarTelefone, soDigitos } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

export default function CadastrarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conviteToken = searchParams.get('convite');
  const { estado, cadastrar } = useAuth();
  const [nome, setNome] = useState('');
  const [telefoneMascarado, setTelefoneMascarado] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [reivindicou, setReivindicou] = useState(false);

  const irParaDestino = () => {
    if (conviteToken) router.replace(`/c/${conviteToken}?auto=1`);
    else router.replace('/vestiario');
  };

  useEffect(() => {
    if (estado.status === 'autenticado' && !reivindicou) irParaDestino();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.status, reivindicou]);

  const submeter = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const usuario = await cadastrar({
        nome: nome.trim(),
        telefone: soDigitos(telefoneMascarado),
        senha,
      });
      if (usuario.reivindicou) {
        setReivindicou(true);
      } else {
        irParaDestino();
      }
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao cadastrar');
      setEnviando(false);
    }
  };

  if (reivindicou) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
        <h1 className="font-display text-5xl uppercase leading-none">Bem-vindo!</h1>
        <p className="text-sm text-text-secondary">
          Encontramos um jogador com esse telefone já registrado em uma pelada. Vinculamos sua nova
          conta ao histórico existente — seus gols, assistências e partidas anteriores agora
          aparecem no seu perfil.
        </p>
        <Botao onClick={() => irParaDestino()}>Continuar</Botao>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="font-display text-5xl uppercase leading-none">Cadastrar</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Crie sua conta para participar de peladas e acompanhar suas estatísticas.
        </p>
      </div>

      <form onSubmit={submeter} className="flex flex-col gap-5">
        <Campo
          rotulo="Nome"
          type="text"
          name="nome"
          autoComplete="name"
          required
          minLength={2}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Campo
          rotulo="Telefone"
          type="tel"
          name="telefone"
          inputMode="numeric"
          autoComplete="tel-national"
          required
          placeholder="(84) 99999-0000"
          value={telefoneMascarado}
          onChange={(e) => setTelefoneMascarado(formatarTelefone(e.target.value))}
          auxiliar="Se você já foi cadastrado em uma pelada com esse telefone, seu histórico será vinculado."
        />
        <Campo
          rotulo="Senha"
          type="password"
          name="senha"
          autoComplete="new-password"
          required
          minLength={8}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          auxiliar="Mínimo 8 caracteres."
        />
        {erro && <p className="text-sm text-coral">{erro}</p>}
        <Botao type="submit" carregando={enviando}>
          Criar conta
        </Botao>
      </form>

      <p className="text-sm text-text-tertiary">
        Já tem conta?{' '}
        <Link
          href={{
            pathname: '/entrar',
            ...(conviteToken && { query: { convite: conviteToken } }),
          }}
          className="text-accent hover:underline"
        >
          Entrar
        </Link>
      </p>
    </main>
  );
}
