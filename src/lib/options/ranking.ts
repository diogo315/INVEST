/**
 * Ranking del autocompletado de tickers.
 *
 * Separado de la ruta para poder probarlo solo:
 *   node --experimental-strip-types scripts/verificar-busqueda.mjs
 */

export interface Activo {
  /** Ticker. */
  s: string;
  /** Nombre de la empresa. */
  n: string;
  /** Mercado. */
  e: string;
}

/**
 * Ordena por qué tan directo es el match, de más a menos:
 *   1. el símbolo exacto
 *   2. el símbolo empieza con lo escrito
 *   3. el nombre de la empresa empieza con lo escrito
 *   4. el nombre lo contiene
 *
 * Dentro de cada grupo gana el símbolo más corto, que en la práctica es el
 * papel principal y no una serie rara.
 */
export function rankearActivos(
  activos: Activo[],
  consulta: string,
  limite = 20,
): Activo[] {
  const t = consulta.trim().toUpperCase();
  if (!t) return [];

  const exacto: Activo[] = [];
  const simbolo: Activo[] = [];
  const nombreEmpieza: Activo[] = [];
  const nombreContiene: Activo[] = [];

  for (const a of activos) {
    const n = a.n.toUpperCase();
    if (a.s === t) exacto.push(a);
    else if (a.s.startsWith(t)) simbolo.push(a);
    else if (n.startsWith(t)) nombreEmpieza.push(a);
    else if (n.includes(t)) nombreContiene.push(a);
  }

  const porSimbolo = (x: Activo, y: Activo) =>
    x.s.length - y.s.length || x.s.localeCompare(y.s);

  return [
    ...exacto,
    ...simbolo.sort(porSimbolo),
    ...nombreEmpieza.sort(porSimbolo),
    ...nombreContiene.sort(porSimbolo),
  ].slice(0, limite);
}
