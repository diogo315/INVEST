/**
 * Reordenar la lista de activos arrastrando.
 *
 * Sin imports, para poder probarlo solo:
 *   node --experimental-strip-types scripts/verificar-orden.mjs
 */

/**
 * Mueve el elemento `desde` a la ranura `hasta`.
 *
 * `hasta` es una **ranura**, no una posición: va de 0 (antes del primero) a
 * `lista.length` (después del último). Soltar justo antes o justo después
 * de uno mismo no cambia nada, que es lo que uno espera.
 */
export function mover<T>(lista: T[], desde: number, hasta: number): T[] {
  if (desde < 0 || desde >= lista.length) return lista;
  const ranura = Math.max(0, Math.min(lista.length, hasta));
  if (ranura === desde || ranura === desde + 1) return lista;
  const copia = [...lista];
  const [item] = copia.splice(desde, 1);
  // Al sacar el elemento, todas las ranuras posteriores se corren una.
  copia.splice(ranura > desde ? ranura - 1 : ranura, 0, item);
  return copia;
}

/**
 * En qué ranura cae el puntero, dadas las alturas de cada fila.
 *
 * La mitad de arriba de una fila es "antes de esta"; la de abajo, "después".
 * Sin eso no habría forma de soltar algo al final de la lista.
 */
export function ranuraEn(
  y: number,
  filas: Array<{ arriba: number; alto: number }>,
): number {
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (y < f.arriba + f.alto / 2) return i;
  }
  return filas.length;
}
