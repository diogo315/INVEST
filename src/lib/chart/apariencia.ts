/**
 * Apariencia del gráfico: colores de las velas, fondo, cuadrícula, cruz.
 *
 * Todo lo visual vive acá y sale convertido en los dos objetos que pide
 * lightweight-charts (`chart.applyOptions` y `serie.applyOptions`), así que
 * cambiar un color es cambiar un dato, no tocar el componente.
 *
 * Sin imports, para poder probarlo solo:
 *   node --experimental-strip-types scripts/verificar-apariencia.mjs
 */

/** Cómo se comporta la cruz al moverse por el gráfico. */
export type ModoCruz = "libre" | "iman" | "oculta";

/** Si las líneas de la cruz son punteadas o continuas. */
export type EstiloCruz = "punteada" | "solida";

export interface Apariencia {
  /** Preset del que salió, para marcarlo en el menú. "" = retocado a mano. */
  tema: string;

  // ── colores base ──────────────────────────────────────────────────
  fondo: string;
  texto: string;
  borde: string;

  // ── velas ─────────────────────────────────────────────────────────
  subida: string;
  bajada: string;
  /** Velas de subida sin relleno, solo contorno (las "huecas" de TradingView). */
  huecas: boolean;
  bordes: boolean;
  mechas: boolean;

  // ── cuadrícula ────────────────────────────────────────────────────
  cuadriculaV: boolean;
  cuadriculaH: boolean;
  cuadricula: string;

  // ── cruz y escalas ────────────────────────────────────────────────
  cruz: ModoCruz;
  estiloCruz: EstiloCruz;
  /** Grosor de las líneas de la cruz, de 1 a 3 píxeles. */
  grosorCruz: number;
  /** La línea horizontal punteada del último precio. */
  lineaPrecio: boolean;
  escalaLog: boolean;

  /** Qué tan opacas se ven las barras de volumen, de 10 a 100. */
  opacidadVolumen: number;
}

export interface Tema {
  id: string;
  nombre: string;
  /** Lo que el preset fija; el resto queda como está. */
  colores: Pick<
    Apariencia,
    "fondo" | "texto" | "borde" | "subida" | "bajada" | "cuadricula"
  >;
}

/**
 * Los presets. El primero es el que tenía la app desde el principio, para
 * que nadie vea cambiar su gráfico sin haberlo pedido.
 */
export const TEMAS: Tema[] = [
  {
    id: "negro",
    nombre: "Negro",
    colores: {
      fondo: "#000000",
      texto: "#d1d4dc",
      borde: "#2a2e39",
      subida: "#26a69a",
      bajada: "#ef5350",
      cuadricula: "#15171f",
    },
  },
  {
    id: "tradingview",
    nombre: "TradingView",
    colores: {
      fondo: "#131722",
      texto: "#d1d4dc",
      borde: "#2a2e39",
      subida: "#26a69a",
      bajada: "#ef5350",
      cuadricula: "#1e222d",
    },
  },
  {
    id: "medianoche",
    nombre: "Medianoche",
    colores: {
      fondo: "#0b0e14",
      texto: "#c9d1d9",
      borde: "#1f2630",
      subida: "#00d9a3",
      bajada: "#ff5c7c",
      cuadricula: "#141a23",
    },
  },
  {
    id: "claro",
    nombre: "Claro",
    colores: {
      fondo: "#ffffff",
      texto: "#131722",
      borde: "#d6dae2",
      subida: "#089981",
      bajada: "#f23645",
      cuadricula: "#e9ecf2",
    },
  },
  {
    id: "daltonico",
    nombre: "Daltónico",
    colores: {
      fondo: "#0d1117",
      texto: "#d1d4dc",
      borde: "#262c36",
      // Azul y naranja en vez de verde y rojo: se distinguen con
      // daltonismo rojo-verde, que es el más común.
      subida: "#3b82f6",
      bajada: "#f97316",
      cuadricula: "#161b22",
    },
  },
];

export const APARIENCIA_POR_DEFECTO: Apariencia = {
  tema: "negro",
  ...TEMAS[0].colores,
  huecas: false,
  bordes: true,
  mechas: true,
  cuadriculaV: true,
  cuadriculaH: true,
  cruz: "libre",
  estiloCruz: "punteada",
  grosorCruz: 1,
  lineaPrecio: true,
  escalaLog: false,
  opacidadVolumen: 40,
};

/** Los campos que un preset fija. El resto son interruptores. */
export const CLAVES_DE_COLOR = [
  "fondo",
  "texto",
  "borde",
  "subida",
  "bajada",
  "cuadricula",
] as const;

/**
 * ¿Este cambio toca algún color?
 *
 * Decide si el preset sigue marcado en el menú: cambiar un color a mano ya
 * no es «Daltónico», pero apagar las mechas sí lo sigue siendo, porque el
 * tema son los colores y nada más.
 */
export function tocaColores(parche: Partial<Apariencia>): boolean {
  return CLAVES_DE_COLOR.some((k) => k in parche);
}

/** Aplica un preset encima de lo que ya hay, sin tocar los interruptores. */
export function aplicarTema(actual: Apariencia, id: string): Apariencia {
  const tema = TEMAS.find((t) => t.id === id);
  if (!tema) return actual;
  return { ...actual, ...tema.colores, tema: tema.id };
}

