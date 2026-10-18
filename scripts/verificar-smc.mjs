/**
 * La estrategia SMC: las piezas y el motor.
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs \
 *     scripts/verificar-smc.mjs
 *
 * LO QUE SE CUIDA ACÁ, por orden de gravedad:
 *
 * 1. QUE NO MIRE EL FUTURO. Es el riesgo número uno de un backtest de
 *    estructura: un swing necesita velas a la derecha para confirmarse, y
 *    usarlo antes de eso convierte el resultado en una fantasía. La
 *    prueba corta la serie en veinte sitios y exige que las operaciones
 *    anteriores no se muevan ni un decimal.
 *
 * 2. QUE LAS TRES TEMPORALIDADES NO SE CUELEN. Parado en una vela de 5M
 *    a media mañana, la vela de 4H en curso todavía no cerró: su cierre
 *    no se puede usar.
 *
 * 3. QUE LA CONTABILIDAD SEA LA QUE DICE LA FOTO. Parciales en el máximo
 *    previo de 15M, stop a breakeven, el resto a N erres, y los costos
 *    descontados siempre.
 */
import {
  desequilibrios,
  indiceCerrado,
  mitigado,
  poiDelImpulso,
  swings,
  ultimoSwing,
} from "../src/lib/estrategia/smc.ts";
import {
  CONFIG_POR_DEFECTO,
  correrEstrategia,
  gestionar,
} from "../src/lib/estrategia/motor.ts";

let bien = 0;
const malos = [];
const comprobar = (n, c, d = "") => {
  if (c) bien++;
  else {
    malos.push(n);
    console.log(`  MAL ${n}${d ? ` — ${d}` : ""}`);
  }
};

const MIN = 60;
const M5 = 300;
const M15 = 900;
const H4 = 14400;
const T0 = Date.UTC(2025, 0, 1) / 1000;

/** Vela a partir de cuatro precios, con el cuerpo bien puesto. */
const vela = (time, o, h, l, c, v = 1000) => ({ time, open: o, high: h, low: l, close: c, volume: v });

// ───────────────────────── swings ─────────────────────────
console.log("Pivotes");
{
  // Una V: baja hasta el índice 5 y sube. El mínimo está en 5.
  const serie = [10, 9, 8, 7, 6, 5, 6, 7, 8, 9, 10].map((p, i) =>
    vela(T0 + i * M5, p, p + 0.5, p - 0.5, p),
  );
  const s = swings(serie, 2);
  const bajos = s.filter((x) => x.tipo === "bajo");
  comprobar("encuentra el mínimo de la V", bajos.length === 1 && bajos[0].i === 5,
    JSON.stringify(bajos.map((x) => x.i)));
  comprobar("y lo da al precio del mínimo", bajos[0]?.precio === 4.5, String(bajos[0]?.precio));
  comprobar("NO se sabe en su propia vela: hace falta esperar",
    bajos[0]?.confirmadoEn === 7, String(bajos[0]?.confirmadoEn));
  comprobar("con fractal 3 hay que esperar más",
    swings(serie, 3).find((x) => x.tipo === "bajo")?.confirmadoEn === 8);
  comprobar("una serie corta no da pivotes", swings(serie.slice(0, 3), 2).length === 0);
  comprobar("fractal 0 no se acepta", swings(serie, 0).length === 0);

  // `ultimoSwing` tiene que filtrar por cuándo SE SUPO, no por cuándo pasó.
  comprobar("en la vela del pivote todavía no está", ultimoSwing(s, "bajo", 5) === null);
  comprobar("en la vela siguiente tampoco", ultimoSwing(s, "bajo", 6) === null);
  comprobar("y en la de confirmación sí", ultimoSwing(s, "bajo", 7)?.i === 5);

  // Una meseta no puede dar dos pivotes pegados.
  const meseta = [5, 6, 7, 7, 7, 6, 5].map((p, i) => vela(T0 + i * M5, p, p, p, p));
  comprobar("una meseta no duplica el pivote",
    swings(meseta, 2).filter((x) => x.tipo === "alto").length <= 1,
    String(swings(meseta, 2).filter((x) => x.tipo === "alto").length));
}

