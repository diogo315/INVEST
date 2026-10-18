/**
 * La estrategia de los dos FVG (la del tuit).
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs \
 *     scripts/verificar-dosfvg.mjs
 *
 * Mismas tres redes que en la otra estrategia, porque son los tres
 * errores que inflan cualquier backtest:
 *
 *   1. Mirar el futuro. Se corta la serie en varios sitios y se exige
 *      que lo ya operado no se mueva. Más el CONTROL del paseo
 *      aleatorio: sin tendencia que explotar, la esperanza no puede ser
 *      positiva.
 *   2. Suponer lo bueno dentro de la vela. Si tocó stop y objetivo, se
 *      cobra el stop.
 *   3. Esconder los supuestos. Los dos huecos del tuit —dónde va el stop
 *      y en qué parte del FVG se entra— son parámetros, y acá se
 *      comprueba que de verdad cambian el resultado.
 */
import {
  DOSFVG_POR_DEFECTO,
  correrDosFvg,
  gestionarDosFvg,
} from "../src/lib/estrategia/dosfvg.ts";

let bien = 0;
const malos = [];
const comprobar = (n, c, d = "") => {
  if (c) bien++;
  else {
    malos.push(n);
    console.log(`  MAL ${n}${d ? ` — ${d}` : ""}`);
  }
};

const M15 = 900;
const H4 = 14400;
const T0 = Date.UTC(2025, 0, 1) / 1000;
const vela = (t, o, h, l, c, v = 1000) => ({ time: t, open: o, high: h, low: l, close: c, volume: v });

/**
 * Serie de 15M con ciclos, y su agregado a 4H.
 *
 * Los máximos y mínimos salen de SUB-PASOS reales, no de inflarle un
 * porcentaje fijo al cuerpo. Esto no es un detalle: la primera versión
 * ponía `high = max(apertura, cierre) * 1.002`, o sea un 0,4 % de rango
 * regalado en cada vela que NO era parte del paseo. Y un FVG se define
 * justamente por máximos y mínimos. Con los extremos falseados, el
 * control marcaba +0,15R de ventaja en un paseo sin tendencia — ventaja
 * que era del generador de velas, no de la estrategia. Con extremos de
 * verdad, el mismo control da −0,06R, que es lo que tiene que dar.
 */
function mundo(semilla, n = 18000, conCiclos = true, sub = 60) {
  let a = semilla | 0;
  // mulberry32: sin la estructura serial del congruencial de módulo 2^31.
  const u = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let p = 100;
  const m15 = [];
  for (let i = 0; i < n; i++) {
    const d = conCiclos ? Math.sin(i / 900) * 0.0012 + Math.sin(i / 130) * 0.0014 : 0;
    const o = p;
    let hi = p;
    let lo = p;
    for (let k = 0; k < sub; k++) {
      p = Math.max(1, p * (1 + d / sub + (u() - 0.5) * 0.0016));
      if (p > hi) hi = p;
      if (p < lo) lo = p;
    }
    m15.push(vela(T0 + i * M15, o, hi, lo, p, 1000 + (i % 400)));
  }
  const h4 = [];
  for (let i = 0; i < m15.length; i += 16) {
    const t = m15.slice(i, i + 16);
    if (!t.length) break;
    h4.push(vela(t[0].time, t[0].open, Math.max(...t.map((x) => x.high)),
      Math.min(...t.map((x) => x.low)), t.at(-1).close, t.reduce((a, x) => a + x.volume, 0)));
  }
  return { m15, h4 };
}

const W = mundo(4242);

