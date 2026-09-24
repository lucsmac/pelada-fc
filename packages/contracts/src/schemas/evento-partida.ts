import { z } from 'zod';

// Tipos de jogada suportados no modo ao vivo:
//  - `gol`               → conta pro placar do time do próprio evento.
//  - `gol_contra`        → semanticamente igual ao gol (o cliente já traduz
//                          para o time beneficiado ao gravar), separado para
//                          exibir corretamente no log de eventos.
//  - `penalti_desempate` → gol da disputa de pênaltis/shootout; NÃO conta no
//                          placar principal (que continua empatado), apenas
//                          registra a jogada para o log final.
//  - `expulsao`          → jogador foi expulso; UI desabilita o botão dele.
//                          Não altera placar.
//  - `substituicao`      → registra troca de jogador em campo. `teamId` = time
//                          destino, `jogadorId` = quem entrou, `assistenteJogadorId`
//                          reaproveitado como "quem saiu" (nullable). Permite
//                          desfazer a troca via DELETE evento.
//  - `rodada_encerrada`  → âncora que fecha a rodada num racha de 3+ times.
//                          `teamId` = vencedor da rodada. Placar da próxima
//                          rodada é calculado só a partir de eventos após
//                          o último `rodada_encerrada`. Sem jogador/assist.
export const TIPO_EVENTO = [
  'gol',
  'gol_contra',
  'penalti_desempate',
  'expulsao',
  'substituicao',
  'rodada_encerrada',
] as const;
export const tipoEventoSchema = z.enum(TIPO_EVENTO);
export type TipoEvento = z.infer<typeof tipoEventoSchema>;

// DTO enviado na resposta de qualquer mutation de partida ao vivo. O jogador
// vem embutido para a UI conseguir renderizar o log sem lookup extra; `jogador`
// é null quando o gol foi gravado sem identificar o autor (botão de atalho).
// `assistente` só faz sentido quando `tipo=gol`; null caso contrário.
const jogadorMiniSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  avatarInicial: z.string().length(1),
});

export const eventoPartidaDTOSchema = z.object({
  id: z.string().uuid(),
  partidaId: z.string().uuid(),
  teamId: z.string().uuid(),
  jogadorId: z.string().uuid().nullable(),
  assistenteJogadorId: z.string().uuid().nullable(),
  tipo: tipoEventoSchema,
  minutoJogo: z.number().int().nonnegative(),
  criadoEm: z.coerce.date(),
  jogador: jogadorMiniSchema.nullable(),
  assistente: jogadorMiniSchema.nullable(),
});
export type EventoPartidaDTO = z.infer<typeof eventoPartidaDTOSchema>;
