/**
 * De fecha a posición en el gráfico, y al revés.
 *
 * El problema que resuelve: `timeToCoordinate` de lightweight-charts solo
 * sabe ubicar fechas que existen **exactamente** como vela. Para cualquier
 * otra —el aire a la derecha de la última vela, el hueco de un fin de
 * semana en una acción, una fecha de otra temporalidad— devuelve `null`, y
 * un dibujo con un punto así no se dibujaba en absoluto: se marcaban los
 * dos extremos y la línea no aparecía nunca.
 *
 * La solución es trabajar con la posición *continua* en la escala (el
 * "logical" de la librería, que es el número de vela y admite decimales y
 * valores fuera de rango). Una fecha entre dos velas cae en 10,4; una
 * fecha diez velas después de la última, en 299 + 10.
 *
 * Sin imports, para poder probarlo solo:
 *   node --experimental-strip-types scripts/verificar-coordenadas.mjs
 */

export interface VelaTiempo {
  time: number;
}

/** Segundos que dura una vela, sacados de la serie. */
export function pasoDeVelas(velas: VelaTiempo[]): number {
  if (velas.length < 2) return 60;
  // La mediana de las últimas diferencias: aguanta huecos sueltos mejor
  // que el promedio o que mirar solo las dos últimas.
  const difs: number[] = [];
  for (let i = Math.max(1, velas.length - 30); i < velas.length; i++) {
    const d = velas[i].time - velas[i - 1].time;
    if (d > 0) difs.push(d);
  }
  if (difs.length === 0) return 60;
  difs.sort((a, b) => a - b);
  return difs[Math.floor(difs.length / 2)];
}

/**
 * Posición continua de una fecha dentro de la serie.
 *
 * Dentro de la serie interpola entre las dos velas que la rodean; fuera,
 * extrapola con la duración de una vela. Siempre devuelve un número: esa
 * es la gracia.
 */
export function indiceDeTiempo(velas: VelaTiempo[], t: number): number {
  if (velas.length === 0) return 0;
  const paso = pasoDeVelas(velas);
  const primera = velas[0].time;
  const ultima = velas[velas.length - 1].time;

  if (t <= primera) return (t - primera) / paso;
  if (t >= ultima) return velas.length - 1 + (t - ultima) / paso;

  // Búsqueda binaria de la última vela con tiempo <= t.
  let lo = 0;
  let hi = velas.length - 1;
  while (lo < hi) {
    const medio = Math.ceil((lo + hi) / 2);
    if (velas[medio].time <= t) lo = medio;
    else hi = medio - 1;
  }
  const actual = velas[lo].time;
  const siguiente = velas[Math.min(lo + 1, velas.length - 1)].time;
  const tramo = siguiente - actual;
  return tramo > 0 ? lo + (t - actual) / tramo : lo;
}

/** La inversa: qué fecha corresponde a una posición continua. */
export function tiempoDeIndice(velas: VelaTiempo[], indice: number): number {
  if (velas.length === 0) return 0;
  const paso = pasoDeVelas(velas);
  if (indice <= 0) return Math.round(velas[0].time + indice * paso);
  if (indice >= velas.length - 1) {
    return Math.round(
      velas[velas.length - 1].time + (indice - (velas.length - 1)) * paso,
    );
  }
  const i = Math.floor(indice);
  const resto = indice - i;
  const a = velas[i].time;
  const b = velas[i + 1].time;
  return Math.round(a + (b - a) * resto);
}
