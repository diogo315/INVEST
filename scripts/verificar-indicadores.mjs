/**
 * Prueba la matemática de los indicadores nuevos contra valores calculados a
 * mano y contra propiedades que tienen que cumplirse siempre.
 *
 *   node --experimental-strip-types scripts/verificar-indicadores.mjs
 */

import {
  adr,
  alligator,
  aroon,
  atr,
  awesomeOscillator,
  dema,
  desplazar,
  emaSerie,
  keltner,
  obv,
  parabolicSar,
  rangoVerdadero,
  rma,
  smaSerie,
  supertrend,
} from "../src/lib/indicators/nuevos.ts";

let fallos = 0;
function ok(que, condicion, detalle = "") {
  if (condicion) console.log(`✓ ${que}`);
  else {
    fallos++;
    console.log(`✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
}
const cerca = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

const PASO = 900; // 15 minutos
const vela = (i, o, h, l, c, v = 100) => ({
  time: 1_700_000_000 + i * PASO,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
});

// ── rango verdadero y ATR, contra cuentas a mano ───────────────────────
{
  // Velas armadas para que cada rama del máximo gane una vez.
  const c = [
    vela(0, 10, 12, 8, 11), //  TR = 12-8 = 4 (primera vela)
    vela(1, 11, 14, 13, 13), //  máx-cierrePrev = 14-11 = 3 > 14-13 = 1
    vela(2, 13, 12, 9, 10), //  cierrePrev-mín = 13-9 = 4 > 12-9 = 3
    vela(3, 10, 11, 10, 10), //  11-10 = 1 > |11-10|=1, |10-10|=0 → 1
  ];
  const tr = rangoVerdadero(c);
  ok("rango verdadero vela por vela", tr.join(",") === "4,3,4,1", tr.join(","));

  // ATR(2) de Wilder: siembra con la SMA de los dos primeros TR y después
  // suaviza. TR = 4,3,4,1 → ATR[1] = 3.5; ATR[2] = (3.5+4)/2 = 3.75;
  // ATR[3] = (3.75+1)/2 = 2.375.
  const a = atr(c, 2);
  ok(
    "ATR(2) coincide con la cuenta de Wilder a mano",
    a.length === 3 && cerca(a[0].value, 3.5) && cerca(a[1].value, 3.75) && cerca(a[2].value, 2.375),
    JSON.stringify(a.map((p) => p.value)),
  );
  ok("el ATR no publica puntos antes de tener período completo", a[0].time === c[1].time);
}

// ── RMA / EMA / SMA sobre una serie conocida ───────────────────────────
{
  const v = [1, 2, 3, 4, 5];
  ok("SMA(3) = 2, 3, 4", smaSerie(v, 3).slice(2).join(",") === "2,3,4");
  ok("antes del período la SMA es null", smaSerie(v, 3)[1] === null);
  // EMA(3): siembra 2; k = 0.5 → 4*0.5+2*0.5 = 3; 5*0.5+3*0.5 = 4
  ok("EMA(3) sembrada con la SMA", emaSerie(v, 3).slice(2).join(",") === "2,3,4");
  // RMA(3): siembra 2; (2*2+4)/3 = 2.6667; (2.6667*2+5)/3 = 3.4444
  const r = rma(v, 3);
  ok(
    "RMA(3) suaviza más lento que la EMA",
    cerca(r[3], 8 / 3, 1e-12) && cerca(r[4], (2 * (8 / 3) + 5) / 3, 1e-12),
    JSON.stringify(r),
  );
  ok("una serie más corta que el período no devuelve nada", rma([1, 2], 5).every((x) => x === null));
}

// ── DEMA: sobre una recta tiene que caer exactamente sobre la recta ────
{
  // y = 3i + 10. La EMA se queda atrás un retraso constante; la DEMA, al
  // ser 2·EMA − EMA(EMA), lo cancela. Es la mejor prueba de que está bien.
  const c = Array.from({ length: 200 }, (_, i) => {
    const p = 3 * i + 10;
    return vela(i, p, p, p, p);
  });
  const d = dema(c, 20);
  const ultimo = d[d.length - 1];
  ok(
    "DEMA(20) sobre una recta devuelve el valor exacto de la recta",
    cerca(ultimo.value, 3 * 199 + 10, 1e-6),
    `${ultimo.value} vs ${3 * 199 + 10}`,
  );
  const e = emaSerie(c.map((k) => k.close), 20);
  ok(
    "la EMA en cambio sí se queda atrás (por eso existe la DEMA)",
    Math.abs(e[199] - (3 * 199 + 10)) > 20,
    String(e[199]),
  );
  ok("la DEMA(20) arranca recién en la vela 39", d[0].time === c[38].time, String(d.length));
}

// ── desplazamiento (el offset del Alligator) ───────────────────────────
{
  const pts = [
    { time: 100, value: 1 },
    { time: 200, value: 2 },
    { time: 300, value: 3 },
  ];
  const d = desplazar(pts, 2, 100);
  ok(
    "los valores se corren hacia adelante",
    d.map((p) => p.value).join(",") === "1,2,3" && d[0].time === 300,
    JSON.stringify(d),
  );
  ok(
    "los tiempos que caen más allá de la última vela se extrapolan",
    d[1].time === 400 && d[2].time === 500,
    JSON.stringify(d.map((p) => p.time)),
  );
  ok("desplazar 0 no toca nada", desplazar(pts, 0, 100) === pts);
}

// ── Alligator ──────────────────────────────────────────────────────────
{
  const c = Array.from({ length: 80 }, (_, i) => {
    const p = 100 + i;
    return vela(i, p, p + 1, p - 1, p);
  });
  const a = alligator(c);
  ok(
    "las tres líneas del Alligator existen y la de labios es la más larga",
    a.labios.length > a.dientes.length && a.dientes.length > a.mandibula.length,
    `${a.labios.length}/${a.dientes.length}/${a.mandibula.length}`,
  );
  // En una subida sostenida los labios (rápidos) van arriba de los dientes y
  // estos arriba de la mandíbula: el "cocodrilo con la boca abierta".
  const enTiempo = (serie, t) => serie.find((p) => p.time === t)?.value;
  const t = c[70].time;
  ok(
    "en tendencia alcista: labios > dientes > mandíbula",
    enTiempo(a.labios, t) > enTiempo(a.dientes, t) &&
      enTiempo(a.dientes, t) > enTiempo(a.mandibula, t),
    `${enTiempo(a.labios, t)} / ${enTiempo(a.dientes, t)} / ${enTiempo(a.mandibula, t)}`,
  );
  // La media es del precio medio (hl2), que acá es el cierre.
  const smmaLabios = rma(c.map((k) => (k.high + k.low) / 2), 5);
  ok(
    "los labios son la SMMA(5) del precio medio, corrida 3 velas",
    cerca(a.labios[0].value, smmaLabios[4], 1e-12) && a.labios[0].time === c[7].time,
  );
  ok(
    "la última línea se dibuja adelantada al futuro",
    a.labios[a.labios.length - 1].time > c[c.length - 1].time,
  );
}

// ── Keltner ────────────────────────────────────────────────────────────
{
  const c = Array.from({ length: 60 }, (_, i) => {
    const p = 100 + Math.sin(i / 4) * 5;
    return vela(i, p, p + 2, p - 2, p);
  });
  const k = keltner(c, 20, 2, 10, true);
  const e = emaSerie(c.map((x) => x.close), 20);
  const a = rma(rangoVerdadero(c), 10);
  const i = 59;
  ok(
    "la media de Keltner es la EMA del cierre",
    cerca(k.media[k.media.length - 1].value, e[i], 1e-12),
  );
  ok(
    "las bandas están a 2 ATR de la media",
    cerca(k.superior[k.superior.length - 1].value - k.media[k.media.length - 1].value, 2 * a[i], 1e-12) &&
      cerca(k.media[k.media.length - 1].value - k.inferior[k.inferior.length - 1].value, 2 * a[i], 1e-12),
  );
  ok(
    "con multiplicador más grande el canal es más ancho",
    keltner(c, 20, 3).superior.at(-1).value > k.superior.at(-1).value,
  );
  const simple = keltner(c, 20, 2, 10, false);
  ok(
    "se puede pedir media simple en vez de exponencial",
    cerca(simple.media.at(-1).value, smaSerie(c.map((x) => x.close), 20)[i], 1e-12),
  );
  ok(
    "las tres series tienen el mismo largo",
    k.media.length === k.superior.length && k.superior.length === k.inferior.length,
  );
}

// ── Awesome Oscillator ─────────────────────────────────────────────────
{
  const c = Array.from({ length: 60 }, (_, i) => {
    const p = 100 + i;
    return vela(i, p, p + 1, p - 1, p);
  });
  const ao = awesomeOscillator(c);
  const medios = c.map((k) => (k.high + k.low) / 2);
  ok(
    "AO = SMA(5) − SMA(34) del precio medio",
    cerca(ao.at(-1).value, smaSerie(medios, 5)[59] - smaSerie(medios, 34)[59], 1e-12),
  );
  ok("el AO arranca en la vela 34", ao[0].time === c[33].time, String(ao.length));
  // Subida lineal: la diferencia entre medias es constante → ninguna barra
  // sube respecto de la anterior después de la primera.
  const subiendo = awesomeOscillator(
    Array.from({ length: 60 }, (_, i) => {
      const p = i < 40 ? 100 : 100 + (i - 40) * 5;
      return vela(i, p, p + 1, p - 1, p);
    }),
  );
  ok(
    "el color marca si la barra sube respecto de la anterior",
    subiendo.at(-1).sube === true && subiendo.at(-1).value > subiendo.at(-5).value,
  );
  const bajando = awesomeOscillator(
    Array.from({ length: 60 }, (_, i) => {
      const p = i < 40 ? 100 : 100 - (i - 40) * 5;
      return vela(i, p, p + 1, p - 1, p);
    }),
  );
  ok("bajando, la barra se marca en rojo", bajando.at(-1).sube === false);
}

// ── Aroon ──────────────────────────────────────────────────────────────
{
  const sube = Array.from({ length: 30 }, (_, i) => {
    const p = 100 + i;
    return vela(i, p, p + 1, p - 1, p);
  });
  const a = aroon(sube, 14);
  ok(
    "en subida pura: Aroon arriba 100, abajo 0",
    a.arriba.at(-1).value === 100 && a.abajo.at(-1).value === 0,
    `${a.arriba.at(-1).value}/${a.abajo.at(-1).value}`,
  );
  const baja = Array.from({ length: 30 }, (_, i) => {
    const p = 100 - i;
    return vela(i, p, p + 1, p - 1, p);
  });
  const b = aroon(baja, 14);
  ok(
    "en bajada pura: al revés",
    b.arriba.at(-1).value === 0 && b.abajo.at(-1).value === 100,
  );
  ok("el Aroon arranca en la vela 14", a.arriba[0].time === sube[14].time);
  // Máximo hace 7 velas sobre un período de 14 → (14-7)/14 = 50 %.
  const pico = Array.from({ length: 30 }, (_, i) => {
    const p = i === 22 ? 200 : 100;
    return vela(i, p, p, p - 1, p);
  });
  const p = aroon(pico, 14);
  ok(
    "un máximo de hace 7 velas da 50",
    p.arriba.find((x) => x.time === pico[29].time).value === 50,
    String(p.arriba.at(-1).value),
  );
}

// ── ADR ────────────────────────────────────────────────────────────────
{
  const c = [
    vela(0, 10, 12, 10, 11), // rango 2
    vela(1, 11, 15, 11, 14), // rango 4
    vela(2, 14, 20, 14, 18), // rango 6
  ];
  const a = adr(c, 3);
  ok("ADR(3) es el promedio de los rangos (2+4+6)/3 = 4", a.length === 1 && cerca(a[0].value, 4));
  ok("ADR(2) de las dos últimas = 5", cerca(adr(c, 2).at(-1).value, 5));
}

// ── OBV ────────────────────────────────────────────────────────────────
{
  const c = [
    vela(0, 10, 10, 10, 10, 50),
    vela(1, 10, 10, 10, 11, 30), // cierra arriba → +30
    vela(2, 11, 11, 11, 11, 70), // igual → no cambia
    vela(3, 11, 11, 11, 9, 20), // cierra abajo → −20
  ];
  const o = obv(c);
  ok(
    "OBV suma, no cambia y resta según el cierre",
    o.map((p) => p.value).join(",") === "0,30,30,10",
    JSON.stringify(o.map((p) => p.value)),
  );
  ok("el OBV existe desde la primera vela", o.length === c.length);
}

// ── Parabolic SAR ──────────────────────────────────────────────────────
{
  // Sube 30 velas y después baja 30: el SAR tiene que acompañar por abajo,
  // darse vuelta y seguir por arriba.
  const c = Array.from({ length: 60 }, (_, i) => {
    const p = i < 30 ? 100 + i * 2 : 100 + 29 * 2 - (i - 29) * 2;
    return vela(i, p, p + 1, p - 1, p);
  });
  const s = parabolicSar(c);
  ok("el SAR arranca en la segunda vela", s[0].time === c[1].time && s.length === 59);

  const enSubida = s.filter((p) => p.time <= c[28].time);
  ok(
    "en la subida el SAR queda siempre por debajo del mínimo",
    enSubida.every((p, i) => p.value <= c[i + 1].low + 1e-9),
  );
  ok("en la subida la tendencia se marca alcista", enSubida.every((p) => p.alcista));

  const flip = s.findIndex((p) => !p.alcista);
  ok("el SAR se da vuelta cuando el precio lo cruza", flip > 25 && flip < 40, String(flip));

  const alFinal = s.slice(-10);
  ok(
    "después de darse vuelta el SAR va por arriba del máximo",
    alFinal.every((p) => !p.alcista) &&
      alFinal.every((p, i) => p.value >= c[c.length - 10 + i].high - 1e-9),
  );
  // Aceleración: al principio de una tendencia el SAR se acerca despacio y
  // después más rápido, porque el factor sube 0,02 por extremo nuevo.
  const paso1 = s[3].value - s[2].value;
  const paso2 = s[20].value - s[19].value;
  ok("el SAR acelera a medida que la tendencia aguanta", paso2 > paso1, `${paso1} → ${paso2}`);
  ok("con dos velas o menos no devuelve nada", parabolicSar([vela(0, 1, 1, 1, 1)]).length === 0);
}

// ── Supertrend ─────────────────────────────────────────────────────────
{
  const c = Array.from({ length: 80 }, (_, i) => {
    const p = i < 40 ? 100 + i * 2 : 100 + 39 * 2 - (i - 39) * 2;
    return vela(i, p, p + 1, p - 1, p);
  });
  const st = supertrend(c, 10, 3);
  ok("el Supertrend arranca cuando el ATR ya existe", st[0].time === c[9].time);

  // Convención de TradingView: la primera vela arranca del lado bajista y la
  // línea se pasa para abajo recién cuando el cierre rompe la banda trabada.
  ok("arranca del lado de la banda de arriba, como en Pine", st[0].alcista === false);
  const seHizoAlcista = st.findIndex((p) => p.alcista);
  ok(
    "se pasa al lado alcista cuando el precio rompe la banda",
    seHizoAlcista > 0 && seHizoAlcista < 25,
    String(seHizoAlcista),
  );

  const subida = st.slice(seHizoAlcista).filter((p) => p.time <= c[38].time);
  const cierreEn = (t) => c.find((k) => k.time === t).close;
  ok("en la subida la línea va por debajo del cierre", subida.every((p) => p.value < cierreEn(p.time)));
  ok("y la marca es alcista", subida.every((p) => p.alcista));

  const flip = st.findIndex((p, i) => i > seHizoAlcista && !p.alcista);
  ok("cambia de lado en la vuelta", flip > 25 && flip < 60, String(flip));

  const bajada = st.slice(-10);
  ok(
    "en la bajada la línea queda por arriba del cierre",
    bajada.every((p) => !p.alcista) && bajada.every((p, i) => p.value > c[c.length - 10 + i].close),
  );
  // La banda no puede ensancharse mientras la tendencia aguanta: eso es el
  // "lock" del Supertrend y lo que lo diferencia de un canal de ATR pelado.
  const tramo = st.slice(seHizoAlcista).filter((p) => p.alcista && p.time <= c[38].time);
  ok(
    "mientras la tendencia aguanta la línea nunca baja",
    tramo.every((p, i) => i === 0 || p.value >= tramo[i - 1].value - 1e-9),
  );
  ok(
    "con factor más chico la línea queda más pegada al precio",
    supertrend(c, 10, 1).find((p) => p.time === c[30].time).value >
      st.find((p) => p.time === c[30].time).value,
  );
}

// ── nada explota con series cortas o vacías ────────────────────────────
{
  const vacio = [];
  const uno = [vela(0, 1, 2, 0.5, 1.5)];
  const pruebas = [
    ["atr", () => atr(vacio) && atr(uno, 14)],
    ["dema", () => dema(vacio) && dema(uno, 20)],
    ["keltner", () => keltner(vacio) && keltner(uno)],
    ["alligator", () => alligator(vacio) && alligator(uno)],
    ["ao", () => awesomeOscillator(vacio) && awesomeOscillator(uno)],
    ["aroon", () => aroon(vacio) && aroon(uno)],
    ["adr", () => adr(vacio) && adr(uno)],
    ["obv", () => obv(vacio) && obv(uno)],
    ["sar", () => parabolicSar(vacio) && parabolicSar(uno)],
    ["supertrend", () => supertrend(vacio) && supertrend(uno)],
  ];
  let rotos = [];
  for (const [nombre, fn] of pruebas) {
    try {
      fn();
    } catch (e) {
      rotos.push(`${nombre}: ${e.message}`);
    }
  }
  ok("ninguno explota con 0 o 1 vela", rotos.length === 0, rotos.join(" | "));
}

console.log(
  fallos === 0
    ? "\n✓ los 10 indicadores nuevos dan los valores esperados"
    : `\n✗ ${fallos} fallos`,
);
process.exit(fallos === 0 ? 0 : 1);
