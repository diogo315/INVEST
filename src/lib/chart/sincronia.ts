/**
 * Cruz sincronizada entre los gráficos abiertos.
 *
 * Con 2, 3 o 4 gráficos en pantalla, pasar el mouse por uno mueve la línea
 * vertical de todos a la **misma fecha**: así se compara qué pasó el mismo
 * día en cada activo. La línea horizontal de cada uno se apoya en su propio
 * cierre, no en el precio del otro (comparar 83.000 con 110 no tendría
 * sentido).
 *
 * Es un registro suelto a nivel de módulo y no un contexto de React a
 * propósito: lo usan los callbacks del chart, que no son reactivos, y así no
 * se vuelve a renderizar nada al mover el mouse.
 */

import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";

interface Inscripto {
  chart: IChartApi;
  /** La serie sobre la que se posiciona la cruz (las velas). */
  serie: ISeriesApi<SeriesType>;
  /**
   * La vela de ESE gráfico que contiene una fecha. No alcanza con buscar el
   * tiempo exacto: si uno está en 4H y el otro en 1D, ningún timestamp de 4H
   * existe en el diario y la cruz no se movería. Se usa la última vela que
   * empezó en esa fecha o antes.
   */
  velaEn: (t: number) => { time: number; close: number } | undefined;
  /**
   * Pone la fila O/H/L/C de ese gráfico en esa fecha (null la borra). Se
   * hace a mano y no se deja en manos del evento de la librería: cuando la
   * cruz se mueve por código, el gráfico que la recibe no siempre trae los
   * datos de la vela, y la fila quedaba vacía.
   */
  mostrarVela: (t: number | null) => void;
}

const inscriptos = new Map<string, Inscripto>();

/**
 * Mientras se replica la cruz, los gráficos que la reciben disparan su
 * propio evento de movimiento. Sin esta bandera se llamarían en círculo.
 */
let replicando = false;

export function registrarGrafico(id: string, datos: Inscripto): () => void {
  inscriptos.set(id, datos);
  return () => {
    if (inscriptos.get(id) === datos) inscriptos.delete(id);
  };
}

/** Actualiza el buscador de velas cuando el gráfico recarga sus datos. */
export function actualizarPrecios(id: string, velaEn: Inscripto["velaEn"]) {
  const i = inscriptos.get(id);
  if (i) i.velaEn = velaEn;
}

/**
 * Última vela que empezó en `t` o antes, por búsqueda binaria: se llama en
 * cada movimiento del mouse y recorrer mil velas por gráfico se nota.
 */
export function buscadorDeVelas<T extends { time: number }>(
  velas: T[],
): (t: number) => T | undefined {
  return (t) => {
    if (velas.length === 0 || t < velas[0].time) return undefined;
    let lo = 0;
    let hi = velas.length - 1;
    while (lo < hi) {
      const medio = Math.ceil((lo + hi) / 2);
      if (velas[medio].time <= t) lo = medio;
      else hi = medio - 1;
    }
    return velas[lo];
  };
}

/**
 * Lleva la cruz de `origen` a todos los demás. Con `tiempo` en null, se
 * borra (el mouse salió del gráfico).
 */
export function difundirCruz(origen: string, tiempo: number | null) {
  if (replicando || inscriptos.size < 2) return;
  replicando = true;
  try {
    for (const [id, i] of inscriptos) {
      if (id === origen) continue;
      try {
        if (tiempo === null) {
          i.chart.clearCrosshairPosition();
          i.mostrarVela(null);
        } else {
          const vela = i.velaEn(tiempo);
          // Sin ninguna vela anterior a esa fecha (el activo todavía no
          // cotizaba) se deja la cruz donde estaba.
          if (vela) {
            i.chart.setCrosshairPosition(vela.close, vela.time as Time, i.serie);
            i.mostrarVela(vela.time);
          }
        }
      } catch {
        // Un gráfico que se está desmontando: no es un problema.
      }
    }
  } finally {
    replicando = false;
  }
}
