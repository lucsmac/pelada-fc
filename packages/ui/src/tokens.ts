export const cores = {
  bg: '#0B0D10',
  navBg: '#0E1013',
  panel: '#14171C',
  panel2: '#1B1F26',
  border: '#21252C',
  borderStrong: '#262B32',
  text: '#F4F5F6',
  textSecondary: '#8A929D',
  textTertiary: '#5C6470',
  accent: '#C7F23E',
  dourado: '#F2A93C',
} as const;

export const accentThemes = {
  lima: '#C7F23E',
  dourado: '#F2A93C',
  ciano: '#4FD1FF',
  coral: '#FF6B6B',
} as const;
export type AccentTheme = keyof typeof accentThemes;

export const fontes = {
  display: "'Anton', sans-serif",
  ui: "'Manrope', system-ui, sans-serif",
} as const;

export const espacamentos = {
  navHeight: 76,
  containerMaxWidth: 1312,
  paddingX: 64,
} as const;
