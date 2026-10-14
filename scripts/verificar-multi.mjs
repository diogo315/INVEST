/**
 * Las dos gráficas del backtesting, y sobre todo: que NINGUNA muestre el
 * futuro.
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs \
 *     scripts/verificar-multi.mjs
 *
 * El riesgo es concreto. Con el reloj a media mañana y una gráfica diaria
 * al lado, la vela del día ya trae el cierre de la tarde: si se dibujara
 * tal cual, uno estaría "decidiendo" viendo lo que todavía no pasó y el
 * backtest entero sería mentira. Estas pruebas son la red de eso.
 */
import {
  TEMPORALIDADES_BT,
  armarParcial,
  otraTemporalidad,
  velasDelPanel,
} from "../src/lib/backtest/multi.ts";

let bien = 0;
const malos = [];
const comprobar = (n, c, d = "") => {
  if (c) bien++;
  else {
    malos.push(`${n}${d ? ` — ${d}` : ""}`);
    console.log(`  MAL ${n}${d ? ` — ${d}` : ""}`);
  }
};

const HORA = 3600;
const DIA = 86400;

// Diez días de velas de una hora, con un recorrido distinto cada día para
// que el máximo y el mínimo caigan en horas distintas.
const h1 = [];
for (let d = 0; d < 10; d++) {
  for (let h = 0; h < 24; h++) {
    const base = 100 + d * 5;
    // Sube hasta el mediodía y baja después: el máximo del día está a las
    // 12, así que una parcial de la mañana NO puede tenerlo.
    const c = base + (h <= 12 ? h : 24 - h) * 0.5;
    h1.push({
      time: d * DIA + h * HORA,
      open: c - 0.1,
      high: c + 0.2,
      low: c - 0.3,
      close: c,
      volume: 10 + h,
    });
  }
}

/** Las diarias de verdad, agregadas de las de una hora. Es la referencia. */
const d1 = [];
for (let d = 0; d < 10; d++) {
  const dia = h1.slice(d * 24, d * 24 + 24);
  d1.push({
    time: d * DIA,
    open: dia[0].open,
    high: Math.max(...dia.map((v) => v.high)),
    low: Math.min(...dia.map((v) => v.low)),
    close: dia.at(-1).close,
    volume: dia.reduce((s, v) => s + v.volume, 0),
  });
}

// ── la gráfica base se comporta como siempre ────────────────────────
console.log("La gráfica base no cambia");
{
  // Parado en una vela se ve esa vela completa: es la convención que el
  // backtest ya tenía con una sola gráfica y no se puede mover.
  for (const t of [0, 5 * HORA, 3 * DIA, 9 * DIA + 23 * HORA]) {
    const v = velasDelPanel(h1, HORA, t, { velas: h1, segundos: HORA });
    const esperado = h1.filter((c) => c.time <= t);
    comprobar(
      `base 1h en t=${t / HORA}h: ${esperado.length} velas, la última es la del reloj`,
      v.length === esperado.length && v.at(-1)?.time === t,
      `${v.length} vs ${esperado.length}`,
    );
    comprobar(
      `base 1h en t=${t / HORA}h: ninguna vela posterior al reloj`,
      v.every((c) => c.time <= t),
    );
  }
  const vd = velasDelPanel(d1, DIA, 3 * DIA, { velas: d1, segundos: DIA });
  comprobar("base 1d: la vela del día en curso va entera", vd.length === 4 && vd.at(-1).time === 3 * DIA);
  comprobar("y es la vela real, sin tocar", vd.at(-1).close === d1[3].close);
}

// ── la segunda, más fina que la base ────────────────────────────────
console.log("Segunda gráfica más fina (1h con base 1d)");
{
  const t = 3 * DIA;
  const v = velasDelPanel(h1, HORA, t, { velas: d1, segundos: DIA });
  comprobar("se ven las 24 horas del día en curso", v.length === 4 * 24, String(v.length));
  comprobar("la última es la de las 23:00 de ese día", v.at(-1).time === 3 * DIA + 23 * HORA);
  comprobar(
    "ni una sola hora del día siguiente",
    v.every((c) => c.time < 4 * DIA),
  );
  comprobar("son las velas reales, sin inventar", v.every((c, i) => c.close === h1[i].close));
}

