/**
 * Las cuentas de una corrida, con su margen de error.
 *
 * POR QUÉ ESTO EXISTE. La estrategia dispara pocas veces: en seis meses
 * salen una o dos docenas de operaciones por activo. Con veinte
 * operaciones, la diferencia entre 55 % y 45 % de aciertos es azar puro.
 * Decir "este activo rinde más" sin poner el margen de error al lado es
 * inventar un resultado.
 *
 * Así que todo lo que se muestra viene con su intervalo, y hay una
 * función que responde la pregunta que de verdad importa: ¿este número
 * alcanza para concluir algo, o no?
 *
 * Sin imports:
 *   node --experimental-strip-types scripts/verificar-estadistica.mjs
 */

export interface Resumen {
  /** Cuántas operaciones. */
  n: number;
  /** Aciertos sobre el total, de 0 a 1. */
  aciertos: number;
  /** Intervalo de Wilson al 95 % para los aciertos. */
  aciertosIC: [number, number];
  /** Suma de erres. */
  erresTotal: number;
  /** Erres por operación: la esperanza. */
  esperanza: number;
  /** Intervalo al 95 % para la esperanza. */
  esperanzaIC: [number, number];
  /** Desviación de los resultados, en erres. */
  desvio: number;
  /** Ganancia bruta sobre pérdida bruta. */
  factor: number;
  /** Peor racha acumulada, en erres. */
  caidaMaxima: number;
  /**
   * Si los datos alcanzan para afirmar que hay ventaja.
   *
   * Es cierto solo cuando el intervalo de la esperanza queda ENTERO por
   * encima de cero. Con pocas operaciones nunca va a dar true, y eso es
   * exactamente lo que hay que ver.
   */
  concluyente: boolean;
}

/** Valores de t de Student al 95 %, por grados de libertad. */
const T95: Record<number, number> = {
  1: 12.71, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
  8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086,
  25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980,
};

/**
 * t al 95 % para `gl` grados de libertad.
 *
 * Con muestras chicas usar 1,96 (el valor normal) subestima el margen y
 * hace parecer concluyente algo que no lo es. Con 10 operaciones el
 * valor correcto es 2,26, un 15 % más ancho.
 */
export function tDe(gl: number): number {
  if (gl < 1) return T95[1];
  if (T95[gl] !== undefined) return T95[gl];
  const claves = Object.keys(T95).map(Number).sort((a, b) => a - b);
  for (const k of claves) if (gl < k) return T95[k];
  return 1.96;
}

/**
 * Intervalo de Wilson para una proporción.
 *
 * No el de Wald (p ± z·√(p(1−p)/n)), que con pocas operaciones o con
 * proporciones cerca de 0 o 1 se va fuera del rango [0,1] y da intervalos
 * absurdos como "entre −5 % y 25 %".
 */
export function wilson(exitos: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 0];
  const p = exitos / n;
  const d = 1 + (z * z) / n;
  const centro = (p + (z * z) / (2 * n)) / d;
  const mitad = (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, centro - mitad), Math.min(1, centro + mitad)];
}

/** Las cuentas de una lista de resultados en erres. */
export function resumir(erres: number[]): Resumen {
  const n = erres.length;
  if (n === 0) {
    return {
      n: 0, aciertos: 0, aciertosIC: [0, 0], erresTotal: 0, esperanza: 0,
      esperanzaIC: [0, 0], desvio: 0, factor: 0, caidaMaxima: 0,
      concluyente: false,
    };
  }
  const exitos = erres.filter((e) => e > 0).length;
  const total = erres.reduce((s, e) => s + e, 0);
  const media = total / n;
  // Desviación muestral (n−1): con n chico, dividir por n subestima.
  const varianza =
    n > 1 ? erres.reduce((s, e) => s + (e - media) ** 2, 0) / (n - 1) : 0;
  const desvio = Math.sqrt(varianza);
  const margen = n > 1 ? (tDe(n - 1) * desvio) / Math.sqrt(n) : Infinity;
  const ganado = erres.filter((e) => e > 0).reduce((s, e) => s + e, 0);
  const perdido = -erres.filter((e) => e < 0).reduce((s, e) => s + e, 0);

  // Peor racha: lo que se cae desde el punto más alto de la curva.
  let pico = 0;
  let acum = 0;
  let caida = 0;
  for (const e of erres) {
    acum += e;
    if (acum > pico) pico = acum;
    if (pico - acum > caida) caida = pico - acum;
  }

  const ic: [number, number] = Number.isFinite(margen)
    ? [media - margen, media + margen]
    : [-Infinity, Infinity];

  return {
    n,
    aciertos: exitos / n,
    aciertosIC: wilson(exitos, n),
    erresTotal: total,
    esperanza: media,
    esperanzaIC: ic,
    desvio,
    factor: perdido > 0 ? ganado / perdido : ganado > 0 ? Infinity : 0,
    caidaMaxima: caida,
    concluyente: Number.isFinite(margen) && media - margen > 0,
  };
}

/**
 * Cuántas operaciones harían falta para distinguir esta esperanza del cero.
 *
 * Responde "¿cuánto más tengo que correr esto para saber algo?". Sale de
 * despejar n de media − t·s/√n > 0, con t ≈ 2.
 */
export function operacionesNecesarias(r: Resumen): number | null {
  if (r.n < 2 || r.desvio <= 0 || r.esperanza <= 0) return null;
  const n = Math.ceil((2 * r.desvio / r.esperanza) ** 2);
  return Math.max(n, r.n);
}

/**
 * ¿La diferencia entre dos activos es real o es ruido?
 *
 * Si los intervalos se pisan, no hay con qué afirmar que uno sea mejor.
 * Es la respuesta honesta a "¿qué activo rinde más?" cuando hay pocas
 * operaciones, que es casi siempre.
 */
export function seSolapan(a: Resumen, b: Resumen): boolean {
  if (a.n < 2 || b.n < 2) return true;
  return a.esperanzaIC[0] <= b.esperanzaIC[1] && b.esperanzaIC[0] <= a.esperanzaIC[1];
}
