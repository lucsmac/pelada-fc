// Helpers de cor pra garantir contraste no dark bg do app.

// Converte hex (#RRGGBB) em luminância WCAG-ish [0..1]. Aceita variações
// comuns; se falhar em parsear, devolve 0.5 (assume "meia" pra não escurecer
// nem clarear sem necessidade).
function luminancia(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  // Aproximação linear — suficiente pro caso "escuro demais no bg quase preto".
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Devolve a cor original se ela tiver contraste suficiente contra o bg do app;
// senão, devolve `fallback` (por padrão o accent do design). Threshold empírico
// 0.15 — abaixo disso a cor some no #0B0D10.
export function corLegivel(hex: string | null, fallback = '#C7F23E'): string {
  if (!hex) return fallback;
  const l = luminancia(hex);
  if (l < 0.15) return fallback;
  return hex;
}
