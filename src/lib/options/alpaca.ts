/**
 * Cliente de la cadena de opciones de Alpaca.
 *
 * Nunca le pega a Alpaca directo: pasa por `/api/alpaca`, que es donde vive
 * la clave. Acá solo está el parseo de la respuesta.
 *
 * Nombres de campo confirmados contra el SDK oficial (`alpaca-py`,
 * `alpaca/data/mappings.py`): `latestTrade` / `latestQuote` /
 * `impliedVolatility` / `greeks`, y dentro de quote `ap`/`bp`/`as`/`bs`,
 * dentro de trade `p`/`s`/`t`.
 */

import type { TipoOpcion } from "./black-scholes";

export interface Contrato {
  /** Símbolo OCC, por ejemplo AAPL251121C00250000. */
  simbolo: string;
  raiz: string;
  /** Vencimiento en formato YYYY-MM-DD. */
  vencimiento: string;
  tipo: TipoOpcion;
  strike: number;
  bid: number | null;
  ask: number | null;
  ultimo: number | null;
  /** Punto medio entre bid y ask; es el precio con el que conviene calcular. */
  medio: number | null;
  /** Volatilidad implícita en tanto por uno. */
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

export interface Cadena {
  simbolo: string;
  contratos: Contrato[];
  /** Vencimientos presentes, ordenados. */
  vencimientos: string[];
  /** Alpaca cortó la página: puede faltar parte de la cadena. */
  truncada: boolean;
}

export class ErrorAlpaca extends Error {
  constructor(
    mensaje: string,
    readonly codigo: string,
    readonly status: number,
  ) {
    super(mensaje);
  }
}

async function pedir(params: Record<string, string>): Promise<unknown> {
  const url = new URL("/api/alpaca", window.location.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { cache: "no-store" });
  const cuerpo = (await r.json().catch(() => null)) as {
    error?: string;
    mensaje?: string;
  } | null;
  if (!r.ok) {
    throw new ErrorAlpaca(
      cuerpo?.mensaje ?? `Error ${r.status}`,
      cuerpo?.error ?? "desconocido",
      r.status,
    );
  }
  return cuerpo;
}

/**
 * Desarma un símbolo OCC. Se lee desde la derecha porque la raíz es de largo
 * variable: los últimos 8 dígitos son el strike en milésimas de dólar, antes
 * va C o P, y antes la fecha en YYMMDD.
 */
export function parsearOCC(simbolo: string): Omit<
  Contrato,
  "bid" | "ask" | "ultimo" | "medio" | "iv" | "delta" | "gamma" | "theta" | "vega"
> | null {
  const s = simbolo.replace(/\s+/g, "");
  if (s.length < 16) return null;
  const strikeTxt = s.slice(-8);
  const tipoTxt = s.slice(-9, -8);
  const fecha = s.slice(-15, -9);
  const raiz = s.slice(0, -15);
  if (!/^\d{8}$/.test(strikeTxt) || !/^\d{6}$/.test(fecha)) return null;
  if (tipoTxt !== "C" && tipoTxt !== "P") return null;
  return {
    simbolo: s,
    raiz,
    vencimiento: `20${fecha.slice(0, 2)}-${fecha.slice(2, 4)}-${fecha.slice(4, 6)}`,
    tipo: tipoTxt === "C" ? "call" : "put",
    strike: Number(strikeTxt) / 1000,
  };
}

interface SnapshotCrudo {
  latestTrade?: { p?: number };
  latestQuote?: { ap?: number; bp?: number };
  impliedVolatility?: number;
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
  };
}

const n = (v: number | undefined): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Precio del subyacente: último trade y, si no hay, el cierre del día. */
export async function traerPrecioAccion(simbolo: string): Promise<number | null> {
  const d = (await pedir({ recurso: "accion", simbolo })) as {
    latestTrade?: { p?: number };
    dailyBar?: { c?: number };
    prevDailyBar?: { c?: number };
  };
  return n(d?.latestTrade?.p) ?? n(d?.dailyBar?.c) ?? n(d?.prevDailyBar?.c);
}

export async function traerCadena(
  simbolo: string,
  filtros: { vencimiento?: string; desdeHoy?: boolean } = {},
): Promise<Cadena> {
  const params: Record<string, string> = { recurso: "cadena", simbolo };
  if (filtros.vencimiento) params.expiration_date = filtros.vencimiento;
  else if (filtros.desdeHoy !== false) {
    params.expiration_date_gte = new Date().toISOString().slice(0, 10);
  }

  const d = (await pedir(params)) as {
    snapshots?: Record<string, SnapshotCrudo>;
    next_page_token?: string | null;
  };

  const contratos: Contrato[] = [];
  for (const [sim, snap] of Object.entries(d?.snapshots ?? {})) {
    const base = parsearOCC(sim);
    if (!base) continue;
    const bid = n(snap.latestQuote?.bp);
    const ask = n(snap.latestQuote?.ap);
    contratos.push({
      ...base,
      bid,
      ask,
      ultimo: n(snap.latestTrade?.p),
      medio: bid !== null && ask !== null && ask > 0 ? (bid + ask) / 2 : null,
      iv: n(snap.impliedVolatility),
      delta: n(snap.greeks?.delta),
      gamma: n(snap.greeks?.gamma),
      theta: n(snap.greeks?.theta),
      vega: n(snap.greeks?.vega),
    });
  }

  contratos.sort(
    (a, b) =>
      a.vencimiento.localeCompare(b.vencimiento) ||
      a.strike - b.strike ||
      a.tipo.localeCompare(b.tipo),
  );

  return {
    simbolo,
    contratos,
    vencimientos: [...new Set(contratos.map((c) => c.vencimiento))].sort(),
    truncada: Boolean(d?.next_page_token),
  };
}

export interface Sugerencia {
  /** Ticker. */
  s: string;
  /** Nombre de la empresa. */
  n: string;
  /** Mercado donde cotiza. */
  e: string;
}

/**
 * Autocompletado de tickers. Busca por símbolo y por nombre de la empresa,
 * así "amazon" encuentra AMZN. El catálogo lo cachea el servidor.
 */
export async function buscarSimbolos(q: string): Promise<Sugerencia[]> {
  if (!q.trim()) return [];
  const d = (await pedir({ recurso: "buscar", q, opciones: "1" })) as {
    resultados?: Sugerencia[];
  };
  return d?.resultados ?? [];
}

/** Días calendario que faltan hasta una fecha YYYY-MM-DD. */
export function diasHasta(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  const vence = Date.UTC(a, m - 1, d, 20, 0, 0); // cierre aproximado del mercado
  return Math.max(0, Math.round((vence - Date.now()) / 86400000));
}
