/**
 * Alertas: qué se vigila, cuándo se considera que saltó y qué texto se
 * muestra.
 *
 * Sin imports a propósito, para poder probar la lógica sola:
 *   node --experimental-strip-types scripts/verificar-alertas.mjs
 */

/** Qué se vigila. Todas terminan en un número que se compara igual. */
export type FuenteAlerta = "precio" | "rsi" | "supertrend" | "cruceMedias";

/** Cómo se compara ese número contra el nivel. */
export type CondicionAlerta =
  | "cruzaArriba"
  | "cruzaAbajo"
  | "mayorQue"
  | "menorQue";

export interface Alerta {
  id: string;
  /** Activo con prefijo de exchange, p. ej. "BIN:BTCUSDT". */
  simbolo: string;
  /** Temporalidad sobre la que se calcula (las de precio la ignoran). */
  timeframe: string;
  fuente: FuenteAlerta;
  condicion: CondicionAlerta;
  /** El nivel. En Supertrend y cruce de medias es siempre 0. */
  valor: number;
  /** Longitud del RSI, o la media rápida del cruce. */
  periodo: number;
  /** Media lenta del cruce. */
  periodo2: number;
  /** Apagada no se evalúa. */
  activa: boolean;
  /** Se apaga sola después de saltar una vez. */
  unaVez: boolean;
  sonido: boolean;
  creada: number;
  ultimoDisparo?: number;
}

/** Un salto registrado, para la lista de "qué pasó mientras no miraba". */
export interface Disparo {
  id: string;
  alertaId: string;
  simbolo: string;
  texto: string;
  cuando: number;
}

export const MAX_ALERTAS = 40;
export const MAX_DISPAROS = 50;

export const FUENTES: Array<{ id: FuenteAlerta; etiqueta: string }> = [
  { id: "precio", etiqueta: "Precio" },
  { id: "rsi", etiqueta: "RSI" },
  { id: "supertrend", etiqueta: "Supertrend (cambio de lado)" },
  { id: "cruceMedias", etiqueta: "Cruce de medias" },
];

export const CONDICIONES: Array<{ id: CondicionAlerta; etiqueta: string }> = [
  { id: "cruzaArriba", etiqueta: "cruza hacia arriba" },
  { id: "cruzaAbajo", etiqueta: "cruza hacia abajo" },
  { id: "mayorQue", etiqueta: "es mayor que" },
  { id: "menorQue", etiqueta: "es menor que" },
];

/** Las fuentes que no llevan nivel: el cruce es contra cero. */
export function usaNivel(f: FuenteAlerta): boolean {
  return f === "precio" || f === "rsi";
}

/**
 * ¿Saltó?
 *
 * Los cruces necesitan el valor **anterior**: sin él no se puede distinguir
 * "cruzó recién" de "ya estaba arriba", y la alerta saltaría en cuanto se
 * crea. Por eso la primera lectura de una alerta nunca dispara un cruce.
 */
export function seDispara(
  a: Pick<Alerta, "condicion" | "valor">,
  anterior: number | undefined,
  actual: number,
): boolean {
  if (!Number.isFinite(actual)) return false;
  switch (a.condicion) {
    case "mayorQue":
      return actual > a.valor;
    case "menorQue":
      return actual < a.valor;
    case "cruzaArriba":
      return (
        anterior !== undefined &&
        Number.isFinite(anterior) &&
        anterior <= a.valor &&
        actual > a.valor
      );
    case "cruzaAbajo":
      return (
        anterior !== undefined &&
        Number.isFinite(anterior) &&
        anterior >= a.valor &&
        actual < a.valor
      );
    default:
      return false;
  }
}

/** Nombre corto del activo, sin el prefijo del exchange. */
function ticker(simbolo: string): string {
  const i = simbolo.indexOf(":");
  return i >= 0 ? simbolo.slice(i + 1) : simbolo;
}

/** Cómo se describe la alerta en la lista y en la notificación. */
export function describirAlerta(a: Alerta): string {
  const t = ticker(a.simbolo);
  const cond =
    CONDICIONES.find((c) => c.id === a.condicion)?.etiqueta ?? a.condicion;
  if (a.fuente === "precio") return `${t}: el precio ${cond} ${a.valor}`;
  if (a.fuente === "rsi")
    return `${t} ${a.timeframe}: el RSI ${a.periodo} ${cond} ${a.valor}`;
  if (a.fuente === "supertrend")
    return `${t} ${a.timeframe}: el Supertrend se pone ${
      a.condicion === "cruzaArriba" ? "alcista" : "bajista"
    }`;
  return `${t} ${a.timeframe}: la media ${a.periodo} cruza ${
    a.condicion === "cruzaArriba" ? "hacia arriba" : "hacia abajo"
  } a la ${a.periodo2}`;
}

/** El texto que se guarda cuando salta, con el valor del momento. */
export function textoDisparo(a: Alerta, valor: number): string {
  const t = ticker(a.simbolo);
  if (a.fuente === "precio") return `${t} tocó ${valor}`;
  if (a.fuente === "rsi")
    return `${t} ${a.timeframe}: RSI ${a.periodo} en ${valor.toFixed(1)}`;
  if (a.fuente === "supertrend")
    return `${t} ${a.timeframe}: Supertrend ${valor > 0 ? "alcista" : "bajista"}`;
  return `${t} ${a.timeframe}: cruce de medias ${a.periodo}/${a.periodo2}`;
}

/** Valores por defecto de una alerta nueva. */
export function alertaNueva(
  id: string,
  simbolo: string,
  timeframe: string,
  precio: number,
): Alerta {
  return {
    id,
    simbolo,
    timeframe,
    fuente: "precio",
    condicion: "cruzaArriba",
    valor: Number.isFinite(precio) && precio > 0 ? redondear(precio) : 0,
    periodo: 14,
    periodo2: 50,
    activa: true,
    unaVez: true,
    sonido: true,
    creada: Date.now(),
  };
}

/**
 * Redondeo con sentido para proponer un nivel: no tiene gracia sugerir
 * 83044.123456 ni 0.00 para una moneda que vale centésimas.
 */
export function redondear(precio: number): number {
  const abs = Math.abs(precio);
  const decimales = abs >= 1000 ? 0 : abs >= 10 ? 2 : abs >= 0.1 ? 4 : 8;
  return Number(precio.toFixed(decimales));
}
