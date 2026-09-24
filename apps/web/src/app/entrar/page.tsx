'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Botao } from '@/components/botao';
import { Campo } from '@/components/campo';
import { formatarTelefone, soDigitos } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

export default function EntrarPage() {
  return (
    <Suspense fallback={null}>
      <EntrarPageContent />
    </Suspense>
  );
}

function EntrarPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conviteToken = searchParams.get('convite');
  const { estado, entrar } = useAuth();
  const [telefoneMascarado, setTelefoneMascarado] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const irParaDestino = () => {
    if (conviteToken) router.replace(`/c/${conviteToken}?auto=1`);
    else router.replace('/vestiario');
  };

  useEffect(() => {
    if (estado.status === 'autenticado') irParaDestino();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.status]);

  const submeter = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar({ telefone: soDigitos(telefoneMascarado), senha });
      irParaDestino();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao entrar');
      setEnviando(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="font-display text-5xl uppercase leading-none">Entrar</h1>
        <p className="mt-3 text-sm text-text-secondary">
          Acesse sua conta para organizar peladas e acompanhar sua história.
        </p>
      </div>

      <form onSubmit={submeter} className="flex flex-col gap-5">
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
        />
        <Campo
          rotulo="Senha"
          type="password"
          name="senha"
          autoComplete="current-password"
          required
          minLength={1}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        {erro && <p className="text-sm text-coral">{erro}</p>}
        <Botao type="submit" carregando={enviando}>
          Entrar
        </Botao>
      </form>

      <p className="text-sm text-text-tertiary">
        Não tem conta?{' '}
        <Link
          href={{
            pathname: '/cadastrar',
            ...(conviteToken && { query: { convite: conviteToken } }),
          }}
          className="text-accent hover:underline"
        >
          Cadastre-se
        </Link>
      </p>
    </main>
  );
}
