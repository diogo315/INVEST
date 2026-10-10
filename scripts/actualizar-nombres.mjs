/**
 * Refresca `src/lib/data/nombres-cripto.json` desde CoinGecko.
 *
 *   node scripts/actualizar-nombres.mjs            (2000 monedas, 8 páginas)
 *   node scripts/actualizar-nombres.mjs --paginas=20
 *
 * CoinGecko no pide clave para esto, pero sí corta si se le pega muy seguido:
 * entre página y página se espera. Son unos segundos por página.
 *
 * Reglas:
 *   · cuando dos monedas comparten ticker gana la de mayor capitalización,
 *     que es la que uno quiere ver al escribir el ticker;
 *   · los nombres que ya estaban y CoinGecko no trae NO se borran;
 *   · hay una tabla de excepciones para los pares de cotización, donde el
 *     nombre que usa TradingView no es el de CoinGecko (USDT → TetherUS).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = join(RAIZ, "src/lib/data/nombres-cripto.json");

const EXCEPCIONES = {
  USDT: "TetherUS",
  EUR: "Euro",
  BETH: "Beacon ETH",
};

const paginas = Number(
  process.argv.find((a) => a.startsWith("--paginas="))?.split("=")[1] ?? 8,
);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function traerPagina(n) {
  const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", "250");
  url.searchParams.set("page", String(n));
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (r.status === 429) {
    console.log(`  · página ${n}: CoinGecko pidió esperar, reintento en 30 s`);
    await dormir(30_000);
    return traerPagina(n);
  }
  if (!r.ok) throw new Error(`página ${n}: HTTP ${r.status}`);
  return r.json();
}

const previos = JSON.parse(readFileSync(DESTINO, "utf8"));
/** ticker → { nombre, rango } */
const mejor = new Map();

for (let p = 1; p <= paginas; p++) {
  const filas = await traerPagina(p);
  if (filas.length === 0) break;
  for (const c of filas) {
    const ticker = String(c.symbol ?? "").toUpperCase();
    const nombre = String(c.name ?? "").trim();
    if (!ticker || !nombre) continue;
    const rango = Number.isFinite(c.market_cap_rank)
      ? c.market_cap_rank
      : Infinity;
    const actual = mejor.get(ticker);
    if (!actual || rango < actual.rango) mejor.set(ticker, { nombre, rango });
  }
  console.log(`· página ${p}/${paginas} — ${mejor.size} tickers distintos`);
  if (p < paginas) await dormir(3000);
}

const salida = { ...previos };
for (const [ticker, { nombre }] of mejor) salida[ticker] = nombre;
Object.assign(salida, EXCEPCIONES);

const ordenado = {};
for (const k of Object.keys(salida).sort()) ordenado[k] = salida[k];

const nuevos = Object.keys(ordenado).filter((k) => !(k in previos));
writeFileSync(DESTINO, JSON.stringify(ordenado, null, 2) + "\n");

console.log(
  `\n✓ ${Object.keys(ordenado).length} nombres (${nuevos.length} nuevos) en src/lib/data/nombres-cripto.json`,
);
if (nuevos.length > 0) {
  console.log(`  nuevos: ${nuevos.slice(0, 20).join(", ")}${nuevos.length > 20 ? "…" : ""}`);
}