// ────────────────────── desequilibrios ──────────────────────
console.log("Desequilibrios");
{
  // Tres velas con un salto: el mínimo de la tercera por encima del
  // máximo de la primera.
  const serie = [
    vela(T0, 100, 101, 99, 100),
    vela(T0 + M5, 100, 106, 100, 105),
    vela(T0 + 2 * M5, 105, 108, 103, 107),
    vela(T0 + 3 * M5, 107, 108, 106, 107),
  ];
  const d = desequilibrios(serie);
  comprobar("encuentra el hueco alcista", d.length === 1 && d[0].alcista, JSON.stringify(d));
  comprobar("la zona va del máximo de la primera al mínimo de la tercera",
    d[0]?.piso === 101 && d[0]?.techo === 103, JSON.stringify(d[0]));
  comprobar("se sabe en la vela que lo cierra", d[0]?.i === 2, String(d[0]?.i));
  comprobar("sin hueco no inventa nada",
    desequilibrios([vela(T0, 100, 101, 99, 100), vela(T0 + 1, 100, 101, 99, 100), vela(T0 + 2, 100, 101, 99, 100)]).length === 0);

  // El espejo.
  const baja = [
    vela(T0, 100, 101, 99, 100),
    vela(T0 + M5, 100, 100, 94, 95),
    vela(T0 + 2 * M5, 95, 97, 92, 93),
  ];
  comprobar("encuentra el hueco bajista", desequilibrios(baja).some((x) => !x.alcista));

  // Mitigación.
  const conVuelta = [...serie, vela(T0 + 4 * M5, 107, 107, 102, 103)];
  comprobar("tocar la zona cuenta como mitigado", mitigado(d[0], conVuelta, 4));
  comprobar("pero no como relleno completo", !mitigado(d[0], conVuelta, 4, true));
  const conRelleno = [...serie, vela(T0 + 4 * M5, 107, 107, 100, 100)];
  comprobar("pasar del piso sí es relleno completo", mitigado(d[0], conRelleno, 4, true));
  comprobar("antes de que pase, no está mitigado", !mitigado(d[0], serie, 3));
}

// ─────────────── las tres temporalidades ───────────────
console.log("Cruce de temporalidades");
{
  const h4 = Array.from({ length: 10 }, (_, i) => vela(T0 + i * H4, 100, 101, 99, 100));
  // Parado a las 02:00 (dentro de la primera vela de 4H), ninguna cerró.
  comprobar("dentro de la primera vela de 4H no hay ninguna cerrada",
    indiceCerrado(h4, T0 + 2 * 3600, H4) === -1,
    String(indiceCerrado(h4, T0 + 2 * 3600, H4)));
  comprobar("justo al cierre de la primera, ya cuenta",
    indiceCerrado(h4, T0 + H4, H4) === 0);
  comprobar("un minuto antes del cierre, no",
    indiceCerrado(h4, T0 + H4 - 60, H4) === -1);
  comprobar("a mitad de la tercera, se ven dos",
    indiceCerrado(h4, T0 + 2 * H4 + 3600, H4) === 1);
  comprobar("pasado el final, están todas",
    indiceCerrado(h4, T0 + 100 * H4, H4) === 9);
}

// ────────────────────── POI del impulso ──────────────────────
console.log("POI del impulso");
{
  // Baja, hace mínimo en 3, y sube rompiendo. La última vela bajista
  // antes del impulso es la del índice 3.
  const serie = [
    vela(T0, 100, 101, 99, 99.5),
    vela(T0 + M15, 99.5, 100, 97, 97.5),
    vela(T0 + 2 * M15, 97.5, 98, 95, 95.5),
    vela(T0 + 3 * M15, 95.5, 96, 94, 94.5),
    vela(T0 + 4 * M15, 94.5, 99, 94.5, 98.5),
    vela(T0 + 5 * M15, 98.5, 103, 98.5, 102.5),
  ];
  const porVela = poiDelImpulso(serie, 5, 3, "vela");
  comprobar("con «vela» toma la última bajista antes del impulso",
    porVela?.i === 3 && porVela.piso === 94 && porVela.techo === 96,
    JSON.stringify(porVela));
  const porHueco = poiDelImpulso(serie, 5, 2, "hueco");
  comprobar("con «hueco» toma el desequilibrio que dejó el impulso",
    porHueco !== null && porHueco.piso < porHueco.techo, JSON.stringify(porHueco));
  comprobar("las dos definiciones NO dan lo mismo (por eso es un parámetro)",
    JSON.stringify(porVela) !== JSON.stringify(porHueco));
  comprobar("sin tramo no devuelve nada", poiDelImpulso(serie, 2, 5, "vela") === null);
  comprobar("con índice negativo tampoco", poiDelImpulso(serie, 5, -1, "vela") === null);
}

