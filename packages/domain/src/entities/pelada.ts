import type { Modalidade } from '../value-objects/modalidade.js';

export const DIAS_SEMANA = [
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

export interface Pelada {
  readonly id: string;
  readonly slug: string;
  readonly nome: string;
  readonly modalidade: Modalidade;
  readonly localId: string;
  readonly diaSemana: DiaSemana;
  readonly horario: string;
  readonly quantidadeTimes: number;
  readonly jogadoresPorTime: number;
  readonly goleirosPorTime: number;
  readonly tamanhoReserva: number;
  readonly abertaParaNovos: boolean;
  readonly publica: boolean;
  readonly temporadaAtualId?: string;
  readonly criadoEm: Date;
}
