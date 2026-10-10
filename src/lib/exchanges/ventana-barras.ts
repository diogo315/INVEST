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

/** Días de calendario que cubre una ventana (una página de Alpaca). */
const DIAS_POR_VENTANA = 30;
/** Días de rueda que entran en esos 30 de calendario, con margen. */
const RUEDA_POR_VENTANA = 21;
/** Tope de ventanas que se piden en paralelo. */
export const MAX_VENTANAS = 10;

/**
 * Alpaca **no pagina por cantidad de velas sino por cuántos datos crudos
 * recorre**: cada página cubre más o menos el mismo tramo de tiempo sin
 * importar la temporalidad. Medido con AMZN: 15Min devolvió 705 velas,
 * 1Hour 197 y 4Hour 52, las tres terminando el mismo día. Pedir 1000 velas
 * de 4H en una sola llamada devuelve dos semanas.
 *
 * Entonces el rango se parte en ventanas del tamaño de una página y se
 * piden en paralelo. Para 1Day y más arriba no hace falta: una sola página
 * ya trae las 1000.
 */
export function ventanasDeBarras(
  tf: string,
  limite: number,
  ahora: number = Date.now(),
): Array<{ desde: string; hasta: string }> {
  const m = /^(\d+)(Min|Hour|Day|Week|Month)$/.exec(tf);
  const desdeTodo = desdeCuando(tf, limite, ahora);
  // Mañana: `end` en el futuro Alpaca lo recorta a "ahora", y así no se
  // pierde la vela de hoy por una diferencia de horas.
  const fin = new Date(ahora + 86_400_000).toISOString().slice(0, 10);
  if (!m) return [{ desde: desdeTodo, hasta: fin }];

  const cantidad = Number(m[1]);
  const unidad = m[2];
  if (unidad !== "Min" && unidad !== "Hour") {
    return [{ desde: desdeTodo, hasta: fin }];
  }

  const porDia =
    unidad === "Min" ? MINUTOS_DE_RUEDA / cantidad : 6.5 / cantidad;
  const porVentana = Math.max(1, porDia * RUEDA_POR_VENTANA);
  const cuantas = Math.min(MAX_VENTANAS, Math.ceil(limite / porVentana));

  const ventanas: Array<{ desde: string; hasta: string }> = [];
  for (let i = 0; i < cuantas; i++) {
    // De la más nueva a la más vieja: si se corta por el tope, lo que falta
    // es historia antigua, no el tramo reciente.
    const hasta = new Date(ahora - i * DIAS_POR_VENTANA * 86_400_000);
    const desde = new Date(hasta.getTime() - DIAS_POR_VENTANA * 86_400_000);
    const piso = new Date(`${PISO_HISTORICO}T00:00:00Z`);
    if (hasta < piso) break;
    ventanas.push({
      desde: (desde < piso ? piso : desde).toISOString().slice(0, 10),
      // Un día de solape evita perder la vela que queda justo en el borde.
      hasta: new Date(hasta.getTime() + 86_400_000).toISOString().slice(0, 10),
    });
  }
  return ventanas;
}