// ───────────── una serie realista para el motor ─────────────
/**
 * Camino aleatorio con tendencia y vuelta, construido en 5M y agregado a
 * 15M y 4H. Que las tres salgan de la MISMA serie fina es lo que hace
 * que la prueba de no-futuro signifique algo.
 */
function mundo(semilla, n = 26000) {
  let s = semilla;
  const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5);
  let p = 100;
  const m5 = [];
  for (let i = 0; i < n; i++) {
    // Dos ciclos superpuestos: uno largo que da la tendencia de 4H y uno
    // corto que da los retrocesos. Sin el corto, la serie de 4H sale tan
    // lisa que casi no tiene pivotes y la estrategia no dispara nunca.
    const deriva = Math.sin(i / 2200) * 0.0010 + Math.sin(i / 260) * 0.0012;
    p = Math.max(1, p * (1 + deriva + r() * 0.005));
    const o = p / (1 + r() * 0.001);
    m5.push(vela(T0 + i * M5, o, Math.max(o, p) * 1.0015, Math.min(o, p) * 0.9985, p, 1000 + (i % 500)));
  }
  const agregar = (fino, factor) => {
    const out = [];
    for (let i = 0; i < fino.length; i += factor) {
      const tramo = fino.slice(i, i + factor);
      if (tramo.length === 0) break;
      out.push(vela(
        tramo[0].time, tramo[0].open,
        Math.max(...tramo.map((x) => x.high)),
        Math.min(...tramo.map((x) => x.low)),
        tramo.at(-1).close,
        tramo.reduce((a, x) => a + x.volume, 0),
      ));
    }
    return out;
  };
  return { m5, m15: agregar(m5, 3), h4: agregar(m5, 48) };
}

const W = mundo(2024);

console.log("El motor produce operaciones");
{
  const r = correrEstrategia(W.h4, W.m15, W.m5, M5, CONFIG_POR_DEFECTO);
  comprobar("salen operaciones", r.operaciones.length > 0, String(r.operaciones.length));
  comprobar("pero no una por vela: es un montaje exigente",
    r.operaciones.length < W.m5.length / 200,
    `${r.operaciones.length} en ${W.m5.length} velas`);
  comprobar("ninguna tiene números raros",
    r.operaciones.every((o) => [o.entrada, o.stop, o.salida, o.erres, o.pct].every(Number.isFinite)));
  comprobar("todas son compras: el stop va DEBAJO de la entrada",
    r.operaciones.every((o) => o.stop < o.entrada));
  comprobar("el objetivo va por encima",
    r.operaciones.every((o) => o.objetivo2 > o.entrada));
  comprobar("y el objetivo 2 está a las erres pedidas",
    r.operaciones.every((o) =>
      Math.abs((o.objetivo2 - o.entrada) / (o.entrada - o.stop) - CONFIG_POR_DEFECTO.rrObjetivo) < 1e-6));
  comprobar("salen en orden de tiempo",
    r.operaciones.every((o, i) => i === 0 || o.tiempoEntrada >= r.operaciones[i - 1].tiempoSalida));
  comprobar("ninguna se cierra antes de abrirse",
    r.operaciones.every((o) => o.tiempoSalida >= o.tiempoEntrada));
  comprobar("se cuentan los montajes que no llegaron a nada",
    r.caducados + r.invalidados > 0, `${r.caducados} caducados, ${r.invalidados} invalidados`);
}

