/**
 * Prueba el ranking del buscador de activos con un catálogo de juguete.
 *
 *   node --experimental-strip-types scripts/verificar-buscador.mjs
 *
 * No toca la red: si algún caso falla es el ranking, no Binance.
 */

import { rankearSimbolos } from "../src/lib/exchanges/buscar.ts";

const N = {
  BTC: "Bitcoin",
  BCH: "Bitcoin Cash",
  BTT: "BitTorrent",
  ETH: "Ethereum",
  DOGE: "Dogecoin",
  PEPE: "Pepe",
  AVAX: "Avalanche",
  USDT: "TetherUS",
  FDUSD: "First Digital USD",
};

function act(exchange, base, quote) {
  return {
    qualified: `${exchange}:${base}${quote}`,
    exchange,
    symbol: `${base}${quote}`,
    base,
    quote,
    nombre: N[base] ?? null,
  };
}

const CATALOGO = [
  act("BIN", "BTC", "USDT"),
  act("BIN", "BTC", "FDUSD"),
  act("BINF", "BTC", "USDT"),
  act("BG", "BTC", "USDT"),
  act("BIN", "BCH", "USDT"),
  act("BIN", "BTT", "USDT"),
  act("BIN", "ETH", "USDT"),
  act("BIN", "ETH", "BTC"),
  act("BINF", "ETH", "USDT"),
  act("BIN", "DOGE", "USDT"),
  act("BIN", "PEPE", "USDT"),
  act("BIN", "AVAX", "USDT"),
  act("BIN", "XYZ", "USDT"), // sin nombre en el diccionario
];

const CASOS = [
  {
    que: "el ticker exacto manda, y USDT antes que el resto de pares",
    consulta: "btc",
    espero: [
      "BIN:BTCUSDT",
      "BINF:BTCUSDT",
      "BG:BTCUSDT",
      "BIN:BTCFDUSD",
      "BIN:ETHBTC", // último: solo contiene "BTC" en el símbolo
    ],
    cuantos: 5,
  },
  {
    que: "el símbolo completo también: btcusdt, en los tres exchanges",
    consulta: "btcusdt",
    espero: ["BIN:BTCUSDT", "BINF:BTCUSDT", "BG:BTCUSDT"],
    cuantos: 3,
  },
  {
    que: "por nombre: bitcoin trae BTC antes que Bitcoin Cash",
    consulta: "bitcoin",
    espero: [
      "BIN:BTCUSDT",
      "BINF:BTCUSDT",
      "BG:BTCUSDT",
      "BIN:BTCFDUSD",
      "BIN:BCHUSDT",
    ],
    cuantos: 5,
  },
  {
    que: "nombre con espacios: bitcoin cash → BCH",
    consulta: "bitcoin cash",
    espero: ["BIN:BCHUSDT"],
    cuantos: 1,
  },
  {
    que: "prefijo de ticker: bt → BTC y BTT, nunca BCH",
    consulta: "bt",
    espero: [
      "BIN:BTCUSDT",
      "BIN:BTTUSDT",
      "BINF:BTCUSDT",
      "BG:BTCUSDT",
      "BIN:BTCFDUSD",
      "BIN:ETHBTC",
    ],
    cuantos: 6,
  },
  {
    que: "contiene en el nombre: coin → Dogecoin, BitTorrent no",
    consulta: "dogecoin",
    espero: ["BIN:DOGEUSDT"],
    cuantos: 1,
  },
  {
    que: "sin resultados: zzz",
    consulta: "zzz",
    espero: [],
    cuantos: 0,
  },
  {
    que: "filtro de perpetuos: solo BINF",
    consulta: "",
    opciones: { tipo: "PERP" },
    espero: ["BINF:BTCUSDT", "BINF:ETHUSDT"],
    cuantos: 2,
  },
  {
    que: "filtro por exchange: solo Bitget",
    consulta: "btc",
    opciones: { exchange: "BG" },
    espero: ["BG:BTCUSDT"],
    cuantos: 1,
  },
  {
    que: "sin escribir nada: los populares primero",
    consulta: "",
    espero: [
      "BIN:BTCUSDT",
      "BINF:BTCUSDT",
      "BG:BTCUSDT",
      "BIN:BTCFDUSD",
      "BIN:ETHUSDT",
    ],
    cuantos: CATALOGO.length,
  },
  {
    que: "un activo sin nombre sigue siendo buscable por ticker",
    consulta: "xyz",
    espero: ["BIN:XYZUSDT"],
    cuantos: 1,
  },
];

let fallos = 0;
for (const c of CASOS) {
  const r = rankearSimbolos(CATALOGO, c.consulta, c.opciones ?? {});
  const ids = r.map((x) => x.qualified);
  const prefijoOk = c.espero.every((e, i) => ids[i] === e);
  const cantidadOk = c.cuantos === undefined || ids.length === c.cuantos;
  if (prefijoOk && cantidadOk) {
    console.log(`✓ ${c.que}`);
  } else {
    fallos++;
    console.log(`✗ ${c.que}`);
    console.log(`    esperaba: ${c.espero.join(", ") || "(nada)"} (${c.cuantos})`);
    console.log(`    obtuve:   ${ids.join(", ") || "(nada)"} (${ids.length})`);
  }
}

console.log(
  fallos === 0
    ? `\n✓ ${CASOS.length}/${CASOS.length} casos del buscador`
    : `\n✗ ${fallos} de ${CASOS.length} casos fallaron`,
);
process.exit(fallos === 0 ? 0 : 1);