// ───────────── qué pasa dentro de una vela ─────────────
console.log("Dentro de la vela se supone lo peor");
{
  const largo = () => ({
    lado: 1, entrada: 100, tiempoEntrada: T0, stop: 99, objetivo: 103, riesgo: 1,
    abiertaEn: 0, zona4h: { piso: 90, techo: 95, time: T0 },
    zona15: { piso: 99, techo: 101, time: T0 },
  });
  const corto = () => ({
    lado: -1, entrada: 100, tiempoEntrada: T0, stop: 101, objetivo: 97, riesgo: 1,
    abiertaEn: 0, zona4h: { piso: 105, techo: 110, time: T0 },
    zona15: { piso: 99, techo: 101, time: T0 },
  });
  const cfg = { ...DOSFVG_POR_DEFECTO, comision: 0, spread: 0 };

  const ambosL = gestionarDosFvg(largo(), vela(T0, 100, 104, 98, 102), 1, cfg, 0);
  comprobar("largo: tocando stop y objetivo manda el STOP", ambosL?.motivo === "stop",
    JSON.stringify(ambosL?.motivo));
  comprobar("y pierde 1R", Math.abs((ambosL?.erres ?? 0) + 1) < 1e-9, String(ambosL?.erres));

  const ambosC = gestionarDosFvg(corto(), vela(T0, 100, 102, 96, 98), 1, cfg, 0);
  comprobar("corto: lo mismo, el stop manda", ambosC?.motivo === "stop",
    JSON.stringify(ambosC?.motivo));

  const ganaL = gestionarDosFvg(largo(), vela(T0, 100, 103.5, 99.5, 103), 1, cfg, 0);
  comprobar("largo: solo objetivo gana 3R", ganaL?.motivo === "objetivo" &&
    Math.abs((ganaL?.erres ?? 0) - 3) < 1e-9, String(ganaL?.erres));
  const ganaC = gestionarDosFvg(corto(), vela(T0, 100, 100.5, 96.5, 97), 1, cfg, 0);
  comprobar("corto: solo objetivo también gana 3R", ganaC?.motivo === "objetivo" &&
    Math.abs((ganaC?.erres ?? 0) - 3) < 1e-9, String(ganaC?.erres));

  comprobar("una vela que no toca nada la deja viva",
    gestionarDosFvg(largo(), vela(T0, 100, 101, 99.5, 100.5), 1, cfg, 0) === null);

  // Caducidad por tiempo.
  const porTiempo = gestionarDosFvg(largo(), vela(T0, 100, 101, 99.5, 100.5),
    DOSFVG_POR_DEFECTO.duracionMaxima, cfg, 0);
  comprobar("pasada la duración máxima se cierra al precio del momento",
    porTiempo?.motivo === "tiempo", JSON.stringify(porTiempo?.motivo));

  // El costo siempre resta, en los dos lados.
  const cL = gestionarDosFvg(largo(), vela(T0, 100, 103.5, 99.5, 103), 1, cfg, 0.001);
  comprobar("el costo resta en el largo", (cL?.erres ?? 0) < 3, String(cL?.erres));
  const cC = gestionarDosFvg(corto(), vela(T0, 100, 100.5, 96.5, 97), 1, cfg, 0.001);
  comprobar("y también en el corto", (cC?.erres ?? 0) < 3, String(cC?.erres));
}

// ───────────── el motor entero ─────────────
console.log("El motor dispara");
{
  const r = correrDosFvg(W.h4, W.m15, DOSFVG_POR_DEFECTO);
  comprobar("salen operaciones", r.operaciones.length > 0, String(r.operaciones.length));
  comprobar("DISPARA MÁS que la de tres tiempos (es más simple)",
    r.operaciones.length > 40, `${r.operaciones.length} en ${W.m15.length} velas de 15M`);
  comprobar("ningún número raro",
    r.operaciones.every((o) => [o.entrada, o.stop, o.objetivo, o.salida, o.erres].every(Number.isFinite)));
  comprobar("hay largos y cortos", r.operaciones.some((o) => o.lado === "largo") &&
    r.operaciones.some((o) => o.lado === "corto"),
    JSON.stringify([...new Set(r.operaciones.map((o) => o.lado))]));
  comprobar("en los largos el stop va debajo y el objetivo arriba",
    r.operaciones.filter((o) => o.lado === "largo")
      .every((o) => o.stop < o.entrada && o.objetivo > o.entrada));
  comprobar("en los cortos, al revés",
    r.operaciones.filter((o) => o.lado === "corto")
      .every((o) => o.stop > o.entrada && o.objetivo < o.entrada));
  comprobar("el objetivo está a las erres pedidas",
    r.operaciones.every((o) =>
      Math.abs(Math.abs(o.objetivo - o.entrada) / Math.abs(o.entrada - o.stop) - DOSFVG_POR_DEFECTO.rr) < 1e-6));
  comprobar("van en orden y no se pisan",
    r.operaciones.every((o, i) => i === 0 || o.tiempoEntrada >= r.operaciones[i - 1].tiempoSalida));
  comprobar("se cuentan los montajes que no llegaron a nada",
    r.sinFvg15 + r.sinEntrada > 0, `${r.sinFvg15} sin FVG de 15M, ${r.sinEntrada} sin entrada`);
  comprobar("cada operación recuerda sus dos zonas",
    r.operaciones.every((o) => o.zona4h.techo > o.zona4h.piso && o.zona15.techo > o.zona15.piso));
}