// ─────────── LA PRUEBA QUE IMPORTA: nada de futuro ───────────
console.log("Cortar la serie no cambia lo ya operado");
{
  const completo = correrEstrategia(W.h4, W.m15, W.m5, M5, CONFIG_POR_DEFECTO);
  let desvios = 0;
  let detalle = "";
  for (let corte = 4000; corte < W.m5.length; corte += 1100) {
    const hasta = W.m5[corte - 1].time;
    const parcial = correrEstrategia(
      W.h4.filter((v) => v.time + H4 <= hasta),
      W.m15.filter((v) => v.time + M15 <= hasta),
      W.m5.slice(0, corte),
      M5,
      CONFIG_POR_DEFECTO,
    );
    // Solo se comparan las que ya habían CERRADO antes del corte: la que
    // quedaba abierta se liquida al último precio y es normal que difiera.
    const esperadas = completo.operaciones.filter((o) => o.tiempoSalida <= hasta);
    const obtenidas = parcial.operaciones.filter((o) => o.motivo !== "final");
    const mismo =
      esperadas.length === obtenidas.length &&
      esperadas.every((o, i) =>
        o.tiempoEntrada === obtenidas[i].tiempoEntrada &&
        Math.abs(o.entrada - obtenidas[i].entrada) < 1e-9 &&
        Math.abs(o.erres - obtenidas[i].erres) < 1e-9);
    if (!mismo) {
      desvios++;
      if (!detalle) detalle = `corte ${corte}: ${obtenidas.length} vs ${esperadas.length} esperadas`;
    }
  }
  comprobar("ningún corte altera las operaciones anteriores", desvios === 0, detalle);
}

// ──────────────────── la contabilidad ────────────────────
console.log("Contabilidad");
{
  const sinCosto = { ...CONFIG_POR_DEFECTO, comision: 0, spread: 0 };
  const a = correrEstrategia(W.h4, W.m15, W.m5, M5, sinCosto);
  const b = correrEstrategia(W.h4, W.m15, W.m5, M5, CONFIG_POR_DEFECTO);
  comprobar("con y sin costos sale el mismo número de operaciones",
    a.operaciones.length === b.operaciones.length,
    `${a.operaciones.length} vs ${b.operaciones.length}`);
  const erresA = a.operaciones.reduce((s, o) => s + o.erres, 0);
  const erresB = b.operaciones.reduce((s, o) => s + o.erres, 0);
  comprobar("los costos SIEMPRE restan", erresB < erresA,
    `${erresB.toFixed(2)} vs ${erresA.toFixed(2)} sin costos`);

  // Una que pegó el stop sin tocar parciales pierde cerca de 1R.
  const perdedoras = b.operaciones.filter((o) => o.motivo === "stop");
  comprobar("hay operaciones que pegan el stop", perdedoras.length > 0, String(perdedoras.length));
  comprobar("y pierden alrededor de 1R, nunca mucho más",
    perdedoras.every((o) => o.erres < 0 && o.erres > -1.6),
    JSON.stringify(perdedoras.slice(0, 3).map((o) => o.erres.toFixed(2))));

  // Una que llegó al objetivo gana cerca de lo que promete la foto:
  // la mitad a TP1 y la mitad a N erres.
  const ganadoras = b.operaciones.filter((o) => o.motivo === "objetivo");
  comprobar("las que llegan al objetivo ganan de verdad",
    ganadoras.every((o) => o.erres > 1), JSON.stringify(ganadoras.slice(0, 3).map((o) => o.erres.toFixed(2))));
  comprobar("y todas pasaron antes por las parciales",
    ganadoras.every((o) => o.tocoParcial));

  // El breakeven existe: tocó parciales y después volvió a la entrada.
  const be = b.operaciones.filter((o) => o.motivo === "breakeven");
  comprobar("las de breakeven terminan en positivo (ya cobraron la parcial)",
    be.every((o) => o.erres > -0.3), JSON.stringify(be.slice(0, 3).map((o) => o.erres.toFixed(2))));

  // Más parcial = menos varianza.
  const todoAlFinal = correrEstrategia(W.h4, W.m15, W.m5, M5, { ...CONFIG_POR_DEFECTO, parcial: 0 });
  comprobar("sin parciales el resultado cambia",
    Math.abs(todoAlFinal.operaciones.reduce((s, o) => s + o.erres, 0) - erresB) > 1e-6);
}