// ── la segunda, más gruesa: ACÁ ESTÁ EL PELIGRO ─────────────────────
console.log("Segunda gráfica más gruesa (1d con base 1h) — la vela en curso");
{
  // Reloj a las 09:00 del día 3. La vela diaria del día 3 todavía no
  // cerró: su máximo real está a las 12:00, que NO pasó.
  const t = 3 * DIA + 9 * HORA;
  const v = velasDelPanel(d1, DIA, t, { velas: h1, segundos: HORA });
  comprobar("hay tres días cerrados más el que está en curso", v.length === 4, String(v.length));
  const curso = v.at(-1);
  comprobar("la vela en curso lleva la fecha del día", curso.time === 3 * DIA);

  // Lo que de verdad pasó hasta el cierre de las 09:00 (horizonte: 10:00).
  const hasta = h1.filter((c) => c.time >= 3 * DIA && c.time < t + HORA);
  comprobar("son diez horas de datos", hasta.length === 10, String(hasta.length));
  comprobar("abre donde abrió el día", curso.open === hasta[0].open);
  comprobar("cierra en el último cierre conocido", curso.close === hasta.at(-1).close);
  comprobar("el máximo es el de lo vivido", curso.high === Math.max(...hasta.map((c) => c.high)));
  comprobar("el mínimo también", curso.low === Math.min(...hasta.map((c) => c.low)));
  comprobar("el volumen es la suma de lo vivido", curso.volume === hasta.reduce((s, c) => s + c.volume, 0));

  // LO QUE IMPORTA: no es la vela real del día.
  comprobar("NO es la vela real del día entero", curso.close !== d1[3].close);
  comprobar("su máximo es MENOR que el del día", curso.high < d1[3].high,
    `${curso.high} vs ${d1[3].high}`);
  comprobar("nunca supera el máximo real del día", curso.high <= d1[3].high);
  comprobar("nunca baja del mínimo real del día", curso.low >= d1[3].low);
  comprobar(
    "ningún día posterior aparece",
    v.every((c) => c.time <= 3 * DIA),
  );

  // A las 23:00 la parcial ya tiene que valer lo mismo que la vela real.
  const tarde = velasDelPanel(d1, DIA, 3 * DIA + 23 * HORA, { velas: h1, segundos: HORA });
  const completa = tarde.at(-1);
  comprobar("al cierre del día la parcial coincide con la vela real",
    completa.open === d1[3].open && completa.high === d1[3].high &&
    completa.low === d1[3].low && completa.close === d1[3].close &&
    completa.volume === d1[3].volume,
    JSON.stringify(completa));
}

// ── la prueba de fuego: borrar el futuro no cambia nada ─────────────
console.log("Borrar el futuro de los datos no cambia el dibujo");
{
  // Si el resultado dependiera de velas posteriores al reloj, recortar los
  // datos daría otra cosa. Es la misma prueba que ya se le hace a los
  // indicadores, aplicada a las dos gráficas.
  for (const t of [2 * DIA + 7 * HORA, 5 * DIA + 15 * HORA, 8 * DIA]) {
    const horizonte = t + HORA;
    const h1Corto = h1.filter((c) => c.time < horizonte);
    const d1Corto = d1.filter((c) => c.time < horizonte);
    for (const [nombre, velas, seg, cortas] of [
      ["1d", d1, DIA, d1Corto],
      ["1h", h1, HORA, h1Corto],
    ]) {
      const todo = velasDelPanel(velas, seg, t, { velas: h1, segundos: HORA });
      const recortado = velasDelPanel(cortas, seg, t, { velas: h1Corto, segundos: HORA });
      comprobar(
        `${nombre} en t=${t / HORA}h: el mismo dibujo con y sin datos futuros`,
        JSON.stringify(todo) === JSON.stringify(recortado),
        `${todo.length} vs ${recortado.length}`,
      );
    }
  }
}

// ── armarParcial sola ───────────────────────────────────────────────
console.log("armarParcial");
{
  comprobar("sin velas finas devuelve null", armarParcial([], 0, DIA) === null);
  comprobar("si no hay ninguna en el rango devuelve null",
    armarParcial(h1, 50 * DIA, 51 * DIA) === null);
  const una = armarParcial(h1, 0, HORA);
  comprobar("con una sola vela la copia", una.open === h1[0].open && una.close === h1[0].close);
  comprobar("y el volumen es el de esa vela", una.volume === h1[0].volume);
  const marcada = armarParcial(h1, 3 * HORA, 6 * HORA, 999);
  comprobar("usa la fecha que se le pide", marcada.time === 999);
  comprobar("el rango es medio abierto: no entra la vela del final",
    marcada.close === h1[5].close, String(marcada.close));
}

// ── los bordes ──────────────────────────────────────────────────────
console.log("Bordes");
{
  comprobar("sin velas no explota", velasDelPanel([], DIA, 100, { velas: h1, segundos: HORA }).length === 0);
  comprobar("con el reloj antes de todo no devuelve nada",
    velasDelPanel(d1, DIA, -DIA, { velas: h1, segundos: HORA }).length === 0);
  const pasado = velasDelPanel(d1, DIA, 100 * DIA, { velas: h1, segundos: HORA });
  comprobar("con el reloj después de todo devuelve todo", pasado.length === d1.length);
  // Misma temporalidad en las dos: la segunda se comporta como la base.
  const igual = velasDelPanel(d1, DIA, 3 * DIA, { velas: d1, segundos: DIA });
  comprobar("dos gráficas en la misma temporalidad muestran lo mismo",
    igual.length === 4 && igual.at(-1).close === d1[3].close);
}

// ── la temporalidad con la que arranca la segunda ───────────────────
console.log("Temporalidad por defecto de la segunda");
{
  comprobar("un escalón más gruesa", otraTemporalidad("1h") === "4h");
  comprobar("de 1d pasa a 1w", otraTemporalidad("1d") === "1w");
  comprobar("desde la más gruesa va para abajo", otraTemporalidad("1w") === "1d");
  comprobar("una desconocida cae en 1d", otraTemporalidad("3s") === "1d");
  comprobar("nunca devuelve la misma",
    TEMPORALIDADES_BT.every((t) => otraTemporalidad(t) !== t));
  comprobar("y siempre devuelve una de la lista",
    TEMPORALIDADES_BT.every((t) => TEMPORALIDADES_BT.includes(otraTemporalidad(t))));
}

console.log(`\n${bien} bien, ${malos.length} mal`);
process.exit(malos.length === 0 ? 0 : 1);
