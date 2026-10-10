/**
 * Chequeo del ranking del autocompletado de tickers.
 *   node --experimental-strip-types scripts/verificar-busqueda.mjs
 */
import { rankearActivos } from "../src/lib/options/ranking.ts";

const CATALOGO = [
  { s: "AMZN", n: "Amazon.com, Inc. Common Stock", e: "NASDAQ" },
  { s: "AMZA", n: "InfraCap MLP ETF", e: "ARCA" },
  { s: "AMAT", n: "Applied Materials, Inc.", e: "NASDAQ" },
  { s: "AMD", n: "Advanced Micro Devices, Inc.", e: "NASDAQ" },
  { s: "AAPL", n: "Apple Inc. Common Stock", e: "NASDAQ" },
  { s: "APLE", n: "Apple Hospitality REIT, Inc.", e: "NYSE" },
  { s: "GOOGL", n: "Alphabet Inc. Class A", e: "NASDAQ" },
  { s: "TSLA", n: "Tesla, Inc. Common Stock", e: "NASDAQ" },
];

const casos = [
  { q: "amaz", esperado: ["AMZN"], porque: "el nombre empieza con Amaz" },
  { q: "amzn", esperado: ["AMZN"], porque: "simbolo exacto" },
  { q: "am", esperado: ["AMD", "AMAT", "AMZA", "AMZN"], porque: "simbolos que empiezan con AM, el mas corto primero" },
  { q: "apple", esperado: ["AAPL", "APLE"], porque: "nombre: Apple Inc. antes que Apple Hospitality" },
  { q: "aapl", esperado: ["AAPL"], porque: "simbolo exacto gana aunque APLE tambien contenga A" },
  { q: "alphabet", esperado: ["GOOGL"], porque: "se busca por nombre de la empresa" },
  { q: "zzzz", esperado: [], porque: "sin resultados" },
];

let fallas = 0;
for (const c of casos) {
  const got = rankearActivos(CATALOGO, c.q).map((a) => a.s);
  const esperado = c.esperado;
  const ok = esperado.every((s, i) => got[i] === s) &&
             (esperado.length === 0 ? got.length === 0 : true);
  if (!ok) {
    fallas++;
    console.log(`FALLA "${c.q}" (${c.porque}): esperaba ${esperado.join(", ") || "nada"} / obtuve ${got.join(", ") || "nada"}`);
  } else {
    console.log(`ok  "${c.q}" -> ${got.slice(0, 4).join(", ") || "(nada)"}`);
  }
}
console.log(fallas === 0 ? `\nOK - ${casos.length} casos de busqueda` : `\n${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