/** ¿Es un color hexadecimal que el navegador va a entender? */
export function esColor(v: unknown): v is string {
  return typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

/**
 * Agrega transparencia a un color hexadecimal.
 *
 * `pct` va de 0 a 100. Un #abc se expande antes a #aabbcc, porque el canal
 * alfa de dos dígitos no se puede pegar a un hex de tres.
 */
export function conAlfa(hex: string, pct: number): string {
  if (!esColor(hex)) return hex;
  const limpio = hex.trim().slice(1);
  const largo =
    limpio.length === 3
      ? limpio
          .split("")
          .map((c) => c + c)
          .join("")
      : limpio;
  const a = Math.round((Math.min(100, Math.max(0, pct)) / 100) * 255);
  return `#${largo}${a.toString(16).padStart(2, "0")}`;
}

// Constantes de lightweight-charts, puestas a mano para no importar nada.
const CRUZ = { libre: 0, iman: 1, oculta: 2 } as const;
const LINEA = { solida: 0, punteada: 1 } as const;
const ESCALA = { normal: 0, log: 1 } as const;

/** Lo que va a `chart.applyOptions`. */
export function opcionesDeChart(a: Apariencia) {
  const estilo = LINEA[a.estiloCruz];
  return {
    layout: {
      background: { color: a.fondo },
      textColor: a.texto,
      panes: { separatorColor: a.borde, separatorHoverColor: a.borde },
    },
    grid: {
      vertLines: { color: a.cuadricula, visible: a.cuadriculaV },
      horzLines: { color: a.cuadricula, visible: a.cuadriculaH },
    },
    crosshair: {
      mode: CRUZ[a.cruz],
      // La cruz vertical ya cruza todos los paneles sola: es cosa de
      // lightweight-charts. Lo que faltaba era poder verla.
      vertLine: {
        color: a.texto,
        style: estilo,
        width: a.grosorCruz,
        labelBackgroundColor: a.borde,
      },
      horzLine: {
        color: a.texto,
        style: estilo,
        width: a.grosorCruz,
        labelBackgroundColor: a.borde,
      },
    },
    rightPriceScale: {
      borderColor: a.borde,
      textColor: a.texto,
      mode: a.escalaLog ? ESCALA.log : ESCALA.normal,
    },
    timeScale: { borderColor: a.borde },
  };
}

/**
 * Lo que va a la serie de velas.
 *
 * Las huecas se hacen dejando el relleno de subida transparente y el borde
 * con color; por eso cuando están activas el borde se enciende aunque el
 * interruptor de bordes esté apagado: sin borde no quedaría nada que ver.
 */
export function opcionesDeVelas(a: Apariencia) {
  return {
    upColor: a.huecas ? "rgba(0,0,0,0)" : a.subida,
    downColor: a.bajada,
    borderUpColor: a.subida,
    borderDownColor: a.bajada,
    wickUpColor: a.subida,
    wickDownColor: a.bajada,
    borderVisible: a.bordes || a.huecas,
    wickVisible: a.mechas,
    priceLineVisible: a.lineaPrecio,
    priceLineColor: a.texto,
  };
}

/** Color de una barra de volumen según si la vela cerró arriba o abajo. */
export function colorVolumen(a: Apariencia, sube: boolean): string {
  return conAlfa(sube ? a.subida : a.bajada, a.opacidadVolumen);
}

/** Saca la basura de lo guardado y completa lo que falte. */
export function sanearApariencia(crudo: unknown): Apariencia {
  const d = APARIENCIA_POR_DEFECTO;
  if (!crudo || typeof crudo !== "object") return { ...d };
  const c = crudo as Partial<Apariencia>;

  const color = (v: unknown, pordefecto: string) =>
    esColor(v) ? v.trim().toLowerCase() : pordefecto;
  const bool = (v: unknown, pordefecto: boolean) =>
    typeof v === "boolean" ? v : pordefecto;

  return {
    tema: typeof c.tema === "string" ? c.tema : "",
    fondo: color(c.fondo, d.fondo),
    texto: color(c.texto, d.texto),
    borde: color(c.borde, d.borde),
    subida: color(c.subida, d.subida),
    bajada: color(c.bajada, d.bajada),
    cuadricula: color(c.cuadricula, d.cuadricula),
    huecas: bool(c.huecas, d.huecas),
    bordes: bool(c.bordes, d.bordes),
    mechas: bool(c.mechas, d.mechas),
    cuadriculaV: bool(c.cuadriculaV, d.cuadriculaV),
    cuadriculaH: bool(c.cuadriculaH, d.cuadriculaH),
    cruz:
      c.cruz === "iman" || c.cruz === "oculta" || c.cruz === "libre"
        ? c.cruz
        : d.cruz,
    estiloCruz: c.estiloCruz === "solida" ? "solida" : d.estiloCruz,
    grosorCruz:
      typeof c.grosorCruz === "number" && Number.isFinite(c.grosorCruz)
        ? Math.min(3, Math.max(1, Math.round(c.grosorCruz)))
        : d.grosorCruz,
    lineaPrecio: bool(c.lineaPrecio, d.lineaPrecio),
    escalaLog: bool(c.escalaLog, d.escalaLog),
    opacidadVolumen:
      typeof c.opacidadVolumen === "number" && Number.isFinite(c.opacidadVolumen)
        ? Math.min(100, Math.max(10, Math.round(c.opacidadVolumen)))
        : d.opacidadVolumen,
  };
}
