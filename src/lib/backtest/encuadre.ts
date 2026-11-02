/**
 * Dónde queda mirando el gráfico del backtest cuando llega una vela.
 *
 * El problema que resuelve, medido: al avanzar una sola vela, TODO lo
 * dibujado se corría 10 px. La vista se volvía a encuadrar en cada paso
 * —última vela pegada al borde derecho— así que la historia entera se
 * deslizaba y el ojo perdía el punto de referencia. Repetir un tramo
 * sirve para mirar qué hizo el precio en un lugar; si el lugar se mueve
 * solo, no se puede mirar.
 *
 * La regla nueva es la de un papel cuadriculado: lo ya dibujado NO se
 * toca, y la vela nueva se agrega a la derecha. El gráfico recién se
 * desplaza cuando la última vela se está por salir de la pantalla.
 *
 * Y hay un segundo motivo para que esto exista. En temporalidades
 * chicas el backtest carga una VENTANA de velas alrededor del
 * reproductor, no la serie entera, y esa ventana se corre. Cuando trae
 * historia nueva por la izquierda, todos los índices se desplazan: un
 * rango guardado como «del índice 300 al 500» pasa a apuntar a otro
 * lado y el gráfico pega un salto. Por eso la traducción de un rango al
 * siguiente se hace por TIEMPO y no por número de vela.
 *
 * Sin React ni gráfico, para poder probarlo solo:
 *   node --experimental-strip-types scripts/verificar-encuadre.mjs
 */

export interface RangoLogico {
  from: number;
  to: number;
}

export interface OpcionesEncuadre {
  /** Ancho del primer encuadre, en velas. */
  anchoInicial: number;
  /** Aire mínimo a la derecha de la última vela, en velas. */
  margenDerecho: number;
  /**
   * Cuántas velas de aire tienen que quedar antes de desplazar.
   *
   * Con 1, el gráfico se queda quieto hasta que la última vela está a
   * punto de tocar el borde. Es la diferencia entre «se queda quieto y
   * de a ratos pasa de página» y «se desliza en cada vela», que es lo
   * que molestaba.
   */
  margenMinimo?: number;
  /**
   * Índice que la vista TIENE que alcanzar aunque no haya velas ahí.
   *
   * Lo usa el vencimiento de una opción: el hueco a la derecha es el
   * tiempo que le queda al contrato, y esconderlo sería esconder el
   * dato más importante de esa operación.
   */
  hastaIndice?: number;
}

/**
 * Cuántas velas se agregaron ADELANTE de la serie anterior.
 *
 * Positivo si la ventana trajo historia nueva por la izquierda;
 * negativo si se desprendió de velas viejas. Cero cuando no se
 * reconoce ninguna vela en común, que es el caso de cambiar de símbolo
 * o de temporalidad: ahí no hay nada que conservar.
 */
export function desplazamientoDeHistoria(
  previos: number[],
  nuevos: number[],
): number {
  if (previos.length === 0 || nuevos.length === 0) return 0;
  const k = indiceDe(nuevos, previos[0]);
  if (k !== -1) return k;
  const j = indiceDe(previos, nuevos[0]);
  if (j !== -1) return -j;
  return 0;
}

/** Búsqueda binaria exacta sobre tiempos ordenados. */
function indiceDe(tiempos: number[], t: number): number {
  let lo = 0;
  let hi = tiempos.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (tiempos[m] === t) return m;
    if (tiempos[m] < t) lo = m + 1;
    else hi = m - 1;
  }
  return -1;
}

/**
 * El rango visible que corresponde después de que cambiaron las velas.
 *
 * Devuelve null cuando no hay nada que encuadrar.
 *
 * Nunca desplaza hacia la IZQUIERDA. Si alguien arrastró el gráfico
 * para mirar un tramo de hace tres días, el reproductor no tiene por
 * qué arrancarlo de ahí: se queda donde lo dejaron hasta que decidan
 * volver.
 */
export function encuadreSiguiente(
  previo: RangoLogico | null,
  previos: number[],
  nuevos: number[],
  op: OpcionesEncuadre,
): RangoLogico | null {
  const n = nuevos.length;
  if (n === 0) return null;
  const margen = Math.max(0, op.margenDerecho);

  // Primer encuadre, o serie sin nada en común con la anterior: la
  // última vela va cerca del borde derecho y se muestra la historia.
  if (!previo || previos.length === 0 || !(previo.to > previo.from)) {
    const ancho = Math.max(10, op.anchoInicial);
    const to = Math.max(n - 1 + aireDerecho(ancho, margen), op.hastaIndice ?? -Infinity);
    return { from: to - ancho, to };
  }

  const d = desplazamientoDeHistoria(previos, nuevos);
  const ancho = previo.to - previo.from;
  let to = previo.to + d;

  // ¿La vista venía SIGUIENDO al reproductor? Si la última vela de
  // antes ya estaba fuera por la derecha, es que alguien arrastró el
  // gráfico al pasado a mirar algo. A ese no se lo arranca de ahí: la
  // vela nueva aparece fuera de la vista y está bien, vuelve cuando
  // quiera.
  const seguia = previos.length - 1 <= previo.to;

  if (seguia) {
    const minimo = Math.max(0, op.margenMinimo ?? 1);
    // Se desplaza SOLO cuando a la última vela ya no le queda aire.
    // Mientras quede, las velas lo van llenando y nada se mueve.
    if (n - 1 + minimo > to) to = n - 1 + aireDerecho(ancho, margen);
    if (op.hastaIndice !== undefined && op.hastaIndice > to) to = op.hastaIndice;
  }

  return { from: to - ancho, to };
}

/**
 * El aire que se deja a la derecha: un quinto de lo que se ve.
 *
 * Es lo que decide cada cuánto el gráfico pasa de página. Con seis
 * velas de aire —lo que había— se desplazaba cada seis pasos, que a ojo
 * es casi lo mismo que desplazarse siempre. Con un quinto de la
 * ventana son unas veinticinco velas quietas en un encuadre normal:
 * alcanza para mirar cómo se forma un tramo sin que el gráfico se
 * escape.
 */
export function aireDerecho(ancho: number, minimo: number): number {
  return Math.max(minimo, Math.round(ancho * 0.2));
}
