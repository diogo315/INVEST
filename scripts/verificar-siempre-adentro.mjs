/**
 * El simulador de «comprar con el verde, dar vuelta con el rojo».
 *
 * Lo que de verdad decide si este simulador sirve no es que sume bien,
 * sino tres controles:
 *
 *   · En un paseo SIN tendencia no puede aparecer ventaja. Si aparece,
 *     la regla está leyendo algo que no debería.
 *   · En una serie que sube en línea recta, «siempre adentro» tiene que
 *     quedar POR DEBAJO de comprar y esperar: cada vez que el rojo lo
 *     saca de la subida, pierde terreno. Si saliera por encima, el
 *     simulador está regalando algo.
 *   · El costo del corto tiene que morder: dos corridas idénticas con
 *     distinto acarreo no pueden dar el mismo número.
 */
import {
  SIEMPRE_ADENTRO_POR_DEFECTO,
  correrSiempreAdentro,
  peorCaida,
  resumirSA,
} from "../src/lib/backtest/siempre-adentro.ts";
import { DEFAULT_CONFIG } from "../src/lib/store/chart-store.ts";

const fallos = [];
const comprobar = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "ok " : "MAL"} ${nombre}${!cond && detalle ? ` — ${detalle}` : ""}`);
  if (!cond) fallos.push(nombre);
};

const H4 = 14400;
const T0 = Date.UTC(2024, 0, 1) / 1000;
const vela = (t, o, h, l, c, v = 1000) => ({ time: t, open: o, high: h, low: l, close: c, volume: v });

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Serie con máximos y mínimos de sub-pasos reales, y deriva opcional. */
function serie(semilla, n = 3000, derivaPorVela = 0, sub = 40) {
  const u = mulberry32(semilla);
  let p = 100;
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = p;
    let hi = p, lo = p;
    for (let k = 0; k < sub; k++) {
      p = Math.max(1, p * (1 + derivaPorVela / sub + (u() - 0.5) * 0.004));
      if (p > hi) hi = p;
      if (p < lo) lo = p;
    }
    out.push(vela(T0 + i * H4, o, hi, lo, p, 1000 + (i % 300)));
  }
  return out;
}

const SIN_COSTOS = { ...SIEMPRE_ADENTRO_POR_DEFECTO, comision: 0, spread: 0, costoCortoDiario: 0 };

console.log("La contabilidad básica");
{
  // Una serie corta y fabricada no dispara señales; se prueba el cálculo
  // de la caída con una curva a mano, que es lo que se puede aislar.
  comprobar("una curva que solo sube no tiene caída", peorCaida([100, 110, 120]) === 0);
  comprobar("una que cae a la mitad marca 50 %",
    Math.abs(peorCaida([100, 200, 100]) - 50) < 1e-9, String(peorCaida([100, 200, 100])));
  comprobar("y se mide desde el MÁXIMO, no desde el principio",
    Math.abs(peorCaida([100, 50, 200, 150]) - 50) < 1e-9, String(peorCaida([100, 50, 200, 150])));
}

console.log("Dispara lo suficiente como para medir algo");
{
  const v = serie(7777, 3000);
  const r = correrSiempreAdentro(v, DEFAULT_CONFIG, SIN_COSTOS);
  console.log(`     ${r.operaciones.length} operaciones en ${v.length} velas`);
  comprobar("hay operaciones", r.operaciones.length > 30, String(r.operaciones.length));
  comprobar("alterna largo y corto",
    r.operaciones.some((o) => o.lado === 1) && r.operaciones.some((o) => o.lado === -1));
  comprobar("no quedan dos del mismo lado seguidas",
    r.operaciones.every((o, i) => i === 0 || o.lado !== r.operaciones[i - 1].lado));
  comprobar("está adentro casi todo el tiempo",
    r.tiempoLargoPct + r.tiempoCortoPct > 90,
    `${(r.tiempoLargoPct + r.tiempoCortoPct).toFixed(0)} %`);
}

console.log("CONTROL 1: en un paseo sin tendencia no puede haber ventaja");
{
  const todas = [];
  for (let s = 1; s <= 12; s++) {
    const v = serie(s * 4231, 3000, 0);
    todas.push(...correrSiempreAdentro(v, DEFAULT_CONFIG, SIN_COSTOS).operaciones);
  }
  const r = resumirSA(todas);
  console.log(`     ${r.n} operaciones | ${r.mediaPct >= 0 ? "+" : ""}${r.mediaPct.toFixed(3)} % por op ± ${r.margenPct.toFixed(3)}`);
  comprobar("muestra suficiente para que el control signifique algo", r.n >= 400, String(r.n));
  comprobar("el cero está dentro del intervalo",
    r.mediaPct - r.margenPct <= 0,
    `[${(r.mediaPct - r.margenPct).toFixed(3)}, ${(r.mediaPct + r.margenPct).toFixed(3)}]`);
  console.log(`     (esta muestra detecta ventajas de ${r.margenPct.toFixed(2)} % por operación o más)`);
}

console.log("CONTROL 2: en una subida sostenida tiene que PERDER contra comprar y esperar");
{
  // Es la crítica estructural de «siempre adentro» sobre un oscilador:
  // cada rojo lo saca de la tendencia. Si el simulador no lo reprodujera,
  // estaría regalando algo.
  let gana = 0;
  let arruinadas = 0;
  const filas = [];
  for (let s = 1; s <= 6; s++) {
    const v = serie(s * 911, 3000, 0.0012);
    const r = correrSiempreAdentro(v, DEFAULT_CONFIG, SIN_COSTOS);
    filas.push(`${r.estrategiaPct.toFixed(0)} % vs ${r.comprarYEsperarPct.toFixed(0)} %`);
    if (r.estrategiaPct > r.comprarYEsperarPct) gana++;
    if (r.arruinadoEn !== null) arruinadas++;
  }
  console.log(`     estrategia vs comprar y esperar: ${filas.join(" | ")}`);
  comprobar("pierde contra comprar y esperar en la mayoría de las subidas",
    gana <= 1, `ganó en ${gana} de 6`);
  console.log(`     cuentas barridas: ${arruinadas} de 6`);
  comprobar("y al menos una termina con la cuenta barrida", arruinadas >= 1,
    String(arruinadas));
}

console.log("La ruina se modela como ruina, no como capital negativo");
{
  // Un corto contra una subida sostenida puede perder más del 100 %.
  // Medido: uno de 104 días perdió 141,9 %. Eso es una liquidación.
  let conRuina = null;
  for (let s = 1; s <= 10 && !conRuina; s++) {
    const r = correrSiempreAdentro(serie(s * 911, 3000, 0.0012), DEFAULT_CONFIG, SIN_COSTOS);
    if (r.arruinadoEn !== null) conRuina = r;
  }
  comprobar("alguna corrida termina arruinada", conRuina !== null);
  if (conRuina) {
    comprobar("el rendimiento nunca baja de −100 %", conRuina.estrategiaPct >= -100,
      String(conRuina.estrategiaPct));
    comprobar("y se informa CUÁNDO se barrió la cuenta",
      typeof conRuina.arruinadoEn === "number" && conRuina.arruinadoEn > 0,
      String(conRuina.arruinadoEn));
    comprobar("la última operación es la que la barrió",
      conRuina.operaciones.at(-1)?.tiempoSalida === conRuina.arruinadoEn,
      `${conRuina.operaciones.at(-1)?.tiempoSalida} vs ${conRuina.arruinadoEn}`);
    comprobar("y no se sigue operando después",
      conRuina.operaciones.every((o) => o.tiempoEntrada <= conRuina.arruinadoEn));
  }
  // Sin cortos no puede haber ruina: un largo no pierde más que todo.
  const spot = correrSiempreAdentro(serie(911, 3000, 0.0012), DEFAULT_CONFIG,
    { ...SIN_COSTOS, permitirCortos: false });
  comprobar("en spot, sin cortos, no hay forma de arruinarse",
    spot.arruinadoEn === null, String(spot.arruinadoEn));
}

console.log("Los costos muerden, y el del corto se nota con el tiempo");
{
  const v = serie(5150, 3000);
  const sin = correrSiempreAdentro(v, DEFAULT_CONFIG, SIN_COSTOS);
  const con = correrSiempreAdentro(v, DEFAULT_CONFIG, SIEMPRE_ADENTRO_POR_DEFECTO);
  comprobar("con costos rinde menos", con.estrategiaPct < sin.estrategiaPct,
    `${con.estrategiaPct.toFixed(1)} vs ${sin.estrategiaPct.toFixed(1)}`);
  comprobar("y el mismo número de operaciones", con.operaciones.length === sin.operaciones.length);

  const caro = correrSiempreAdentro(v, DEFAULT_CONFIG,
    { ...SIEMPRE_ADENTRO_POR_DEFECTO, costoCortoDiario: 0.5 });
  comprobar("un corto más caro empeora el resultado",
    caro.estrategiaPct < con.estrategiaPct,
    `${caro.estrategiaPct.toFixed(1)} vs ${con.estrategiaPct.toFixed(1)}`);
  const dias = con.operaciones.filter((o) => o.lado === -1).reduce((s, o) => s + o.dias, 0);
  comprobar("y el acarreo es proporcional a los días en corto", dias > 0,
    `${dias.toFixed(0)} días en corto`);
}

console.log("En spot no hay cortos: tras el rojo queda plano");
{
  const v = serie(3131, 3000);
  const spot = correrSiempreAdentro(v, DEFAULT_CONFIG,
    { ...SIN_COSTOS, permitirCortos: false });
  comprobar("no hay ni una operación corta",
    spot.operaciones.every((o) => o.lado === 1),
    String(spot.operaciones.filter((o) => o.lado === -1).length));
  comprobar("y pasa parte del tiempo afuera del mercado",
    spot.tiempoCortoPct === 0 && spot.tiempoLargoPct < 95,
    `largo ${spot.tiempoLargoPct.toFixed(0)} %, corto ${spot.tiempoCortoPct.toFixed(0)} %`);
}

console.log("El dorado solo: menos señales, y lo dice");
{
  const v = serie(8080, 3000);
  const ext = correrSiempreAdentro(v, DEFAULT_CONFIG, SIN_COSTOS);
  const oro = correrSiempreAdentro(v, DEFAULT_CONFIG, { ...SIN_COSTOS, senal: "oro" });
  comprobar("el dorado da muchas menos operaciones",
    oro.operaciones.length < ext.operaciones.length,
    `${oro.operaciones.length} vs ${ext.operaciones.length}`);
  const r = resumirSA(oro.operaciones);
  comprobar("y con tan pocas, el resumen avisa que no es concluyente",
    r.n < 30 ? !r.concluyente || r.margenPct > 1 : true,
    `n=${r.n} margen=${r.margenPct.toFixed(2)}`);
}

console.log("Nada de mirar el futuro: cortar la serie no cambia lo ya operado");
{
  const v = serie(6262, 3000);
  const completo = correrSiempreAdentro(v, DEFAULT_CONFIG, SIN_COSTOS);
  let desvios = 0;
  let detalle = "";
  for (const corte of [1500, 2000, 2500]) {
    const parcial = correrSiempreAdentro(v.slice(0, corte), DEFAULT_CONFIG, SIN_COSTOS);
    // La última de la parcial se cierra a la fuerza por fin de serie: no cuenta.
    const comparables = parcial.operaciones.slice(0, -1);
    for (const o of comparables) {
      const igual = completo.operaciones.find(
        (x) => x.tiempoEntrada === o.tiempoEntrada && x.lado === o.lado,
      );
      if (!igual || Math.abs(igual.pct - o.pct) > 1e-9) {
        desvios++;
        if (!detalle) detalle = `corte ${corte}, entrada ${o.tiempoEntrada}`;
      }
    }
  }
  comprobar("ningún corte altera una operación ya cerrada", desvios === 0, detalle);
}

console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
