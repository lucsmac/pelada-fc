'use client';

import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { Botao } from '@/components/botao';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { estado } = useAuth();
  const autenticado = estado.status === 'autenticado';

  return (
    <>
      {/* ============================================================
          Hero
          ============================================================ */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-container gap-10 px-6 py-20 md:grid-cols-[1.6fr_1fr] md:px-16 md:py-28">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
              O que jogamos aqui é história
            </p>
            <h1 className="mt-4 font-display text-5xl uppercase leading-[0.95] md:text-7xl">
              Sua pelada em modo
              <br />
              <span className="text-accent">profissional</span>.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-text-secondary">
              Organize as partidas do seu grupo, registre gols, assistências e MVPs,
              e acompanhe o ranking da temporada. Ou descubra peladas na sua cidade
              e comece a jogar.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {autenticado ? (
                <>
                  <Link href="/peladas/nova">
                    <Botao>Criar pelada</Botao>
                  </Link>
                  <Link href="/peladas">
                    <Botao variante="secundario">Descobrir peladas</Botao>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/cadastrar">
                    <Botao>Criar conta grátis</Botao>
                  </Link>
                  <Link href="/peladas">
                    <Botao variante="secundario">Explorar peladas</Botao>
                  </Link>
                </>
              )}
            </div>

            <p className="mt-6 text-xs text-text-tertiary">
              Nenhum cadastro para jogadores casuais — donos podem adicionar amigos
              só com o nome.
            </p>
          </div>

          {/* Mock de scoreboard */}
          <div className="hidden md:block">
            <MockPlacar />
          </div>
        </div>
      </section>

      {/* ============================================================
          Os dois loops — Organize x Descubra
          ============================================================ */}
      <section className="border-b border-border bg-panel-2">
        <div className="mx-auto grid max-w-container gap-6 px-6 py-16 md:grid-cols-2 md:px-16">
          <ColunaLoop
            etiqueta="Loop de organização"
            titulo="Do sorteio ao ranking, tudo salvo."
            descricao="Marque a data, receba as confirmações, sorteie os times, registre o placar. Ao final, cada gol conta pro histórico do jogador."
            passos={[
              'Agendar partida na temporada ativa',
              'Confirmar presença dos jogadores',
              'Sortear times (2, 3 ou 4 times)',
              'Registrar placar, gols, assistências e MVP',
              'Ranking atualizado automaticamente',
            ]}
            cta={{ label: 'Criar pelada', href: '/peladas/nova' }}
          />
          <ColunaLoop
            etiqueta="Loop de descoberta"
            titulo="Encontre onde jogar perto de você."
            descricao="Filtre por cidade, modalidade e dia da semana. Veja a comunidade, o histórico e os jogadores antes de pedir pra entrar."
            passos={[
              'Buscar peladas públicas na sua região',
              'Ver estatísticas, MVPs e artilheiros',
              'Conhecer os jogadores da comunidade',
              'Candidatar-se e aguardar aprovação',
              'Começar a jogar e construir sua carreira',
            ]}
            cta={{ label: 'Explorar peladas', href: '/peladas' }}
            invertido
          />
        </div>
      </section>

      {/* ============================================================
          Números/features em destaque
          ============================================================ */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-container px-6 py-16 md:px-16">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Feito para peladas que levam a sério
          </p>
          <h2 className="mt-2 font-display text-4xl uppercase leading-none md:text-5xl">
            Tudo que você precisa
            <br />
            <span className="text-accent">num só lugar.</span>
          </h2>

          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            <FeatureTile
              rotulo="Modalidades"
              valor="7"
              descricao="Fut7, campo, society, futsal, areia, futevôlei…"
            />
            <FeatureTile
              rotulo="Rankings"
              valor="6"
              descricao="Geral, artilharia, vitórias, assistências, MVP, aproveitamento"
            />
            <FeatureTile
              rotulo="Rating do jogador"
              valor="0–99"
              descricao="Carta calculada a partir da sua performance"
              destaque="dourado"
            />
            <FeatureTile
              rotulo="Cadastro simples"
              valor="Nome"
              descricao="Dono adiciona jogadores sem conta — histórico linka depois"
            />
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
            <CardRecurso titulo="Presença & sorteio">
              Lista de presença online, chamada por membros e algoritmo de sorteio
              balanceado entre 2 e 4 times.
            </CardRecurso>
            <CardRecurso titulo="Temporadas">
              Rankings congelados ao final de cada temporada. Histórico permanente
              — carreira, T1, T2, para sempre.
            </CardRecurso>
            <CardRecurso titulo="Candidaturas e convites">
              Fluxo formal com estados (pendente, aceita, recusada). Cada dono
              aprova, cada jogador aceita.
            </CardRecurso>
            <CardRecurso titulo="Locais reutilizáveis">
              Cadastre uma arena/quadra uma vez — múltiplas peladas podem usar o
              mesmo local.
            </CardRecurso>
            <CardRecurso titulo="Perfil com privacidade">
              Escolha o que aparece pra fora: estatísticas, peladas, histórico.
            </CardRecurso>
            <CardRecurso titulo="Seguir e feed">
              Siga peladas que você acompanha e receba as próximas partidas no
              seu feed.
            </CardRecurso>
          </div>
        </div>
      </section>

      {/* ============================================================
          Como funciona
          ============================================================ */}
      <section className="border-b border-border bg-panel-2">
        <div className="mx-auto max-w-container px-6 py-16 md:px-16">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Como funciona
          </p>
          <h2 className="mt-2 font-display text-4xl uppercase leading-none md:text-5xl">
            Três passos.
          </h2>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Passo numero="01" titulo="Cadastre-se com seu telefone">
              Se alguém já te adicionou como jogador em uma pelada, vinculamos seu
              histórico automaticamente pelo número.
            </Passo>
            <Passo numero="02" titulo="Crie ou entre em uma pelada">
              Você é dono da que criou. Encontre outras peladas públicas na sua
              cidade e candidate-se pra participar.
            </Passo>
            <Passo numero="03" titulo="Jogue. Registre. Evolua.">
              Cada partida vira estatística. Cada temporada vira ranking. Sua
              carreira cresce a cada jogo.
            </Passo>
          </div>
        </div>
      </section>

      {/* ============================================================
          CTA final
          ============================================================ */}
      <section>
        <div className="mx-auto max-w-container px-6 py-20 text-center md:px-16">
          <h2 className="font-display text-5xl uppercase leading-none md:text-7xl">
            Bora <span className="text-accent">jogar?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-text-secondary">
            Grátis pra sempre para pequenas peladas. Cadastro em 30 segundos.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            {autenticado ? (
              <>
                <Link href="/peladas/nova">
                  <Botao>Criar pelada</Botao>
                </Link>
                <Link href="/peladas">
                  <Botao variante="secundario">Descobrir</Botao>
                </Link>
              </>
            ) : (
              <>
                <Link href="/cadastrar">
                  <Botao>Criar conta</Botao>
                </Link>
                <Link href="/entrar">
                  <Botao variante="secundario">Entrar</Botao>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

// ============================================================================
// Subcomponentes locais
// ============================================================================

function ColunaLoop({
  etiqueta,
  titulo,
  descricao,
  passos,
  cta,
  invertido,
}: {
  etiqueta: string;
  titulo: string;
  descricao: string;
  passos: string[];
  cta: { label: string; href: Route };
  invertido?: boolean;
}) {
  return (
    <div
      className={[
        'flex flex-col border border-border p-8',
        invertido ? 'bg-panel' : 'bg-panel',
      ].join(' ')}
    >
      <p
        className={[
          'text-[11px] font-bold uppercase tracking-[0.2em]',
          invertido ? 'text-dourado' : 'text-accent',
        ].join(' ')}
      >
        {etiqueta}
      </p>
      <h2 className="mt-3 font-display text-3xl uppercase leading-tight md:text-4xl">
        {titulo}
      </h2>
      <p className="mt-4 text-text-secondary">{descricao}</p>

      <ol className="mt-6 flex flex-col gap-2 text-sm">
        {passos.map((p, i) => (
          <li key={p} className="flex items-baseline gap-3">
            <span
              className={[
                'font-display text-lg leading-none',
                invertido ? 'text-dourado' : 'text-accent',
              ].join(' ')}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8">
        <Link href={cta.href}>
          <Botao variante={invertido ? 'secundario' : 'primario'}>{cta.label}</Botao>
        </Link>
      </div>
    </div>
  );
}

function FeatureTile({
  rotulo,
  valor,
  descricao,
  destaque,
}: {
  rotulo: string;
  valor: string;
  descricao: string;
  destaque?: 'dourado';
}) {
  return (
    <div className="border border-border bg-panel p-5">
      <p
        className={[
          'border-b-[3px] pb-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary',
          destaque === 'dourado' ? 'border-dourado' : 'border-accent',
        ].join(' ')}
      >
        {rotulo}
      </p>
      <p className="mt-3 font-display text-4xl leading-none md:text-5xl">{valor}</p>
      <p className="mt-3 text-xs text-text-tertiary">{descricao}</p>
    </div>
  );
}

function CardRecurso({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="border border-border bg-panel p-5">
      <p className="font-display text-lg uppercase leading-none">{titulo}</p>
      <p className="mt-3 text-sm text-text-secondary">{children}</p>
    </div>
  );
}

function Passo({
  numero,
  titulo,
  children,
}: {
  numero: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="border-l-2 border-accent bg-panel p-5">
      <p className="font-display text-4xl leading-none text-accent">{numero}</p>
      <p className="mt-3 font-display text-xl uppercase leading-tight">{titulo}</p>
      <p className="mt-2 text-sm text-text-secondary">{children}</p>
    </div>
  );
}

/**
 * Placar mock que ilustra o registro de resultado — dá vida ao hero sem depender
 * de dados reais.
 */
function MockPlacar() {
  return (
    <div className="flex flex-col gap-4 border border-border bg-panel p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
          Quinta-feira · 20:00
        </p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-accent">
          Finalizada
        </p>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            Time A
          </p>
          <p className="font-display text-6xl leading-none">4</p>
        </div>
        <p className="font-display text-3xl text-text-tertiary">×</p>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            Time B
          </p>
          <p className="font-display text-6xl leading-none">3</p>
        </div>
      </div>

      <div className="border-t border-dotted border-border-strong pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
          Destaques
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          <LinhaEvento inicial="L" nome="Lucas" gols={2} assist={1} mvp />
          <LinhaEvento inicial="J" nome="João" gols={1} assist={2} />
          <LinhaEvento inicial="P" nome="Pedro" gols={2} assist={0} />
        </ul>
      </div>
    </div>
  );
}

function LinhaEvento({
  inicial,
  nome,
  gols,
  assist,
  mvp,
}: {
  inicial: string;
  nome: string;
  gols: number;
  assist: number;
  mvp?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span className="grid h-6 w-6 place-items-center rounded-full bg-[#1C2027] font-display text-xs">
        {inicial}
      </span>
      <span className="flex-1">{nome}</span>
      <span className="text-xs text-text-secondary">
        {gols}G · {assist}A
      </span>
      {mvp && (
        <span className="border border-dourado bg-dourado/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-dourado">
          MVP
        </span>
      )}
    </li>
  );
}
