/**
 * Proxy a la API de datos de Alpaca.
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
 * NO es un proxy abierto: solo dos recursos, con el símbolo y cada filtro
 * validados antes de salir.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = "https://data.alpaca.markets";

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

  const url = new URL(req.url);
  const recurso = url.searchParams.get("recurso");
  const simbolo = (url.searchParams.get("simbolo") ?? "").trim().toUpperCase();

  if (!SIMBOLO.test(simbolo)) {
    return json(
      { error: "simbolo_invalido", mensaje: `Símbolo no válido: "${simbolo}"` },
      400,
    );
  }

  let destino: URL;
  if (recurso === "accion") {
    destino = new URL(`${BASE}/v2/stocks/${simbolo}/snapshot`);
    // El plan gratis solo tiene IEX.
    destino.searchParams.set("feed", "iex");
  } else if (recurso === "cadena") {
    destino = new URL(`${BASE}/v1beta1/options/snapshots/${simbolo}`);
    // "indicative" es el feed del plan gratis; "opra" necesita el pago.
    const feed = url.searchParams.get("feed");
    destino.searchParams.set(
      "feed",
      feed === "opra" ? "opra" : "indicative",
    );
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
        mensaje: 'recurso debe ser "accion" o "cadena"',
      },
      400,
    );
  }

  try {
    const r = await fetch(destino, {
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
        accept: "application/json",
      },
      cache: "no-store",
    });
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
    return json(
      { error: "red", mensaje: "No se pudo contactar a Alpaca." },
      502,
    );
  }
}