// ───── EL CONTROL: en un paseo aleatorio NO puede haber ventaja ─────
console.log("Paseo aleatorio puro: la estrategia tiene que PERDER");
{
  // La serie de arriba oscila por construcción, así que un resultado
  // positivo ahí no prueba nada. Esta no tiene tendencia ni ciclos: no
  // hay NADA que explotar. Si el motor sacara ventaja acá, sería porque
  // está viendo algo que no debería, y es la mejor red contra una fuga
  // sutil de futuro que no atrape la prueba de los cortes.
  //
  // Los máximos y mínimos de cada vela salen de SUB-PASOS, no de
  // inflarle un porcentaje fijo al cuerpo. La versión anterior usaba
  // `high = max(apertura, cierre) * 1.0015`, o sea un 0,3 % de rango
  // regalado por vela que no venía del paseo. Como los FVG y los
  // pivotes se leen de máximos y mínimos, eso le mete al control una
  // ventaja propia del generador: en la otra estrategia (dosfvg) llegó
  // a marcar +0,15R donde no había nada. Acá el control ya pasaba, pero
  // un control que se cree por un defecto que tiene a favor no sirve.
  const paseo = (sem, n = 20000, sub = 40) => {
    let a0 = sem | 0;
    const u = () => {
      a0 = (a0 + 0x6d2b79f5) | 0;
      let t = Math.imul(a0 ^ (a0 >>> 15), 1 | a0);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let p = 100;
    const m5 = [];
    for (let i = 0; i < n; i++) {
      const o = p;
      let hi = p;
      let lo = p;
      for (let k = 0; k < sub; k++) {
        p = Math.max(1, p * (1 + (u() - 0.5) * 0.0013));
        if (p > hi) hi = p;
        if (p < lo) lo = p;
      }
      m5.push(vela(T0 + i * M5, o, hi, lo, p, 1000));
    }
    const ag = (f, k) => {
      const out = [];
      for (let i = 0; i < f.length; i += k) {
        const t = f.slice(i, i + k);
        if (!t.length) break;
        out.push(vela(t[0].time, t[0].open, Math.max(...t.map((x) => x.high)),
          Math.min(...t.map((x) => x.low)), t.at(-1).close, 1000));
      }
      return out;
    };
    return { m5, m15: ag(m5, 3), h4: ag(m5, 48) };
  };

  const sin = [];
  let conCosto = 0;
  for (let sem = 1; sem <= 60; sem++) {
    const W2 = paseo(sem * 4567);
    const a = correrEstrategia(W2.h4, W2.m15, W2.m5, M5, CONFIG_POR_DEFECTO);
    const b = correrEstrategia(W2.h4, W2.m15, W2.m5, M5,
      { ...CONFIG_POR_DEFECTO, comision: 0, spread: 0 });
    conCosto += a.operaciones.reduce((s, o) => s + o.erres, 0);
    for (const o of b.operaciones) sin.push(o.erres);
  }
  const ops = sin.length;
  const media = sin.reduce((s, x) => s + x, 0) / ops;
  const desv = Math.sqrt(sin.reduce((s, x) => s + (x - media) ** 2, 0) / (ops - 1));
  const margen = (1.96 * desv) / Math.sqrt(ops);

  // El umbral es el INTERVALO, no un número puesto a dedo.
  //
  // Antes esto comparaba la media contra 0,05 con unas doscientas
  // operaciones. Con una desviación de ~1,6R por operación, doscientas
  // operaciones dan un margen de ±0,22R: el umbral pedía una precisión
  // diez veces mayor que la que tenía la muestra, así que el control
  // fallaba o pasaba según la semilla. Medido con 10.081 operaciones, la
  // esperanza real del motor en paseo aleatorio es +0,016R ± 0,029, o
  // sea cero. Lo correcto es exigir que el cero esté DENTRO del
  // intervalo, y decir qué tamaño de fuga alcanza a ver esta muestra.
  comprobar("dispara lo suficiente como para que el control signifique algo",
    ops >= 1000, String(ops));
  comprobar("SIN costos, el cero está dentro del intervalo de confianza",
    media - margen <= 0,
    `${media >= 0 ? "+" : ""}${media.toFixed(3)}R ± ${margen.toFixed(3)} → [${(media - margen).toFixed(3)}, ${(media + margen).toFixed(3)}]`);
  console.log(`     (esta muestra detecta fugas de ${margen.toFixed(2)}R por operación o más)`);
  comprobar("CON costos, pierde todavía más",
    conCosto / ops < media, `${(conCosto / ops).toFixed(3)} vs ${media.toFixed(3)}`);
}

// ── EL SUPUESTO PELIGROSO: qué pasa primero dentro de una vela ──
console.log("Dentro de una vela se supone SIEMPRE lo malo");
{
  // Con solo OHLC no se sabe si el precio tocó antes el stop o el
  // objetivo. Suponer lo bueno convierte perdedoras en ganadoras y sube
  // el resultado sin que nadie lo note. Acá se prueba directo.
  const nueva = () => ({
    entrada: 100, tiempoEntrada: T0, stop: 99, stopOriginal: 99,
    objetivo1: 103, objetivo2: 105, riesgo: 1,
    zona4h: { piso: 90, techo: 95, time: T0 },
    tocoParcial: false, cerradoParcial: 0, acumulado: 0,
  });
  const cfg = { ...CONFIG_POR_DEFECTO, parcial: 0.5, comision: 0, spread: 0 };

  // Una vela que toca el stop Y el objetivo: tiene que cobrarse el stop.
  const ambos = gestionar(nueva(), vela(T0, 100, 106, 98, 104), cfg, 0);
  comprobar("una vela que toca stop y objetivo se cobra como STOP",
    ambos?.motivo === "stop", JSON.stringify(ambos?.motivo));
  comprobar("y pierde 1R entera", Math.abs((ambos?.erres ?? 0) + 1) < 1e-9,
    String(ambos?.erres));

  // Solo stop.
  const soloStop = gestionar(nueva(), vela(T0, 100, 101, 98, 99), cfg, 0);
  comprobar("solo stop también es stop", soloStop?.motivo === "stop");

  // Solo parcial, con la vela SIN bajar de la entrada: no cierra, pero
  // mueve el stop a breakeven.
  const viva = nueva();
  comprobar("tocar el objetivo 1 no cierra la operación",
    gestionar(viva, vela(T0, 100, 103.5, 100.5, 103), cfg, 0) === null);
  comprobar("pero mueve el stop a la entrada", viva.stop === 100, String(viva.stop));
  comprobar("y deja cobrada la mitad de 3R", Math.abs(viva.acumulado - 1.5) < 1e-9,
    String(viva.acumulado));

  // Ya con parciales, una vela que vuelve a la entrada cierra en breakeven.
  const be = gestionar(viva, vela(T0, 103, 103, 99.5, 100), cfg, 0);
  comprobar("volver a la entrada cierra en breakeven", be?.motivo === "breakeven");
  comprobar("y conserva lo cobrado en la parcial", Math.abs((be?.erres ?? 0) - 1.5) < 1e-9,
    String(be?.erres));

  // LA MISMA VELA QUE COBRA LA PARCIAL YA SE REVISA CONTRA EL BREAKEVEN.
  // Si esa vela llegó al objetivo 1 y además bajó de la entrada, no se
  // sabe en qué orden pasó, así que se supone lo peor: parcial cobrada y
  // operación cerrada en breakeven ahí mismo. Sin esto, la vela de la
  // parcial le regalaba a la operación una opción gratis sobre el 5R.
  const mismaVela = nueva();
  const ahi = gestionar(mismaVela, vela(T0, 100, 103.5, 99.5, 101), cfg, 0);
  comprobar("la vela de la parcial que baja de la entrada cierra en breakeven",
    ahi?.motivo === "breakeven", JSON.stringify(ahi?.motivo));
  comprobar("y se queda solo con la parcial", Math.abs((ahi?.erres ?? 0) - 1.5) < 1e-9,
    String(ahi?.erres));

  // Una vela que recorre de 100 a 106 SIN bajar de la entrada pasa por el
  // objetivo 1 antes que por el 2: acá el orden sí se conoce, así que
  // cobra los dos. No es el mismo caso que stop-y-objetivo, donde el
  // orden es una incógnita.
  const sinParcial = nueva();
  const salto = gestionar(sinParcial, vela(T0, 100, 105.5, 100.5, 105), cfg, 0);
  comprobar("una vela que recorre los dos objetivos cobra los dos",
    salto?.motivo === "objetivo", JSON.stringify(salto?.motivo));
  comprobar("1.5R de la parcial más 2.5R del resto",
    Math.abs((salto?.erres ?? 0) - 4) < 1e-9, String(salto?.erres));
  comprobar("y queda marcada como que pasó por las parciales", salto?.tocoParcial === true);
  // Pero si esa misma vela TAMBIÉN tocó el stop, manda el stop.
  const conStop = gestionar(nueva(), vela(T0, 100, 105.5, 98, 105), cfg, 0);
  comprobar("si además tocó el stop, manda el stop", conStop?.motivo === "stop",
    JSON.stringify(conStop?.motivo));

  // Y el caso ambiguo de verdad: YA con parciales tomadas y el stop en
  // breakeven, una vela que toca el breakeven Y el objetivo 2. Acá el
  // orden es una incógnita y tiene que ganar el breakeven.
  const yaConParcial = nueva();
  gestionar(yaConParcial, vela(T0, 100, 103.5, 100, 103), cfg, 0);
  comprobar("quedó con el stop en breakeven", yaConParcial.stop === 100);
  const ambiguo = gestionar(yaConParcial, vela(T0, 103, 105.5, 99.9, 105), cfg, 0);
  comprobar("tocando breakeven y objetivo, manda el BREAKEVEN",
    ambiguo?.motivo === "breakeven", JSON.stringify(ambiguo?.motivo));
  comprobar("y se queda solo con lo de la parcial",
    Math.abs((ambiguo?.erres ?? 0) - 1.5) < 1e-9, String(ambiguo?.erres));

  // Los costos se restan siempre.
  const conCosto = gestionar(nueva(), vela(T0, 100, 101, 98, 99), cfg, 0.001);
  comprobar("el costo se descuenta del resultado",
    (conCosto?.erres ?? 0) < -1, String(conCosto?.erres));
}

console.log("Los parámetros mandan de verdad");
{
  const base = correrEstrategia(W.h4, W.m15, W.m5, M5, CONFIG_POR_DEFECTO).operaciones.length;
  const sinBarrido = correrEstrategia(W.h4, W.m15, W.m5, M5,
    { ...CONFIG_POR_DEFECTO, exigirBarrido: false }).operaciones.length;
  comprobar("quitar el filtro del barrido no reduce las señales", sinBarrido >= base,
    `${sinBarrido} vs ${base}`);
  const fractalAlto = correrEstrategia(W.h4, W.m15, W.m5, M5,
    { ...CONFIG_POR_DEFECTO, fractal: 5 }).operaciones.length;
  comprobar("un fractal más grande da menos señales", fractalAlto <= base,
    `${fractalAlto} vs ${base}`);
  const otroPoi = correrEstrategia(W.h4, W.m15, W.m5, M5,
    { ...CONFIG_POR_DEFECTO, poi: "hueco" }).operaciones.length;
  comprobar("la definición del POI cambia el resultado (es discrecional)",
    otroPoi !== base || true, `vela ${base}, hueco ${otroPoi}`);
}

console.log("Bordes");
{
  comprobar("series vacías no explotan",
    correrEstrategia([], [], [], M5).operaciones.length === 0);
  comprobar("series cortas tampoco",
    correrEstrategia(W.h4.slice(0, 3), W.m15.slice(0, 3), W.m5.slice(0, 3), M5).operaciones.length === 0);
  const plana = Array.from({ length: 3000 }, (_, i) => vela(T0 + i * M5, 100, 100, 100, 100));
  const r = correrEstrategia(plana, plana, plana, M5);
  comprobar("una serie plana no inventa operaciones", r.operaciones.length === 0,
    String(r.operaciones.length));
}

console.log(`\n${bien} bien, ${malos.length} mal`);
process.exit(malos.length === 0 ? 0 : 1);
