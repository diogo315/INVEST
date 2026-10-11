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

// ───────────────────────── categorías dentro de la lista ──────────────

/** Una categoría dentro de una lista: "Cripto", "Mis apuestas", etc. */
export interface Seccion {
  id: string;
  nombre: string;
  /** Plegada: se ve el título y no los activos. */
  plegada: boolean;
}

/** Un bloque de la lista ya listo para dibujar. */
export interface BloqueMostrado {
  /** null = los que no están en ninguna categoría. */
  seccion: Seccion | null;
  simbolos: string[];
}

/**
 * Arma los bloques a dibujar: primero los activos sueltos (sin título) y
 * después cada categoría en su orden, con sus activos en el orden de la
 * lista.
 *
 * La pertenencia va aparte del orden a propósito: `simbolos` sigue siendo
 * la única lista de qué hay en el watchlist —de ahí salen los precios y
 * todo lo demás— y `grupo` solo dice en qué categoría cae cada uno. Así
 * una categoría borrada no se lleva ningún activo puesto.
 */
export function agruparParaMostrar(
  simbolos: string[],
  grupo: Record<string, string>,
  secciones: Seccion[],
): BloqueMostrado[] {
  const vivas = new Set(secciones.map((s) => s.id));
  const sueltos = simbolos.filter((s) => {
    const g = grupo[s];
    return !g || !vivas.has(g);
  });

  const bloques: BloqueMostrado[] = [];
  if (sueltos.length > 0 || secciones.length === 0) {
    bloques.push({ seccion: null, simbolos: sueltos });
  }
  for (const sec of secciones) {
    bloques.push({
      seccion: sec,
      simbolos: simbolos.filter((s) => grupo[s] === sec.id),
    });
  }
  return bloques;
}

/**
 * Nombre que no choque con otro: "Cripto" ya usada pasa a "Cripto (2)".
 */
export function nombreDeSeccionLibre(secciones: Seccion[], deseado: string): string {
  const base = deseado.trim().slice(0, 30) || "Categoría";
  const usados = new Set(secciones.map((s) => s.nombre.toLowerCase()));
  if (!usados.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) {
    const intento = `${base} (${i})`;
    if (!usados.has(intento.toLowerCase())) return intento;
  }
  return `${base} ${secciones.length + 1}`;
}

/** Saca la basura de lo guardado. */
export function sanearSecciones(crudo: unknown): Seccion[] {
  if (!Array.isArray(crudo)) return [];
  return crudo
    .filter(
      (s): s is Seccion =>
        !!s && typeof s === "object" && typeof (s as Seccion).id === "string",
    )
    .slice(0, 20)
    .map((s) => ({
      id: s.id,
      nombre:
        typeof s.nombre === "string" && s.nombre.trim()
          ? s.nombre.slice(0, 30)
          : "Categoría",
      plegada: s.plegada === true,
    }));
}
