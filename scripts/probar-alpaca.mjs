/**
 * Prueba que la clave de Alpaca esté bien cargada y que se llegue a la API,
 * sin levantar la app entera.
 *
 *   node --env-file=.env.local scripts/probar-alpaca.mjs
 *
 * Distingue los tres casos que se confunden entre sí:
 *   · clave mal cargada o equivocada  → 401/403
 *   · la red no deja salir a Node     → error de conexión (el proxy de Totem)
 *   · todo bien                       → imprime el precio de AAPL
 *
 * No imprime la clave ni el secreto en ningún caso.
 */

const KEY = process.env.ALPACA_KEY_ID;
const SECRET = process.env.ALPACA_SECRET_KEY;

if (!KEY || !SECRET) {
  console.log("✗ Faltan ALPACA_KEY_ID y/o ALPACA_SECRET_KEY.");
  console.log("  Revisá que .env.local exista en la raíz del proyecto y que");
  console.log("  lo estés pasando con --env-file=.env.local");
  process.exit(1);
}
console.log(
  `· Clave encontrada: ${KEY.slice(0, 4)}…${KEY.slice(-2)} (${KEY.length} caracteres)`,
);

const headers = {
  "APCA-API-KEY-ID": KEY,
  "APCA-API-SECRET-KEY": SECRET,
  accept: "application/json",
};

async function probar(nombre, url) {
  try {
    const r = await fetch(url, { headers });
    const texto = await r.text();
    if (r.status === 401 || r.status === 403) {
      console.log(`✗ ${nombre}: Alpaca rechazó las credenciales (${r.status}).`);
      console.log("  La clave existe pero no sirve para este endpoint.");
      console.log("  Probá regenerarla en app.alpaca.markets → API Keys.");
      return false;
    }
    if (!r.ok) {
      console.log(`✗ ${nombre}: HTTP ${r.status} — ${texto.slice(0, 200)}`);
      return false;
    }
    return JSON.parse(texto);
  } catch (e) {
    console.log(`✗ ${nombre}: no se pudo conectar.`);
    console.log(`  ${e instanceof Error ? e.message : e}`);
    console.log("  Esto NO es la clave: es que Node no está saliendo a");
    console.log("  internet. En la red de Totem ya pasó con las fuentes de");
    console.log("  Google: el navegador cruza el proxy y Node no. Si es eso,");
    console.log("  en Vercel va a funcionar igual.");
    return false;
  }
}

const accion = await probar(
  "Acciones",
  "https://data.alpaca.markets/v2/stocks/AAPL/snapshot?feed=iex",
);
if (accion) {
  const p = accion?.latestTrade?.p ?? accion?.dailyBar?.c;
  console.log(`✓ Acciones: AAPL en ${p}`);
}

const cadena = await probar(
  "Opciones",
  "https://data.alpaca.markets/v1beta1/options/snapshots/AAPL?feed=indicative&limit=5",
);
if (cadena) {
  const n = Object.keys(cadena?.snapshots ?? {}).length;
  const primero = Object.keys(cadena?.snapshots ?? {})[0];
  console.log(`✓ Opciones: ${n} contratos, el primero ${primero ?? "—"}`);
  if (n === 0) {
    console.log(
      "  Vinieron cero contratos: la cuenta puede no tener habilitado el",
      "feed de opciones todavía.",
    );
  }
}

// ── lo que necesita el gráfico de acciones y ETFs ──────────────────────
const barras = await probar(
  "Velas",
  "https://data.alpaca.markets/v2/stocks/bars?symbols=AAPL&timeframe=15Min&feed=iex&adjustment=all&sort=desc&limit=3",
);
if (barras) {
  const filas = barras?.bars?.AAPL ?? [];
  const u = filas[0];
  console.log(
    `✓ Velas: ${filas.length} de AAPL en 15 min` +
      (u ? ` — la última cierra en ${u.c} (${u.t})` : ""),
  );
  if (filas.length === 0) {
    console.log("  Vinieron cero velas: puede ser feriado o cuenta sin datos.");
  }
}

const foto = await probar(
  "Cotizaciones",
  "https://data.alpaca.markets/v2/stocks/snapshots?symbols=AAPL,SPY,GLD&feed=iex",
);
if (foto) {
  for (const sim of ["AAPL", "SPY", "GLD"]) {
    const s = foto?.[sim];
    const p = s?.latestTrade?.p ?? s?.dailyBar?.c;
    const previo = s?.prevDailyBar?.c;
    const pct = p && previo ? (((p - previo) / previo) * 100).toFixed(2) : "?";
    console.log(`✓ ${sim}: ${p ?? "—"} (${pct}% vs cierre anterior)`);
  }
}

// El listado de papeles vive en la API de trading, no en la de datos, y las
// claves de paper solo funcionan contra paper-api.
let catalogo = null;
for (const base of [
  "https://paper-api.alpaca.markets",
  "https://api.alpaca.markets",
]) {
  catalogo = await probar(
    `Catálogo (${base.includes("paper") ? "paper" : "producción"})`,
    `${base}/v2/assets?status=active&asset_class=us_equity`,
  );
  if (catalogo) {
    console.log(`✓ Catálogo: ${catalogo.length} papeles disponibles`);
    break;
  }
}

if (accion && cadena && barras && foto && catalogo) {
  console.log("\n✓ Todo listo: cadena de opciones en /opciones y acciones/ETFs en el gráfico.");
}
