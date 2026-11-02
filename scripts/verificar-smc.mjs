/**
 * El motor SMC: que el port de Pine haga lo que hace el original.
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs scripts/verificar-smc.mjs
 *
 * Lo que más importa acá no es que los números sean lindos sino que el
 * motor NO MIRE EL FUTURO: si con 300 velas dice algo distinto que con
 * 1000 velas sobre esas mismas 300, el backtest está haciendo trampa y
 * cualquier resultado que dé es basura. Esa es la prueba 2.
 */

import {
  ALCISTA,
  BAJISTA,
  CONFIG_SMC,
  calcularSMC,
  clavePeriodo,
  nivelAnterior,
  zonasDe,
} from "../src/lib/smc/motor.ts";

let fallos = 0;
const ok = (que, cond, detalle = "") => {
  if (cond) console.log(`✓ ${que}`);
  else {
    fallos++;
    console.log(`✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};

const DIA = 86400;
const T0 = Math.floor(Date.UTC(2024, 0, 1) / 1000);

/** Una vela a partir de los cuatro precios. */
const v = (i, o, h, l, c) => ({
  time: T0 + i * DIA,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 100,
});

/** Vela "normal": cuerpo chico alrededor de un precio. */
const plana = (i, p) => v(i, p, p + 1, p - 1, p);

/** Generador reproducible, para series largas. */
function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function serieLarga(n = 700, semilla = 7) {
  const r = azar(semilla);
  const out = [];
  let p = 50000;
  for (let i = 0; i < n; i++) {
    const o = p;
    // Tendencias que se dan vuelta, para que haya BOS en los dos sentidos.
    const deriva = Math.sin(i / 40) * 60;
    p = p + deriva + (r() - 0.5) * 220;
    const h = Math.max(o, p) + r() * 90;
    const l = Math.min(o, p) - r() * 90;
    out.push(v(i, o, h, l, p));
  }
  return out;
}

/**
 * Serie base de todas las pruebas a mano.
 *
 * Arranca con una caída a propósito. En Pine la variable `leg` nace en 0,
 * que vale BEARISH_LEG, así que el PRIMER pivote alto de una serie no
 * dispara cambio de pierna y se pierde. No es un error del port: es el
 * original, y una serie de prueba que empiece subiendo no detecta nada.
 *
 * Con `largoInterno: 2` deja: pivote bajo en la vela 0 (80), pivote alto
 * en la 3 (110), y la 4 como la más baja del tramo (88).
 */
const BASE = [
  v(0, 100, 101, 80, 98),
  v(1, 98, 99, 95, 97),
  v(2, 97, 99, 96, 98),
  v(3, 98, 110, 97, 100),
  v(4, 100, 101, 88, 99),
  v(5, 99, 100, 97, 99),
  v(6, 99, 116, 98, 115),   // cierra sobre 110: BOS alcista
];

const chico = (extra = {}) => ({
  ...CONFIG_SMC,
  largoInterno: 2,
  largoSwing: 40,           // tan largo que no hay pivotes de swing: aísla lo interno
  barrasIguales: 2,
  ...extra,
  senales: {
    ...CONFIG_SMC.senales,
    tick: 1,
    relacionMinima: 0.1,
    objetivoR: 2,
    ...(extra.senales ?? {}),
  },
});

const conCola = (cola, extra = {}) => calcularSMC([...BASE, ...cola], chico(extra));

// ─────────────────────────────────────────────────────────────────────
console.log("1. Los pivotes llegan tarde, y eso está bien");
{
  // Sin la vela del cruce no hay nada que anunciar.
  const r = calcularSMC(BASE.slice(0, 6), chico());
  ok("sin cruces no hay eventos de estructura", r.estructura.length === 0,
    JSON.stringify(r.estructura));
  ok("la tendencia arranca en cero", r.tendenciaInterna[5] === 0);

  const r2 = calcularSMC(BASE, chico());
  const e = r2.estructura[0];
  ok("al cerrar por encima del pico hay un evento", !!e, JSON.stringify(r2.estructura));
  ok("EL EVENTO SE FECHA EN LA VELA DEL CRUCE, no en la del pico",
    e?.indice === 6, String(e?.indice));
  ok("pero la línea arranca en la vela del pico", e?.desdeIndice === 3,
    String(e?.desdeIndice));
  ok("y el nivel roto es el máximo de esa vela", e?.nivel === 110, String(e?.nivel));
  ok("el primero es BOS, no CHoCH (no había tendencia que cambiar)",
    e?.tipo === "BOS", e?.tipo);
  ok("y deja la tendencia alcista", r2.tendenciaInterna[6] === ALCISTA);

  // El retardo del pivote, dicho de otra forma: la vela 3 hace el máximo,
  // pero el motor no puede saberlo hasta la 5.
  ok("UN PIVOTE NO SE CONOCE HASTA 2 VELAS DESPUÉS",
    calcularSMC(BASE.slice(0, 5), chico()).estructura.length === 0);
}

// ─────────────────────────────────────────────────────────────────────
console.log("2. EL MOTOR NO MIRA EL FUTURO");
{
  const velas = serieLarga(700);
  const todo = calcularSMC(velas, CONFIG_SMC);

  // Con un prefijo de las mismas velas, todo lo que ya pasó tiene que
  // salir idéntico. Si no, en algún lado se está leyendo una vela que en
  // ese momento no existía.
  let peor = "";
  let comparaciones = 0;
  for (const corte of [250, 400, 550, 690]) {
    const parcial = calcularSMC(velas.slice(0, corte), CONFIG_SMC);

    const recorte = (lista, campo = "indice") =>
      lista.filter((x) => x[campo] < corte);

    const comparar = (nombre, a, b, limpiar = (x) => x) => {
      const ja = a.map((x) => JSON.stringify(limpiar(x)));
      const jb = b.map((x) => JSON.stringify(limpiar(x)));
      if (ja.length === jb.length && ja.every((x, i) => x === jb[i])) {
        comparaciones++;
        return;
      }
      if (peor) return;
      // Se señala el PRIMER elemento que difiere: con listas de cientos
      // de bloques, volcar las dos enteras no dice nada.
      let i = 0;
      while (i < ja.length && i < jb.length && ja[i] === jb[i]) i++;
      peor =
        `${nombre} @${corte}: ${jb.length} parciales vs ${ja.length} totales, ` +
        `primera diferencia en ${i}\n    parcial=${jb[i] ?? "(no hay)"}\n    total  =${ja[i] ?? "(no hay)"}`;
    };

    comparar("estructura", recorte(todo.estructura), parcial.estructura);
    comparar("esperas", recorte(todo.esperas), parcial.esperas);
    // De las señales se compara la ENTRADA, no la salida: una señal
    // abierta al cortar todavía no sabe cómo terminó, y eso es correcto.
    comparar(
      "señales",
      recorte(todo.senales),
      parcial.senales,
      ({ sesgo, indice, entrada, stop, objetivo, nivel }) =>
        ({ sesgo, indice, entrada, stop, objetivo, nivel }),
    );
    // Un bloque nacido antes del corte que recién se mitiga DESPUÉS
    // tiene que verse vivo en el parcial: se normaliza su mitigación a
    // lo que se sabía en ese momento.
    comparar(
      "bloques",
      recorte(todo.bloques, "creadoEn").map((b) => ({
        ...b,
        mitigadoEn: b.mitigadoEn !== null && b.mitigadoEn < corte ? b.mitigadoEn : null,
      })),
      parcial.bloques,
      ({ sesgo, interno, alto, bajo, indice, creadoEn, mitigadoEn }) =>
        ({ sesgo, interno, alto, bajo, indice, creadoEn, mitigadoEn }),
    );
    // Los pares EQH/EQL se DIBUJAN en la vela del pivote pero se SABEN
    // unas velas después; se comparan por cuándo se supieron.
    comparar("iguales", recorte(todo.iguales, "confirmadoEn"), parcial.iguales);
  }
  ok("lo ya ocurrido no cambia al agregar velas nuevas", peor === "", peor);
  ok("y se compararon las cinco listas en los cuatro cortes",
    comparaciones === 20, String(comparaciones));
  ok("y había algo que comparar, no listas vacías",
    todo.estructura.length >= 10 && todo.bloques.length >= 10 &&
      todo.senales.length >= 2 && todo.iguales.length >= 1,
    `${todo.estructura.length} eventos, ${todo.bloques.length} bloques, ` +
      `${todo.senales.length} señales, ${todo.iguales.length} pares`);
  ok("y hay estructura de los dos tipos",
    todo.estructura.some((x) => x.interna) && todo.estructura.some((x) => !x.interna),
    `internas ${todo.estructura.filter((x) => x.interna).length}, ` +
      `swing ${todo.estructura.filter((x) => !x.interna).length}`);
}

// ─────────────────────────────────────────────────────────────────────
console.log("3. BOS contra CHoCH");
{
  // Tras el BOS alcista, romper el mínimo interno da vuelta la tendencia.
  const r = conCola([v(7, 115, 116, 75, 80)]);
  const ev = r.estructura;
  ok("hay dos eventos", ev.length === 2,
    JSON.stringify(ev.map((x) => `${x.tipo}${x.sesgo > 0 ? "+" : "-"}@${x.indice}`)));
  ok("el primero hacia arriba es BOS", ev[0]?.tipo === "BOS" && ev[0]?.sesgo === ALCISTA);
  ok("EL QUE DA VUELTA LA TENDENCIA ES CHoCH",
    ev[1]?.tipo === "CHOCH" && ev[1]?.sesgo === BAJISTA,
    `${ev[1]?.tipo} ${ev[1]?.sesgo}`);
  ok("y la tendencia queda bajista", r.tendenciaInterna[7] === BAJISTA);
}

// ─────────────────────────────────────────────────────────────────────
console.log("4. Un nivel roto no se vuelve a romper");
{
  // Vuelve por debajo de 110 y lo cruza otra vez: sigue siendo un solo BOS.
  const r = conCola([v(7, 115, 116, 100, 104), v(8, 104, 120, 103, 119)]);
  const alcistas = r.estructura.filter((x) => x.sesgo === ALCISTA);
  ok("el mismo pivote da UN solo evento, no uno por cada cruce",
    alcistas.length === 1, JSON.stringify(alcistas.map((x) => x.indice)));
}

// ─────────────────────────────────────────────────────────────────────
console.log("5. De dónde sale el bloque de órdenes");
{
  const r = calcularSMC(BASE, chico());
  const b = r.bloques.find((x) => x.sesgo === ALCISTA);
  ok("se creó un bloque de demanda", !!b, JSON.stringify(r.bloques));
  ok("ANCLADO EN LA VELA MÁS BAJA entre el pivote y la ruptura",
    b?.indice === 4, String(b?.indice));
  ok("con el alto y el bajo de esa vela", b?.alto === 101 && b?.bajo === 88,
    `${b?.alto}/${b?.bajo}`);
  ok("y nace sin mitigar", b?.mitigadoEn === null);
  ok("PERO SE SUPO EN LA VELA DEL BOS, no en la del bloque",
    b?.creadoEn === 6 && b?.indice === 4, `creado@${b?.creadoEn} anclado@${b?.indice}`);

  // El tramo mirado es [pivote, ruptura): la vela del cruce no cuenta.
  ok("la vela del cruce no puede ser el bloque", b?.indice !== 6);
}

// ─────────────────────────────────────────────────────────────────────
console.log("6. Cuándo muere un bloque");
{
  // Una vela que PERFORA el bloque con la mecha pero cierra arriba.
  const mecha = [v(7, 115, 116, 80, 112)];
  const bm = conCola(mecha, { mitigacionBloques: "maxmin" })
    .bloques.find((x) => x.sesgo === ALCISTA);
  const bc = conCola(mecha, { mitigacionBloques: "cierre" })
    .bloques.find((x) => x.sesgo === ALCISTA);
  ok("con «máximo/mínimo», la mecha lo mata", bm?.mitigadoEn === 7, String(bm?.mitigadoEn));
  ok("CON «CIERRE», LA MECHA NO ALCANZA", bc?.mitigadoEn === null, String(bc?.mitigadoEn));
  ok("y el mitigado guarda la hora de esa vela",
    bm?.mitigadoTime === BASE[0].time + 7 * DIA, String(bm?.mitigadoTime));
}

// ─────────────────────────────────────────────────────────────────────
console.log("7. La vela de volatilidad alta invierte sus extremos");
{
  // La vela 4 se desploma a 20 y vuelve: un barrido de liquidez. Su
  // rango es 82, más del doble del rango medio del tramo, así que el
  // original la marca como violenta y le da vuelta el alto y el bajo.
  // El efecto es justamente que el bloque NO se ancle a esa mecha.
  const violenta = [
    v(0, 100, 101, 80, 98),
    v(1, 98, 99, 95, 97),
    v(2, 97, 99, 96, 98),
    v(3, 98, 110, 97, 100),
    v(4, 100, 102, 20, 99),
    v(5, 99, 100, 97, 99),
    v(6, 99, 116, 98, 115),
  ];
  const conRango = calcularSMC(violenta, chico({ filtroBloques: "rango" }))
    .bloques.find((x) => x.sesgo === ALCISTA);
  const conAtr = calcularSMC(violenta, chico({ filtroBloques: "atr" }))
    .bloques.find((x) => x.sesgo === ALCISTA);

  ok("sin volatilidad medida, el bloque se ancla a la mecha de pánico",
    conAtr?.indice === 4 && conAtr?.bajo === 20,
    `@${conAtr?.indice} ${conAtr?.bajo}-${conAtr?.alto}`);
  ok("CON EL FILTRO PUESTO, LA MECHA QUEDA DESCARTADA y el bloque es otro",
    conRango?.indice === 3, `@${conRango?.indice}`);
  ok("y toma el mínimo real del tramo",
    conRango?.bajo === 97 && conRango?.alto === 110,
    `${conRango?.bajo}-${conRango?.alto}`);
  ok("los dos filtros no pueden dar lo mismo, o la prueba no prueba nada",
    conAtr?.indice !== conRango?.indice);
}

// ─────────────────────────────────────────────────────────────────────
console.log("8. Máximos y mínimos iguales");
{
  const velas = serieLarga(700, 11);
  const flojo = calcularSMC(velas, { ...CONFIG_SMC, umbralIguales: 0.5 });
  const duro = calcularSMC(velas, { ...CONFIG_SMC, umbralIguales: 0.001 });
  ok("con un umbral ancho aparecen pares", flojo.iguales.length > 0,
    String(flojo.iguales.length));
  ok("CON UN UMBRAL ESTRECHO APARECEN MENOS",
    duro.iguales.length < flojo.iguales.length,
    `${duro.iguales.length} vs ${flojo.iguales.length}`);
  ok("los dos niveles de un par están cerca",
    flojo.iguales.every((p) => Math.abs(p.nivelA - p.nivelB) < 2000));
  ok("y el par va del pivote viejo al nuevo",
    flojo.iguales.every((p) => p.desdeIndice < p.indice));

  const corta = calcularSMC(velas.slice(0, 150), CONFIG_SMC);
  ok("SIN 200 VELAS NO HAY ATR, y entonces no se marca ningún par",
    corta.iguales.length === 0, String(corta.iguales.length));
}

// ─────────────────────────────────────────────────────────────────────
console.log("9. Brechas de valor justo");
{
  // Hueco alcista: el mínimo de la 2 queda por encima del máximo de la 0.
  const velas = [
    v(0, 100, 102, 98, 101),
    v(1, 101, 130, 100, 128),   // impulso
    v(2, 128, 135, 110, 132),   // low 110 > high 102
    v(3, 132, 134, 128, 130),
  ];
  const r = calcularSMC(velas, chico({ umbralFvgAuto: false }));
  const g = r.fvg.find((x) => x.sesgo === ALCISTA);
  ok("se detecta la brecha alcista", !!g, JSON.stringify(r.fvg));
  ok("entre el máximo de hace dos velas y el mínimo de ahora",
    g?.alto === 110 && g?.bajo === 102, `${g?.alto}/${g?.bajo}`);
  ok("y nace abierta", g?.rellenadaEn === null);

  const rellena = [...velas, v(4, 130, 131, 95, 100)];
  const r2 = calcularSMC(rellena, chico({ umbralFvgAuto: false }));
  ok("VOLVER A ENTRAR EN LA BRECHA LA CIERRA",
    r2.fvg.find((x) => x.sesgo === ALCISTA)?.rellenadaEn === 4,
    String(r2.fvg.find((x) => x.sesgo === ALCISTA)?.rellenadaEn));

  const conUmbral = calcularSMC(velas, chico({ umbralFvgAuto: true }));
  ok("el umbral automático filtra brechas", conUmbral.fvg.length <= r.fvg.length,
    `${conUmbral.fvg.length} vs ${r.fvg.length}`);
}

// ─────────────────────────────────────────────────────────────────────
console.log("10. Las señales: cuándo entran y cuándo no");
{
  // Vela 7: baja a tocar los 110 rotos, cierra arriba y en verde.
  const retest = [v(7, 112, 118, 108, 117)];
  const r = conCola(retest);
  const s0 = r.senales[0];
  ok("hay una señal", !!s0, JSON.stringify(r.senales));
  ok("LA ENTRADA NO CAE EN LA VELA DEL BOS", s0 && s0.indice > s0.bosIndice,
    `bos@${s0?.bosIndice} entrada@${s0?.indice}`);
  ok("entra al cierre de la vela del retesteo", s0?.entrada === 117, String(s0?.entrada));
  ok("el stop va por debajo del mínimo invalidante, con su margen",
    s0?.stop === 85, String(s0?.stop));
  ok("el objetivo sale de la relación pedida (2R)", s0?.objetivo === 181,
    String(s0?.objetivo));
  ok("y el nivel retesteado es el que rompió el BOS", s0?.nivel === 110);

  // Una vela que toca el nivel pero cierra POR DEBAJO no sirve.
  ok("cerrar bajo el nivel no es retesteo",
    conCola([v(7, 112, 118, 108, 109)]).senales.length === 0);
  // Ni una roja que cierre arriba.
  ok("una vela roja tampoco, aunque cierre arriba",
    conCola([v(7, 118, 118, 108, 117)]).senales.length === 0);

  ok("PIDIENDO UNA RELACIÓN IMPOSIBLE NO ENTRA NINGUNA",
    conCola(retest, { senales: { relacionMinima: 99 } }).senales.length === 0);
  ok("pero el BOS igual quedó esperando",
    conCola(retest, { senales: { relacionMinima: 99 } }).esperas.length === 1);

  ok("con la espera vencida tampoco entra",
    conCola([v(7, 112, 113, 111, 112), v(8, 112, 118, 108, 117)],
      { senales: { expiracion: 1 } }).senales.length === 0);
  ok("y con la espera viva, la misma serie sí entra",
    conCola([v(7, 112, 113, 111, 112), v(8, 112, 118, 108, 117)],
      { senales: { expiracion: 5 } }).senales.length === 1);

  ok("apagadas, no hay señales ni esperas",
    conCola(retest, { senales: { activas: false } }).senales.length === 0 &&
      conCola(retest, { senales: { activas: false } }).esperas.length === 0);
}

// ─────────────────────────────────────────────────────────────────────
console.log("11. Cómo termina una señal");
{
  const entrada = v(7, 112, 118, 108, 117);   // entra en 117, stop 85, objetivo 181

  ok("la señal arranca sin salida", conCola([entrada]).senales[0]?.salida === null);

  const alStop = conCola([entrada, v(8, 117, 118, 80, 84)]).senales[0];
  ok("TOCAR EL STOP LA CIERRA", alStop?.salida?.motivo === "stop",
    JSON.stringify(alStop?.salida));
  ok("y se cierra al precio del stop, no al de la vela",
    alStop?.salida?.precio === 85, String(alStop?.salida?.precio));

  const alObjetivo = conCola([entrada, v(8, 117, 200, 116, 199)]).senales[0];
  ok("tocar el objetivo también", alObjetivo?.salida?.motivo === "objetivo");
  ok("y al precio del objetivo", alObjetivo?.salida?.precio === 181);

  const ambas = conCola([entrada, v(8, 117, 200, 80, 150)]).senales[0];
  ok("SI UNA VELA TOCA LAS DOS, SE DICE «AMBIGUO» en vez de inventar",
    ambas?.salida?.motivo === "ambiguo", JSON.stringify(ambas?.salida));
  ok("y en la duda se cobra el stop, que es lo prudente",
    ambas?.salida?.precio === 85, String(ambas?.salida?.precio));

  // La vela de la entrada no puede resolverla: ya se usó para decidir.
  const mismaVela = conCola([v(7, 112, 300, 50, 117)]).senales[0];
  ok("LA VELA DE ENTRADA NO RESUELVE LA OPERACIÓN",
    mismaVela && mismaVela.salida === null, JSON.stringify(mismaVela?.salida));
}

// ─────────────────────────────────────────────────────────────────────
console.log("12. Una sola operación a la vez");
{
  const velas = serieLarga(700, 23);
  const r = calcularSMC(velas, CONFIG_SMC);
  ok("hubo señales que medir", r.senales.length >= 2, String(r.senales.length));
  let solapadas = 0;
  for (let i = 1; i < r.senales.length; i++) {
    const previa = r.senales[i - 1];
    const fin = previa.salida?.indice ?? Infinity;
    if (r.senales[i].indice <= fin && previa.salida !== null) {
      // Entrar en la misma vela en que cerró la anterior está permitido
      // solo si no cerró en esa vela: el original no rearma ahí.
      if (r.senales[i].indice <= previa.salida.indice) solapadas++;
    }
    if (previa.salida === null && r.senales[i]) solapadas++;
  }
  ok("NUNCA HAY DOS OPERACIONES ABIERTAS A LA VEZ", solapadas === 0,
    String(solapadas));
  ok("toda señal cerrada tiene stop y objetivo de distinto lado",
    r.senales.every((s) =>
      s.sesgo === ALCISTA
        ? s.stop < s.entrada && s.objetivo > s.entrada
        : s.stop > s.entrada && s.objetivo < s.entrada));
  ok("y ninguna acepta menos que la relación mínima",
    r.senales.every((s) => s.relacion >= CONFIG_SMC.senales.relacionMinima));
}

// ─────────────────────────────────────────────────────────────────────
console.log("13. Extremos y zonas");
{
  const velas = serieLarga(400, 31);
  const r = calcularSMC(velas, CONFIG_SMC);
  const e = r.extremos;
  ok("hay extremos", !!e);
  ok("el máximo está por encima del mínimo", e.top > e.bottom, `${e.top}/${e.bottom}`);
  ok("uno de los dos es fuerte, no los dos",
    e.topFuerte !== e.bottomFuerte || (!e.topFuerte && !e.bottomFuerte),
    `${e.topFuerte}/${e.bottomFuerte}`);

  const z = zonasDe(e);
  ok("la zona premium está arriba", z.premium.bajo > z.equilibrio.alto);
  ok("la de descuento, abajo", z.descuento.alto < z.equilibrio.bajo);
  ok("y el equilibrio es el medio", Math.abs(z.medio - (e.top + e.bottom) / 2) < 1e-9);
}

// ─────────────────────────────────────────────────────────────────────
console.log("14. Niveles del período anterior");
{
  const H = 3600;
  const t = (d, h) => Math.floor(Date.UTC(2024, 0, 1 + d, h) / 1000);
  const hora = (d, h, o, hi, lo, c) => ({
    time: t(d, h), open: o, high: hi, low: lo, close: c, volume: 1,
  });
  void H;
  const velas = [
    hora(0, 0, 10, 20, 5, 15),
    hora(0, 12, 15, 30, 12, 25),   // día 0: alto 30, bajo 5
    hora(1, 0, 25, 40, 20, 35),
    hora(1, 12, 35, 36, 22, 30),   // día 1: alto 40, bajo 20
  ];
  const d = nivelAnterior(velas, "D");
  ok("el nivel diario es el del día ANTERIOR, no el de hoy",
    d?.alto === 30 && d?.bajo === 5, JSON.stringify(d));
  ok("y recuerda en qué vela se hizo cada extremo",
    d?.altoTime === t(0, 12) && d?.bajoTime === t(0, 0), JSON.stringify(d));

  const soloHoy = nivelAnterior(velas.slice(2), "D");
  ok("SIN UN PERÍODO ANTERIOR COMPLETO devuelve null, no el de ahora",
    soloHoy === null, JSON.stringify(soloHoy));

  ok("el lunes y el domingo de la misma semana ISO comparten clave",
    clavePeriodo(Math.floor(Date.UTC(2024, 0, 1) / 1000), "W") ===
      clavePeriodo(Math.floor(Date.UTC(2024, 0, 7) / 1000), "W"));
  ok("y el lunes siguiente no",
    clavePeriodo(Math.floor(Date.UTC(2024, 0, 7) / 1000), "W") !==
      clavePeriodo(Math.floor(Date.UTC(2024, 0, 8) / 1000), "W"));
}

// ─────────────────────────────────────────────────────────────────────
console.log("15. Casos de borde");
{
  ok("sin velas no revienta", calcularSMC([], CONFIG_SMC).estructura.length === 0);
  ok("con una vela tampoco", calcularSMC([plana(0, 100)], CONFIG_SMC).senales.length === 0);
  const r = calcularSMC(serieLarga(40), CONFIG_SMC);
  ok("con menos velas que el largo del swing no hay pivotes de swing",
    r.estructura.every((x) => x.interna), JSON.stringify(r.estructura.slice(0, 3)));
}

console.log(fallos === 0 ? "\n✓ SMC: el motor responde bien" : `\n✗ ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
