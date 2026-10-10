/**
 * Proxy a la API de Alpaca.
 *
 * La clave NO puede vivir en el navegador: cualquiera la leería del bundle.
 * Esta ruta corre en el servidor (en Vercel, una función), le pega a Alpaca
 * con las credenciales de entorno y devuelve la respuesta tal cual.
 *
 * Variables de entorno (en `.env.local` para desarrollo y en Vercel →
 * Settings → Environment Variables para producción):
 *   ALPACA_KEY_ID
 *   ALPACA_SECRET_KEY
 *
 * NO es un proxy abierto: tres recursos, con el símbolo y cada filtro
 * validados antes de salir.
 */

import { rankearActivos, type Activo } from "@/lib/options/ranking";
import { desdeCuando } from "@/lib/exchanges/ventana-barras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATOS = "https://data.alpaca.markets";
/**
 * El listado de activos vive en la API de trading, que tiene host distinto
 * según el tipo de clave: las de paper (empiezan con PK) solo funcionan
 * contra paper-api. Se prueba paper y, si rebota, la de producción.
 */
const TRADING = [
  "https://paper-api.alpaca.markets",
  "https://api.alpaca.markets",
];

const SIMBOLO = /^[A-Z][A-Z.]{0,6}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN = /^[A-Za-z0-9_=\-.:]{1,500}$/;
/**
 * Temporalidades que acepta Alpaca: 1-59 Min, 1-23 Hour, 1Day, 1Week y
 * 1/2/3/6/12 Month (validado en `alpaca/data/timeframe.py` del SDK).
 */
const TEMPORALIDAD = /^(?:[1-9]|[1-5]\d)Min$|^(?:[1-9]|1\d|2[0-3])Hour$|^1Day$|^1Week$|^(?:1|2|3|6|12)Month$/;

function json(cuerpo: unknown, status: number) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Filtros que se dejan pasar a la cadena de opciones, con su validación. */
const FILTROS_CADENA: Record<string, (v: string) => boolean> = {
  expiration_date: (v) => FECHA.test(v),
  expiration_date_gte: (v) => FECHA.test(v),
  expiration_date_lte: (v) => FECHA.test(v),
  strike_price_gte: (v) => Number.isFinite(Number(v)) && Number(v) > 0,
  strike_price_lte: (v) => Number.isFinite(Number(v)) && Number(v) > 0,
  type: (v) => v === "call" || v === "put",
  page_token: (v) => TOKEN.test(v),
};

