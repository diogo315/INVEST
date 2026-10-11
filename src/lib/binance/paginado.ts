/**
 * Traer más de mil velas.
 *
 * Los exchanges devuelven como mucho 1.000 velas por pedido. Para ver
 * 5.000 o 10.000 hay que pedir varias páginas, y conviene hacerlo **en
 * paralelo**: el largo de cada vela es conocido, así que se puede calcular
 * de antemano dónde termina cada página en vez de encadenar diez pedidos
 * uno detrás del otro (eso tardaba segundos).
 *
 * Sin imports a propósito, para poder probarlo solo:
 *   node --experimental-strip-types scripts/verificar-paginado.mjs
 */

export interface VelaMinima {
  time: number;
}

/** Opciones de historia que ofrece la app. */
export const OPCIONES_HISTORIA = [1000, 2500, 5000, 10000] as const;
export const HISTORIA_POR_DEFECTO = 1000;

/**
 * Dónde termina cada página, de la más nueva a la más vieja.
 *
 * Cada `fin` es el milisegundo hasta el que pide esa página. La siguiente
 * retrocede `porPedido` velas, con **una vela de solape** para que un hueco
 * en el exchange no parta la serie en dos.
 */
export function ventanasKlines(
  segundosPorVela: number,
  limite: number,
  ahoraMs: number,
  porPedido = 1000,
): number[] {
  // Cada página aporta `porPedido - 1` velas nuevas, porque la primera de
  // cada una repite la última de la anterior (el solape). Sin tenerlo en
  // cuenta, pedir 3.000 devolvía 2.998.
  const paginas =
    limite <= porPedido ? 1 : Math.ceil(limite / (porPedido - 1));
  const saltoMs = (porPedido - 1) * segundosPorVela * 1000;
  return Array.from({ length: paginas }, (_, i) => ahoraMs - i * saltoMs);
}

/**
 * Junta las páginas en una sola serie: saca repetidas, ordena de vieja a
 * nueva y deja las últimas `limite`.
 */
export function unirVelas<T extends VelaMinima>(partes: T[][], limite: number): T[] {
  const porTiempo = new Map<number, T>();
  for (const parte of partes) {
    for (const v of parte) porTiempo.set(v.time, v);
  }
  const todas = [...porTiempo.values()].sort((a, b) => a.time - b.time);
  return todas.length > limite ? todas.slice(-limite) : todas;
}

/**
 * Pide las páginas que hagan falta y las junta. `pedir` recibe el fin de la
 * ventana en milisegundos (sin fin para la más nueva) y devuelve esa página.
 *
 * Una página que falle se descarta en vez de tirar todo: con 10 pedidos en
 * paralelo, que el exchange corte uno es normal y es mejor mostrar 9.000
 * velas que ninguna.
 */
export async function traerPaginado<T extends VelaMinima>(
  pedir: (finMs: number | undefined, limite: number) => Promise<T[]>,
  segundosPorVela: number,
  limite: number,
  porPedido = 1000,
  ahoraMs = Date.now(),
): Promise<T[]> {
  if (limite <= porPedido) return pedir(undefined, limite);
  const ventanas = ventanasKlines(segundosPorVela, limite, ahoraMs, porPedido);
  const partes = await Promise.all(
    ventanas.map((fin, i) =>
      pedir(i === 0 ? undefined : fin, porPedido).catch(() => [] as T[]),
    ),
  );
  return unirVelas(partes, limite);
}
