/**
 * Medias móviles del gráfico: un solo indicador con una lista de líneas, en
 * vez de tres slots fijos de EMA.
 *
 * Sin imports a propósito, para poder probar la migración sola:
 *   node --experimental-strip-types scripts/verificar-medias.mjs
 */

export type TipoMedia = "EMA" | "SMA";

export interface MediaMovil {
  id: string;
  tipo: TipoMedia;
  /** Cantidad de velas que promedia. */
  periodo: number;
  color: string;
  /** Grosor de la línea en píxeles (1 o 2). */
  grosor: number;
  /** Ojo de esa línea en particular. */
  visible: boolean;
}

/** Tope de líneas: más que esto no se lee en el gráfico. */
export const MAX_MEDIAS = 12;

/**
 * Colores de las líneas nuevas, en orden. Los tres primeros son los que ya
 * tenían EMA 20, 50 y 200, así que una app vieja se ve igual después de
 * migrar.
 */
export const COLORES_MEDIA = [
  "#ffb74d",
  "#2962ff",
  "#ab47bc",
  "#26a69a",
  "#ef5350",
  "#5b8dff",
  "#f06292",
  "#9ccc65",
  "#ffd54f",
  "#4dd0e1",
  "#ff8a65",
  "#b39ddb",
];

function id(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function nuevaMedia(
  periodo: number,
  usados: string[] = [],
  tipo: TipoMedia = "EMA",
): MediaMovil {
  const libre =
    COLORES_MEDIA.find((c) => !usados.includes(c)) ??
    COLORES_MEDIA[usados.length % COLORES_MEDIA.length];
  return {
    id: id(),
    tipo,
    periodo: Math.round(Math.min(2000, Math.max(1, periodo))),
    color: libre,
    grosor: periodo >= 100 ? 2 : 1,
    visible: true,
  };
}

/** Las tres de siempre, para una instalación nueva. */
export function mediasPorDefecto(): MediaMovil[] {
  return [
    { id: "ema20", tipo: "EMA", periodo: 20, color: COLORES_MEDIA[0], grosor: 1, visible: true },
    { id: "ema50", tipo: "EMA", periodo: 50, color: COLORES_MEDIA[1], grosor: 1, visible: true },
    { id: "ema200", tipo: "EMA", periodo: 200, color: COLORES_MEDIA[2], grosor: 2, visible: true },
  ];
}

/** Lo que había antes: tres slots con su período, prendido y oculto. */
export interface EstadoViejoMedias {
  periodos?: { ema20?: unknown; ema50?: unknown; ema200?: unknown };
  prendidos?: { ema20?: unknown; ema50?: unknown; ema200?: unknown };
  ocultos?: { ema20?: unknown; ema50?: unknown; ema200?: unknown };
}

const SLOTS = ["ema20", "ema50", "ema200"] as const;
const PERIODO_SLOT: Record<(typeof SLOTS)[number], number> = {
  ema20: 20,
  ema50: 50,
  ema200: 200,
};

/**
 * Convierte el estado viejo (tres indicadores sueltos) en la lista nueva.
 *
 * Reglas, pensadas para que nadie pierda lo que tenía:
 *  · entra una línea por cada slot que estuviera **agregado al gráfico**,
 *    con su período configurado y su color de siempre;
 *  · el ojo apagado de un slot pasa a `visible: false`, no se borra;
 *  · si no había ninguno, quedan las tres por defecto pero el indicador
 *    arranca apagado — igual que antes.
 */
export function migrarMedias(viejo: EstadoViejoMedias): {
  medias: MediaMovil[];
  prendido: boolean;
} {
  const num = (v: unknown, porDefecto: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 1
      ? Math.round(v)
      : porDefecto;

  const elegidos = SLOTS.filter((s) => viejo.prendidos?.[s] === true);
  if (elegidos.length === 0) {
    return { medias: mediasPorDefecto(), prendido: false };
  }

  const medias = elegidos.map((slot, i) => ({
    id: slot,
    tipo: "EMA" as TipoMedia,
    periodo: num(viejo.periodos?.[slot], PERIODO_SLOT[slot]),
    color: COLORES_MEDIA[SLOTS.indexOf(slot)] ?? COLORES_MEDIA[i],
    grosor: slot === "ema200" ? 2 : 1,
    visible: viejo.ocultos?.[slot] !== true,
  }));
  return { medias, prendido: true };
}

/** Saca la basura de una lista guardada (otra pestaña, versión vieja). */
export function sanearMedias(crudo: unknown): MediaMovil[] | null {
  if (!Array.isArray(crudo)) return null;
  const limpias = crudo
    .filter(
      (m): m is MediaMovil =>
        !!m &&
        typeof m === "object" &&
        typeof (m as MediaMovil).id === "string" &&
        typeof (m as MediaMovil).periodo === "number" &&
        Number.isFinite((m as MediaMovil).periodo),
    )
    .slice(0, MAX_MEDIAS)
    .map((m) => ({
      id: m.id,
      tipo: m.tipo === "SMA" ? ("SMA" as const) : ("EMA" as const),
      periodo: Math.round(Math.min(2000, Math.max(1, m.periodo))),
      color: typeof m.color === "string" && m.color ? m.color : COLORES_MEDIA[0],
      grosor: m.grosor === 2 ? 2 : 1,
      visible: m.visible !== false,
    }));
  return limpias.length > 0 ? limpias : null;
}