/** Le pega a Alpaca y devuelve la respuesta tal cual, traduciendo los errores. */
async function reenviar(destino: URL, headers: HeadersInit): Promise<Response> {
  try {
    const r = await fetch(destino, { headers, cache: "no-store" });
    const texto = await r.text();
    if (!r.ok) {
      return json(
        {
          error: "alpaca",
          status: r.status,
          mensaje:
            r.status === 401 || r.status === 403
              ? "Alpaca rechazó las credenciales."
              : r.status === 429
                ? "Alpaca cortó por límite de llamadas (el plan gratis son 200 por minuto)."
                : texto.slice(0, 400),
        },
        r.status,
      );
    }
    return new Response(texto, {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return json({ error: "red", mensaje: "No se pudo contactar a Alpaca." }, 502);
  }
}

// ───────────────────────── catálogo de símbolos ─────────────────────────

/** Un activo del catálogo; `o` marca los que tienen opciones listadas. */
interface ActivoCatalogo extends Activo {
  o: boolean;
}

interface Catalogo {
  activos: ActivoCatalogo[];
  cargadoEn: number;
}

/**
 * El listado completo son miles de activos y pesa varios MB: se baja una vez
 * por instancia y se guarda en memoria. En Vercel eso dura lo que dure la
 * función caliente, que para esto alcanza de sobra.
 */
let catalogo: Catalogo | null = null;
let cargando: Promise<Catalogo> | null = null;
const VIDA_CATALOGO = 12 * 60 * 60 * 1000;

async function traerCatalogo(headers: HeadersInit): Promise<Catalogo> {
  let ultimoError = "";
  for (const base of TRADING) {
    const url = new URL(`${base}/v2/assets`);
    url.searchParams.set("status", "active");
    url.searchParams.set("asset_class", "us_equity");
    const r = await fetch(url, { headers, cache: "no-store" });
    if (r.status === 401 || r.status === 403) {
      ultimoError = `credenciales rechazadas por ${base}`;
      continue; // puede ser una clave de paper contra el host de producción
    }
    if (!r.ok) {
      ultimoError = `HTTP ${r.status} en ${base}`;
      continue;
    }
    const crudo = (await r.json()) as Array<{
      symbol?: string;
      name?: string;
      exchange?: string;
      tradable?: boolean;
      attributes?: string[];
    }>;

    // Si la cuenta expone un atributo de opciones se usa para marcar cuáles
    // las tienen; si no aparece en la respuesta, se marcan todos (es mejor
    // mostrar de más en la cadena que esconder un papel que sí opera).
    const hayAtributoOpciones = crudo.some((a) =>
      a.attributes?.some((x) => /option/i.test(x)),
    );
    const activos = crudo
      .filter((a) => a.symbol && a.tradable !== false)
      .map((a) => ({
        s: a.symbol as string,
        n: a.name ?? "",
        e: a.exchange ?? "",
        o:
          !hayAtributoOpciones ||
          Boolean(a.attributes?.some((x) => /option/i.test(x))),
      }));

    return { activos, cargadoEn: Date.now() };
  }
  throw new Error(ultimoError || "no se pudo traer el listado de activos");
}

// ───────────────────────────────── ruta ─────────────────────────────────

export async function GET(req: Request) {
  const key = process.env.ALPACA_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY;
  if (!key || !secret) {
    return json(
      {
        error: "falta_clave",
        mensaje:
          "Faltan ALPACA_KEY_ID y ALPACA_SECRET_KEY. Cargalas en .env.local y en las variables de entorno de Vercel.",
      },
      503,
    );
  }

  const headers = {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
    accept: "application/json",
  };

  const url = new URL(req.url);
  const recurso = url.searchParams.get("recurso");

  /** Catálogo en memoria, bajándolo si hace falta. */
  async function conCatalogo(): Promise<Catalogo> {
    const vencido = !catalogo || Date.now() - catalogo.cargadoEn > VIDA_CATALOGO;
    if (vencido) {
      // Una sola descarga aunque entren varias búsquedas a la vez.
      cargando ??= traerCatalogo(headers).finally(() => {
        cargando = null;
      });
      catalogo = await cargando;
    }
    return catalogo!;
  }

  function errorCatalogo(e: unknown) {
    return json(
      {
        error: "catalogo",
        mensaje: e instanceof Error ? e.message : "No se pudo traer el listado.",
      },
      502,
    );
  }

  // ── búsqueda de símbolos (autocompletado de la cadena de opciones) ─────
  if (recurso === "buscar") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 30);
    if (q.trim().length < 1) return json({ resultados: [] }, 200);
    try {
      const c = await conCatalogo();
      // La cadena de opciones solo tiene sentido con papeles que las listan;
      // el buscador del gráfico quiere todo.
      const base =
        url.searchParams.get("opciones") === "1"
          ? c.activos.filter((a) => a.o)
          : c.activos;
      return json({ resultados: rankearActivos(base, q), total: base.length }, 200);
    } catch (e) {
      return errorCatalogo(e);
    }
  }

  // ── catálogo completo (buscador del gráfico) ───────────────────────────
  if (recurso === "catalogo") {
    try {
      const c = await conCatalogo();
      return new Response(
        JSON.stringify({
          // Solo ticker y nombre: son miles de papeles y el mercado donde
          // cotiza no se muestra en el buscador del gráfico.
          activos: c.activos.map((a) => ({ s: a.s, n: a.n })),
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            // Son varios MB: que el navegador lo reuse mientras dure la pestaña.
            "cache-control": "private, max-age=3600",
          },
        },
      );
    } catch (e) {
      return errorCatalogo(e);
    }
  }

  // ── nombres de unos pocos símbolos (filas del watchlist) ───────────────
  if (recurso === "nombres") {
    const pedidos = (url.searchParams.get("simbolos") ?? "")
      .toUpperCase()
      .split(",")
      .map((s) => s.trim())
      .filter((s) => SIMBOLO.test(s))
      .slice(0, 100);
    if (pedidos.length === 0) return json({ nombres: {} }, 200);
    try {
      const c = await conCatalogo();
      const buscados = new Set(pedidos);
      const nombres: Record<string, string> = {};
      for (const a of c.activos) if (buscados.has(a.s)) nombres[a.s] = a.n;
      return json({ nombres }, 200);
    } catch (e) {
      return errorCatalogo(e);
    }
  }

  // ── cotizaciones de varios símbolos a la vez (watchlist) ───────────────
  if (recurso === "cotizaciones") {
    const pedidos = (url.searchParams.get("simbolos") ?? "")
      .toUpperCase()
      .split(",")
      .map((s) => s.trim())
      .filter((s) => SIMBOLO.test(s))
      .slice(0, 100);
    if (pedidos.length === 0) return json({}, 200);
    const destino = new URL(`${DATOS}/v2/stocks/snapshots`);
    destino.searchParams.set("symbols", pedidos.join(","));
    destino.searchParams.set("feed", "iex");
    return reenviar(destino, headers);
  }

  // ── velas ──────────────────────────────────────────────────────────────
  if (recurso === "barras") {
    const sim = (url.searchParams.get("simbolo") ?? "").trim().toUpperCase();
    if (!SIMBOLO.test(sim)) {
      return json(
        { error: "simbolo_invalido", mensaje: `Símbolo no válido: "${sim}"` },
        400,
      );
    }
    const tf = url.searchParams.get("tf") ?? "";
    if (!TEMPORALIDAD.test(tf)) {
      return json(
        { error: "tf_invalida", mensaje: `Temporalidad no válida: "${tf}"` },
        400,
      );
    }
    const pedido = Number(url.searchParams.get("limit") ?? 1000);
    const limite = Math.min(10000, Math.max(1, Number.isFinite(pedido) ? pedido : 1000));
    const destino = new URL(`${DATOS}/v2/stocks/bars`);
    destino.searchParams.set("symbols", sim);
    destino.searchParams.set("timeframe", tf);
    destino.searchParams.set("start", desdeCuando(tf, limite));
    destino.searchParams.set("feed", "iex");
    // Precios ajustados por splits y dividendos: sin esto un split deja un
    // escalón falso en el histórico y rompe cualquier media móvil.
    destino.searchParams.set("adjustment", "all");
    destino.searchParams.set("sort", "desc"); // las más recientes primero
    destino.searchParams.set("limit", String(limite));
    return reenviar(destino, headers);
  }

  // ── datos de mercado ───────────────────────────────────────────────────
  const simbolo = (url.searchParams.get("simbolo") ?? "").trim().toUpperCase();
  if (!SIMBOLO.test(simbolo)) {
    return json(
      { error: "simbolo_invalido", mensaje: `Símbolo no válido: "${simbolo}"` },
      400,
    );
  }

  let destino: URL;
  if (recurso === "accion") {
    destino = new URL(`${DATOS}/v2/stocks/${simbolo}/snapshot`);
    // El plan gratis solo tiene IEX.
    destino.searchParams.set("feed", "iex");
  } else if (recurso === "cadena") {
    destino = new URL(`${DATOS}/v1beta1/options/snapshots/${simbolo}`);
    // "indicative" es el feed del plan gratis; "opra" necesita el pago.
    const feed = url.searchParams.get("feed");
    destino.searchParams.set("feed", feed === "opra" ? "opra" : "indicative");
    const limite = Number(url.searchParams.get("limit") ?? 1000);
    destino.searchParams.set(
      "limit",
      String(Math.min(1000, Math.max(1, Number.isFinite(limite) ? limite : 1000))),
    );
    for (const [nombre, valido] of Object.entries(FILTROS_CADENA)) {
      const v = url.searchParams.get(nombre);
      if (v === null) continue;
      if (!valido(v)) {
        return json(
          { error: "filtro_invalido", mensaje: `Filtro inválido: ${nombre}=${v}` },
          400,
        );
      }
      destino.searchParams.set(nombre, v);
    }
  } else {
    return json(
      {
        error: "recurso_invalido",
        mensaje:
          'recurso debe ser "accion", "cadena", "barras", "cotizaciones", "catalogo", "nombres" o "buscar"',
      },
      400,
    );
  }

  return reenviar(destino, headers);
}
