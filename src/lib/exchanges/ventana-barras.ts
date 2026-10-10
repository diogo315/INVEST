/**
 * Desde cuándo pedirle velas a Alpaca.
 *
 * **Sin `start`, Alpaca lo interpreta como "el principio del día de hoy"** y
 * `end` como "ahora". Un sábado, un feriado o antes de la apertura eso
 * devuelve `{"bars":{}}` y el gráfico sale vacío — pasó con AMZN un sábado.
 * Por eso la ruta manda siempre una ventana hacia atrás, calculada para que
 * entren las `limit` velas pedidas aun contando fines de semana y feriados.
 *
 * Está en su propio archivo, sin imports, para poder probarlo solo:
 *   node --experimental-strip-types scripts/verificar-ventana.mjs
 */

/** Minutos de rueda regular en un día: de 9:30 a 16:00. */
const MINUTOS_DE_RUEDA = 390;

/** Alpaca no tiene histórico de acciones antes de 2016. */
export const PISO_HISTORICO = "2016-01-01";

/**
 * Fecha `YYYY-MM-DD` desde la que pedir, para una temporalidad de Alpaca
 * ("15Min", "1Hour", "1Day", "1Week", "1Month") y una cantidad de velas.
 */
export function desdeCuando(
  tf: string,
  limite: number,
  ahora: number = Date.now(),
): string {
  const m = /^(\d+)(Min|Hour|Day|Week|Month)$/.exec(tf);
  if (!m) return PISO_HISTORICO;
  const cantidad = Number(m[1]);
  const unidad = m[2];

  let dias: number;
  if (unidad === "Min") dias = (limite * cantidad) / MINUTOS_DE_RUEDA;
  else if (unidad === "Hour") dias = (limite * cantidad * 60) / MINUTOS_DE_RUEDA;
  else if (unidad === "Day") dias = limite * cantidad;
  else if (unidad === "Week") dias = limite * cantidad * 7;
  else dias = limite * cantidad * 31;

  // 1,6× por fines de semana y feriados, más una semana de colchón para que
  // un lunes feriado no deje sin velas a quien pide pocas.
  const pedido = new Date(ahora - (dias * 1.6 + 7) * 86_400_000);
  const piso = new Date(`${PISO_HISTORICO}T00:00:00Z`);
  return (pedido < piso ? piso : pedido).toISOString().slice(0, 10);
}
