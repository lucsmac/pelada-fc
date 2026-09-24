export const MODALIDADES = [
  'fut7',
  'campo_7',
  'campo_11',
  'society',
  'futsal',
  'beach_soccer',
  'futevolei',
] as const;
export type Modalidade = (typeof MODALIDADES)[number];

export const MODALIDADE_LABEL: Record<Modalidade, string> = {
  fut7: 'Fut7',
  campo_7: 'Campo 7',
  campo_11: 'Campo 11',
  society: 'Society',
  futsal: 'Futsal',
  beach_soccer: 'Futebol de areia',
  futevolei: 'Futevôlei',
};