// ───────────── que no mire el futuro ─────────────
console.log("Cortar la serie no cambia lo ya operado");
{
  const completo = correrDosFvg(W.h4, W.m15, DOSFVG_POR_DEFECTO);
  let desvios = 0;
  let detalle = "";
  for (let corte = 2000; corte < W.m15.length; corte += 1600) {
    const hasta = W.m15[corte - 1].time;
    const parcial = correrDosFvg(
      W.h4.filter((v) => v.time + H4 <= hasta),
      W.m15.slice(0, corte),
      DOSFVG_POR_DEFECTO,
    );
    const esperadas = completo.operaciones.filter((o) => o.tiempoSalida <= hasta);
    const obtenidas = parcial.operaciones.filter((o) => o.motivo !== "final");
    const mismo = esperadas.length === obtenidas.length &&
      esperadas.every((o, i) =>
        o.tiempoEntrada === obtenidas[i].tiempoEntrada &&
        Math.abs(o.entrada - obtenidas[i].entrada) < 1e-9 &&
        Math.abs(o.erres - obtenidas[i].erres) < 1e-9);
    if (!mismo) {
      desvios++;
      if (!detalle) detalle = `corte ${corte}: ${obtenidas.length} vs ${esperadas.length}`;
    }
  }
  comprobar("ningún corte altera lo anterior", desvios === 0, detalle);
}

// ───────────── EL CONTROL ─────────────
console.log("Paseo aleatorio puro: no puede haber ventaja");
{
  let ops = 0;
  let sin = 0;
  let con = 0;
  const sinErres = [];
  for (let s = 1; s <= 10; s++) {
    const P = mundo(s * 7919, 14000, false);
    const a = correrDosFvg(P.h4, P.m15, DOSFVG_POR_DEFECTO);
    const b = correrDosFvg(P.h4, P.m15, { ...DOSFVG_POR_DEFECTO, comision: 0, spread: 0 });
    ops += a.operaciones.length;
    con += a.operaciones.reduce((x, o) => x + o.erres, 0);
    sin += b.operaciones.reduce((x, o) => x + o.erres, 0);
    for (const o of b.operaciones) sinErres.push(o.erres);
  }
  const media = sinErres.reduce((s, x) => s + x, 0) / ops;
  const desv = Math.sqrt(sinErres.reduce((s, x) => s + (x - media) ** 2, 0) / (ops - 1));
  const margen = (1.96 * desv) / Math.sqrt(ops);

  // El umbral es el INTERVALO, no un número a dedo: con una desviación
  // de más de 1R por operación, pedirle a la media que esté por debajo
  // de 0,05 es pedir una precisión que la muestra no tiene, y entonces
  // el control pasa o falla según la semilla.
  comprobar("dispara lo suficiente como para que el control sirva", ops >= 1000, String(ops));
  comprobar("SIN costos el cero está dentro del intervalo de confianza",
    media - margen <= 0,
    `${media >= 0 ? "+" : ""}${media.toFixed(3)}R ± ${margen.toFixed(3)} → [${(media - margen).toFixed(3)}, ${(media + margen).toFixed(3)}]`);
  console.log(`     (esta muestra detecta fugas de ${margen.toFixed(2)}R por operación o más)`);
  comprobar("CON costos pierde más", con < sin,
    `${(con / ops).toFixed(3)} vs ${(sin / ops).toFixed(3)}`);
}

// El motivo de que el stop por defecto NO sea el borde del hueco, escrito
// como prueba para que nadie lo cambie sin volver a medirlo.
console.log("El stop al borde del hueco es degenerado, y por eso no es el defecto");
{
  comprobar("el defecto es el swing", DOSFVG_POR_DEFECTO.stop === "swing", DOSFVG_POR_DEFECTO.stop);
  const medir = (modo) => {
    const d = [];
    let r = 0;
    for (let s = 1; s <= 10; s++) {
      const P = mundo(s * 7919, 14000, false);
      for (const o of correrDosFvg(P.h4, P.m15, {
        ...DOSFVG_POR_DEFECTO, comision: 0, spread: 0, stop: modo,
      }).operaciones) {
        d.push((o.tiempoSalida - o.tiempoEntrada) / M15);
        r += o.erres;
      }
    }
    d.sort((x, y) => x - y);
    return { mediana: d[Math.floor(d.length / 2)], esperanza: r / d.length, n: d.length };
  };
  const hueco = medir("hueco");
  const swing = medir("swing");
  comprobar("con el stop al hueco las operaciones duran casi nada", hueco.mediana <= 2,
    `mediana ${hueco.mediana} velas`);
  comprobar("y por eso finge ventaja donde no hay ninguna", hueco.esperanza > 0.1,
    `${hueco.esperanza.toFixed(3)}R en paseo aleatorio`);
  comprobar("con el stop al swing las operaciones duran algo real", swing.mediana >= 4,
    `mediana ${swing.mediana} velas`);
  comprobar("y el paseo aleatorio queda sin ventaja", swing.esperanza <= 0.05,
    `${swing.esperanza.toFixed(3)}R en paseo aleatorio`);
}

