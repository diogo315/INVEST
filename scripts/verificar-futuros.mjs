/**
 * Futuros con apalancamiento, comisiones y financiamiento.
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs \
 *     scripts/verificar-futuros.mjs
 *
 * Lo que se cuida, que es lo que hace que un número de pantalla signifique
 * algo:
 *
 * 1. Que el apalancamiento inmovilice menos capital SIN inventar
 *    ganancia: la misma posición gana lo mismo apalancada o no.
 * 2. Que la liquidación se mida con máximo y mínimo, no con el cierre.
 * 3. Que la comisión se cobre sobre el NOCIONAL —no sobre el margen— y
 *    en los dos lados, cada uno a su precio.
 * 4. Que el financiamiento se cuente por períodos completos.
 */
import {
  APALANCAMIENTOS,
  FUTUROS_POR_DEFECTO,
  PERIODO_FINANCIAMIENTO,
  comisionDe,
  comisionVuelta,
  costosDe,
  financiamientoPagado,
  margenDeMovimiento,
  margenRequerido,
  nocionalMaximo,
  nocionalPorDefecto,
  precioLiquidacion,
  sanearFuturos,
  tocaLiquidacion,
} from "../src/lib/backtest/futuros.ts";

let bien = 0;
const malos = [];
const ck = (n, c, d = "") => {
  if (c) bien++; else malos.push(`${n}${d ? ` — ${d}` : ""}`);
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` — ${d}` : ""}`);
};
const cfg = (p = {}) => ({ ...FUTUROS_POR_DEFECTO, ...p });
const casi = (a, b, e = 1e-9) => Math.abs(a - b) < e;

console.log("El margen: cuánto capital inmoviliza una posición");
{
  ck("sin apalancar, el margen es todo el nocional", margenRequerido(5000, 1) === 5000);
  ck("a 5x, la quinta parte", margenRequerido(5000, 5) === 1000);
  ck("a 20x, la vigésima", margenRequerido(5000, 20) === 250);
  ck("un corto inmoviliza igual que un largo", margenRequerido(-5000, 5) === 1000);
  ck("un apalancamiento inválido se trata como 1x", margenRequerido(5000, 0) === 5000);
  ck("y uno negativo también", margenRequerido(5000, -3) === 5000);
}

console.log("EL APALANCAMIENTO NO INVENTA GANANCIA");
{
  // La misma posición: 0,1 BTC comprado a 50.000, vendido a 55.000.
  const u = 0.1, ent = 50000, sal = 55000;
  const bruto = (sal - ent) * u;      // 500 dólares, apalancado o no
  ck("el resultado bruto no depende del apalancamiento", bruto === 500);
  const c1 = costosDe("compra", ent, sal, u, 3600, cfg({ apalancamiento: 1 }));
  const c20 = costosDe("compra", ent, sal, u, 3600, cfg({ apalancamiento: 20 }));
  ck("y los costos TAMPOCO (se pagan sobre el nocional)",
    casi(c1.total, c20.total), `${c1.total} vs ${c20.total}`);
  ck("lo único que cambia es el margen: 5.000 contra 250",
    margenRequerido(ent * u, 1) === 5000 && margenRequerido(ent * u, 20) === 250);
  // Lo que SÍ multiplica: con el mismo capital entra 20 veces más nocional.
  const capital = 1000;
  const nocional1 = capital * 1, nocional20 = capital * 20;
  ck("con el mismo capital, a 20x entra 20 veces más nocional",
    nocional20 / nocional1 === 20);
}

console.log("El precio de liquidación");
{
  // A 10x se aguanta 1/10 − 0,5 % = 9,5 % en contra.
  const c = cfg({ apalancamiento: 10 });
  ck("un largo a 10x desde 100 liquida en 90,5",
    casi(precioLiquidacion("compra", 100, c), 90.5), String(precioLiquidacion("compra", 100, c)));
  ck("un corto a 10x desde 100 liquida en 109,5",
    casi(precioLiquidacion("venta", 100, c), 109.5), String(precioLiquidacion("venta", 100, c)));
  ck("a 2x el largo liquida en 50,5",
    casi(precioLiquidacion("compra", 100, cfg({ apalancamiento: 2 })), 50.5));
  // A 1x TAMBIÉN hay liquidación en futuros: el bróker cierra cuando el
  // patrimonio cae al mantenimiento. Son 99,5 % de caída, un número
  // extremo pero real. En SPOT no hay liquidación, pero eso lo decide
  // quien llama, no esta función.
  ck("a 1x el largo liquida a una caída del 99,5 %",
    casi(precioLiquidacion("compra", 100, cfg({ apalancamiento: 1 })), 0.5),
    String(precioLiquidacion("compra", 100, cfg({ apalancamiento: 1 }))));
  ck("pero un corto a 1x SÍ (no tiene techo)",
    casi(precioLiquidacion("venta", 100, cfg({ apalancamiento: 1 })), 199.5),
    String(precioLiquidacion("venta", 100, cfg({ apalancamiento: 1 }))));
  ck("precio de entrada inválido devuelve null",
    precioLiquidacion("compra", 0, c) === null);
  // Con apalancamiento tan alto que el mantenimiento se come el margen.
  ck("a 200x con 0,5 % de mantenimiento, liquida ya mismo",
    precioLiquidacion("compra", 100, cfg({ apalancamiento: 200 })) === 100);
}

console.log("LA LIQUIDACIÓN SE MIDE CON MÁXIMO Y MÍNIMO, NO CON EL CIERRE");
{
  const liq = 90.5;
  // Vela que bajó a tocar 90 y cerró en 105: en la realidad te liquidó.
  ck("una vela que fue a tocarlo y se recuperó SÍ liquida",
    tocaLiquidacion("compra", { high: 106, low: 90 }, liq));
  ck("una que no llegó, no", !tocaLiquidacion("compra", { high: 106, low: 91 }, liq));
  ck("tocar el precio exacto cuenta",
    tocaLiquidacion("compra", { high: 106, low: 90.5 }, liq));
  ck("el corto es simétrico (se mide con el máximo)",
    tocaLiquidacion("venta", { high: 110, low: 99 }, 109.5));
  ck("sin precio de liquidación nunca liquida",
    !tocaLiquidacion("compra", { high: 1e9, low: 0 }, null));
}

console.log("LA COMISIÓN SE PAGA SOBRE EL NOCIONAL, NO SOBRE EL MARGEN");
{
  const c = cfg({ comision: 0.04, apalancamiento: 10 });
  ck("0,04 % de 5.000 son 2 dólares", casi(comisionDe(5000, c), 2));
  ck("el apalancamiento NO la reduce",
    casi(comisionDe(5000, cfg({ comision: 0.04, apalancamiento: 1 })), 2));
  // La vuelta se cobra a cada precio, no dos veces al de entrada.
  const v = comisionVuelta(5000, 5500, c);
  ck("la vuelta cobra entrada Y salida, cada una a su precio",
    casi(v, 2 + 2.2), String(v));
  ck("y no es dos veces la de entrada", !casi(v, 4));
  ck("comisión cero no cobra nada", comisionDe(5000, cfg({ comision: 0 })) === 0);
}

console.log("El financiamiento, por períodos completos de 8 h");
{
  const c = cfg({ financiamiento: 0.01 });
  ck("menos de 8 h no paga nada",
    financiamientoPagado(10000, PERIODO_FINANCIAMIENTO - 1, "compra", c) === 0);
  ck("exactamente 8 h paga un período",
    casi(financiamientoPagado(10000, PERIODO_FINANCIAMIENTO, "compra", c), 1));
  ck("25 h pagan tres períodos (no 3,125)",
    casi(financiamientoPagado(10000, 25 * 3600, "compra", c), 3));
  ck("el corto COBRA en vez de pagar",
    casi(financiamientoPagado(10000, 24 * 3600, "venta", c), -3));
  ck("tres semanas se vuelven un costo serio",
    casi(financiamientoPagado(10000, 21 * 86400, "compra", c), 63),
    String(financiamientoPagado(10000, 21 * 86400, "compra", c)));
  ck("duración negativa no rompe", financiamientoPagado(10000, -5, "compra", c) === 0);
}

console.log("Los costos de una operación completa");
{
  const c = cfg({ comision: 0.04, financiamiento: 0.01 });
  // 0,2 BTC de 50.000 a 51.000, abierta 24 h.
  const r = costosDe("compra", 50000, 51000, 0.2, 24 * 3600, c);
  ck("comisión = 0,04 % de 10.000 + 0,04 % de 10.200",
    casi(r.comision, 4 + 4.08), String(r.comision));
  ck("financiamiento = 3 períodos sobre 10.000", casi(r.financiamiento, 3), String(r.financiamiento));
  ck("el total es la suma", casi(r.total, r.comision + r.financiamiento));
  const bruto = (51000 - 50000) * 0.2;
  ck("de 200 brutos quedan ~188,9 netos",
    casi(bruto - r.total, 200 - 11.08), String(bruto - r.total));
}

console.log("Cuánto se aguanta en contra, por apalancamiento");
{
  const esperado = { 1: 99.5, 2: 49.5, 5: 19.5, 10: 9.5, 20: 4.5, 25: 3.5, 50: 1.5, 100: 0.5 };
  for (const lev of APALANCAMIENTOS) {
    if (esperado[lev] === undefined) continue;
    ck(`a ${lev}x se aguanta ${esperado[lev]} %`,
      casi(margenDeMovimiento(cfg({ apalancamiento: lev })), esperado[lev], 1e-9),
      String(margenDeMovimiento(cfg({ apalancamiento: lev }))));
  }
}

console.log("EL ERROR DE DIEGO: una compra se llevaba todo el capital");
{
  const c = cfg({ apalancamiento: 10, comision: 0.04 });
  // Lo que se PROPONE no depende del apalancamiento: es el efectivo.
  ck("por defecto se propone el nocional del efectivo, no 10 veces más",
    casi(nocionalPorDefecto(5000, c), 5000, 1), String(nocionalPorDefecto(5000, c)));
  ck("a 1x propone lo mismo",
    casi(nocionalPorDefecto(5000, cfg({ apalancamiento: 1 })), 5000, 3),
    String(nocionalPorDefecto(5000, cfg({ apalancamiento: 1 }))));
  // Y con esa propuesta QUEDA capital libre para seguir operando.
  const margen = margenRequerido(nocionalPorDefecto(5000, c), 10);
  ck("tras abrirla quedan ~4.500 libres, no cero",
    casi(5000 - margen, 4500, 5), String(5000 - margen));

  // El máximo SÍ usa el apalancamiento, pero descontando la comisión.
  const max = nocionalMaximo(5000, c);
  ck("el máximo a 10x es casi 50.000", max > 48000 && max < 50000, String(max));
  ck("y SE PUEDE PAGAR de verdad (margen + comisión ≤ efectivo)",
    margenRequerido(max, 10) + comisionDe(max, c) <= 5000.01,
    String(margenRequerido(max, 10) + comisionDe(max, c)));
  ck("ignorar la comisión daría un máximo impagable",
    margenRequerido(5000 * 10, 10) + comisionDe(5000 * 10, c) > 5000);

  ck("sin efectivo, el máximo es cero", nocionalMaximo(0, c) === 0);
  ck("y lo propuesto también", nocionalPorDefecto(0, c) === 0);
  ck("efectivo negativo no rompe", nocionalMaximo(-100, c) === 0);
}

console.log("LO YA PAGADO contra lo que falta pagar");
{
  const c = cfg({ comision: 0.1, financiamiento: 0.01 });
  // 1 unidad de 1.000 a 1.100, 24 h abierta.
  const cerrada = costosDe("compra", 1000, 1100, 1, 24 * 3600, c, true);
  const abierta = costosDe("compra", 1000, 1100, 1, 24 * 3600, c, false);
  ck("el total es el mismo en los dos casos", casi(cerrada.total, abierta.total));
  ck("cerrada: ya se pagó TODO", casi(cerrada.pagado, cerrada.total));
  // Entrada 0,1 % de 1.000 = 1; salida 0,1 % de 1.100 = 1,1; financ. 3 x 0,1 = 0,3
  ck("abierta: solo la comisión de ENTRADA y el financiamiento",
    casi(abierta.pagado, 1 + 0.3), String(abierta.pagado));
  ck("o sea, falta por pagar la comisión de salida",
    casi(abierta.total - abierta.pagado, 1.1), String(abierta.total - abierta.pagado));
  ck("lo pagado nunca supera al total", abierta.pagado <= abierta.total);
}

console.log("Saneado");
{
  ck("lo bueno pasa",
    sanearFuturos({ apalancamiento: 10, comision: 0.04 }).apalancamiento === 10);
  ck("un apalancamiento absurdo cae a 1", sanearFuturos({ apalancamiento: 9999 }).apalancamiento === 1);
  ck("uno menor que 1 cae a 1", sanearFuturos({ apalancamiento: 0.5 }).apalancamiento === 1);
  ck("una comisión absurda cae al valor de fábrica",
    sanearFuturos({ comision: 50 }).comision === FUTUROS_POR_DEFECTO.comision);
  ck("basura da la configuración de fábrica",
    JSON.stringify(sanearFuturos(null)) === JSON.stringify(FUTUROS_POR_DEFECTO));
  ck("el financiamiento negativo SÍ vale (lo cobra el largo)",
    sanearFuturos({ financiamiento: -0.01 }).financiamiento === -0.01);
}

console.log(`\n${malos.length === 0 ? `TODO BIEN (${bien})` : `FALLARON ${malos.length} de ${bien + malos.length}:\n - ${malos.join("\n - ")}`}`);
process.exit(malos.length === 0 ? 0 : 1);
