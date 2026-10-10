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

// ───────────────────────── catálogo de símbolos ─────────────────────────

interface Catalogo {
  activos: Activo[];
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

    // Si la cuenta expone un atributo de opciones, se filtra por él; si no
    // aparece en esta respuesta, se deja pasar todo en vez de adivinar.
    const hayAtributoOpciones = crudo.some((a) =>
      a.attributes?.some((x) => /option/i.test(x)),
    );
    const activos = crudo
      .filter((a) => a.symbol && a.tradable !== false)
      .filter(
        (a) =>
          !hayAtributoOpciones || a.attributes?.some((x) => /option/i.test(x)),
      )
      .map((a) => ({
        s: a.symbol as string,
        n: a.name ?? "",
        e: a.exchange ?? "",
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

  // ── búsqueda de símbolos (autocompletado) ──────────────────────────────
  if (recurso === "buscar") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 30);
    if (q.trim().length < 1) return json({ resultados: [] }, 200);
    try {
      const vencido =
        !catalogo || Date.now() - catalogo.cargadoEn > VIDA_CATALOGO;
      if (vencido) {
        // Una sola descarga aunque entren varias búsquedas a la vez.
        cargando ??= traerCatalogo(headers).finally(() => {
          cargando = null;
        });
        catalogo = await cargando;
      }
      return json(
        {
          resultados: rankearActivos(catalogo!.activos, q),
          total: catalogo!.activos.length,
        },
        200,
      );
    } catch (e) {
      return json(
        {
          error: "catalogo",
          mensaje:
            e instanceof Error ? e.message : "No se pudo traer el listado.",
        },
        502,
      );
    }
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
        mensaje: 'recurso debe ser "accion", "cadena" o "buscar"',
      },
      400,
    );
  }

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