// ───────── los dos huecos del tuit, como parámetros ─────────
console.log("Los supuestos que el tuit no dice cambian el resultado");
{
  const base = correrDosFvg(W.h4, W.m15, DOSFVG_POR_DEFECTO);
  const sumaR = (r) => r.operaciones.reduce((s, o) => s + o.erres, 0);

  // 1. Dónde va el stop. (El defecto es "swing"; se compara contra el otro.)
  const stopHueco = correrDosFvg(W.h4, W.m15, { ...DOSFVG_POR_DEFECTO, stop: "hueco" });
  comprobar("el stop en el swing da un resultado distinto que en el hueco",
    Math.abs(sumaR(stopHueco) - sumaR(base)) > 1e-6,
    `hueco ${sumaR(stopHueco).toFixed(1)}R vs swing ${sumaR(base).toFixed(1)}R`);

  // 2. En qué parte del FVG se entra.
  const borde = correrDosFvg(W.h4, W.m15, { ...DOSFVG_POR_DEFECTO, entradaEn: 0 });
  const fondo = correrDosFvg(W.h4, W.m15, { ...DOSFVG_POR_DEFECTO, entradaEn: 1 });
  comprobar("entrar en el borde da MÁS operaciones que en el fondo",
    borde.operaciones.length >= fondo.operaciones.length,
    `borde ${borde.operaciones.length} vs fondo ${fondo.operaciones.length}`);
  comprobar("y los tres niveles dan resultados distintos",
    new Set([sumaR(borde).toFixed(3), sumaR(base).toFixed(3), sumaR(fondo).toFixed(3)]).size > 1,
    `${sumaR(borde).toFixed(1)} / ${sumaR(base).toFixed(1)} / ${sumaR(fondo).toFixed(1)}`);

  // 3. Qué cuenta como tocar el FVG de 4H.
  const completo = correrDosFvg(W.h4, W.m15, { ...DOSFVG_POR_DEFECTO, toqueCompleto: true });
  comprobar("exigir el relleno completo da menos señales",
    completo.operaciones.length <= base.operaciones.length,
    `${completo.operaciones.length} vs ${base.operaciones.length}`);

  // 4. Solo largos.
  const soloLargos = correrDosFvg(W.h4, W.m15, { ...DOSFVG_POR_DEFECTO, permitirCortos: false });
  comprobar("sin cortos, no sale ni un corto",
    soloLargos.operaciones.every((o) => o.lado === "largo"));
  comprobar("y hay menos operaciones", soloLargos.operaciones.length < base.operaciones.length,
    `${soloLargos.operaciones.length} vs ${base.operaciones.length}`);

  // 5. Las erres objetivo.
  const rr5 = correrDosFvg(W.h4, W.m15, { ...DOSFVG_POR_DEFECTO, rr: 5 });
  comprobar("con objetivo de 5R hay menos aciertos",
    rr5.operaciones.filter((o) => o.erres > 0).length / (rr5.operaciones.length || 1) <=
    base.operaciones.filter((o) => o.erres > 0).length / (base.operaciones.length || 1) + 0.02,
    `5R: ${(100 * rr5.operaciones.filter((o) => o.erres > 0).length / (rr5.operaciones.length || 1)).toFixed(0)}%`);
}

console.log("Bordes");
{
  comprobar("series vacías no explotan", correrDosFvg([], []).operaciones.length === 0);
  comprobar("series cortas tampoco",
    correrDosFvg(W.h4.slice(0, 3), W.m15.slice(0, 20)).operaciones.length === 0);
  const plana = Array.from({ length: 3000 }, (_, i) => vela(T0 + i * M15, 100, 100, 100, 100));
  comprobar("una serie plana no inventa nada", correrDosFvg(plana, plana).operaciones.length === 0);
}

console.log(`\n${bien} bien, ${malos.length} mal`);
process.exit(malos.length === 0 ? 0 : 1);
