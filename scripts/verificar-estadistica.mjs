/**
 * Las cuentas de la corrida y sus márgenes de error.
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs \
 *     scripts/verificar-estadistica.mjs
 *
 * Lo que se cuida: que el margen de error NO se subestime. Un backtest
 * de pocas operaciones que se presenta sin intervalo, o con un intervalo
 * demasiado angosto, lleva a conclusiones inventadas. Acá se comprueba
 * contra valores de tabla.
 */
import {
  operacionesNecesarias,
  resumir,
  seSolapan,
  tDe,
  wilson,
} from "../src/lib/estrategia/estadistica.ts";

let bien = 0;
const malos = [];
const comprobar = (n, c, d = "") => {
  if (c) bien++;
  else {
    malos.push(n);
    console.log(`  MAL ${n}${d ? ` — ${d}` : ""}`);
  }
};
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

console.log("t de Student");
{
  // Contra la tabla de toda la vida.
  comprobar("t(1) = 12,71", cerca(tDe(1), 12.71));
  comprobar("t(9) = 2,262", cerca(tDe(9), 2.262));
  comprobar("t(30) = 2,042", cerca(tDe(30), 2.042));
  comprobar("con muchos grados tiende a 1,96", cerca(tDe(1000), 1.96));
  comprobar("nunca baja de 1,96", [1, 2, 5, 9, 19, 50, 500].every((g) => tDe(g) >= 1.96));
  comprobar("y nunca sube al bajar los grados", tDe(5) > tDe(20));
  // ESTE es el punto: con 10 operaciones el margen correcto es un 15 %
  // más ancho que el que sale de usar 1,96 a lo bruto.
  comprobar("con 10 operaciones el margen es 15 % más ancho que con 1,96",
    cerca(tDe(9) / 1.96, 1.154, 0.01), String(tDe(9) / 1.96));
}

console.log("Intervalo de Wilson");
{
  // Valores conocidos.
  const [a, b] = wilson(5, 10);
  comprobar("50 % de 10 queda entre 24 % y 76 %", cerca(a, 0.2366, 0.005) && cerca(b, 0.7634, 0.005),
    `${(a * 100).toFixed(1)}% a ${(b * 100).toFixed(1)}%`);
  comprobar("el intervalo se angosta con más datos",
    wilson(50, 100)[1] - wilson(50, 100)[0] < b - a);

  // Lo que hace falta de Wilson y no da Wald: nunca sale del rango.
  for (const [e, n] of [[0, 5], [5, 5], [1, 3], [0, 1], [1, 1], [0, 100]]) {
    const [lo, hi] = wilson(e, n);
    comprobar(`${e}/${n} se queda dentro de [0,1]`, lo >= 0 && hi <= 1 && lo <= hi,
      `${lo.toFixed(3)} a ${hi.toFixed(3)}`);
  }
  // Wald daría negativo acá; Wilson no.
  comprobar("0 de 5 no da un intervalo negativo", wilson(0, 5)[0] === 0);
  comprobar("pero tampoco afirma que sea 0 %", wilson(0, 5)[1] > 0.3,
    String(wilson(0, 5)[1]));
  comprobar("sin datos devuelve cero sin romperse", JSON.stringify(wilson(0, 0)) === "[0,0]");
}

console.log("Resumen de una corrida");
{
  // Caso a mano: 3 ganadas de 2R y 2 perdidas de 1R.
  const r = resumir([2, 2, 2, -1, -1]);
  comprobar("cuenta las operaciones", r.n === 5);
  comprobar("60 % de aciertos", cerca(r.aciertos, 0.6));
  comprobar("4R en total", cerca(r.erresTotal, 4));
  comprobar("0,8R por operación", cerca(r.esperanza, 0.8));
  comprobar("factor 3 (6 ganado sobre 2 perdido)", cerca(r.factor, 3));
  comprobar("caída máxima de 2R (las dos perdidas al final)", cerca(r.caidaMaxima, 2));

  // La caída se mide desde el pico, no desde el principio.
  const conBajon = resumir([1, 1, 1, -1, -1, -1, 2]);
  comprobar("la caída se mide desde el pico", cerca(conBajon.caidaMaxima, 3),
    String(conBajon.caidaMaxima));

  const vacio = resumir([]);
  comprobar("sin operaciones no rompe", vacio.n === 0 && vacio.esperanza === 0);
  comprobar("y no se declara concluyente", !vacio.concluyente);
  const una = resumir([3]);
  comprobar("con una sola operación el margen es infinito",
    una.esperanzaIC[1] === Infinity);
  comprobar("y nunca es concluyente", !una.concluyente);
}

console.log("Lo que importa: cuándo se puede concluir algo");
{
  // Veinte operaciones con una esperanza chica y mucha dispersión: es
  // justo el caso de esta estrategia en seis meses. NO alcanza.
  const pocas = resumir([5, -1, -1, -1, 5, -1, -1, -1, -1, 5, -1, -1, -1, 5, -1, -1, -1, -1, -1, 5]);
  comprobar("veinte operaciones con 5R y 1R dan esperanza positiva",
    pocas.esperanza > 0, String(pocas.esperanza.toFixed(2)));
  comprobar("pero el intervalo CRUZA el cero: no alcanza para afirmar nada",
    pocas.esperanzaIC[0] < 0,
    `${pocas.esperanzaIC[0].toFixed(2)} a ${pocas.esperanzaIC[1].toFixed(2)}`);
  comprobar("y se marca como NO concluyente", !pocas.concluyente);

  // La misma proporción con CIEN operaciones TAMPOCO alcanza, y esto es
  // lo más instructivo de todo: con ganadoras de 5R y perdedoras de 1R
  // la dispersión es enorme, así que hacen falta más de cien operaciones
  // para separar la esperanza del cero. En seis meses no se llega.
  const cien = [];
  for (let i = 0; i < 5; i++) {
    cien.push(5, -1, -1, -1, 5, -1, -1, -1, -1, 5, -1, -1, -1, 5, -1, -1, -1, -1, -1, 5);
  }
  const conCien = resumir(cien);
  comprobar("con cien operaciones la esperanza es la misma",
    cerca(conCien.esperanza, pocas.esperanza, 0.001));
  comprobar("y CIEN TAMPOCO alcanzan: el intervalo sigue tocando el cero",
    conCien.esperanzaIC[0] <= 0,
    `${conCien.esperanzaIC[0].toFixed(2)} a ${conCien.esperanzaIC[1].toFixed(2)}`);

  // Con el triple sí.
  const muchas = [];
  for (let i = 0; i < 18; i++) {
    muchas.push(5, -1, -1, -1, 5, -1, -1, -1, -1, 5, -1, -1, -1, 5, -1, -1, -1, -1, -1, 5);
  }
  const conDatos = resumir(muchas);
  comprobar("con 360 operaciones el intervalo ya NO cruza el cero",
    conDatos.esperanzaIC[0] > 0,
    `${conDatos.esperanzaIC[0].toFixed(2)} a ${conDatos.esperanzaIC[1].toFixed(2)}`);
  comprobar("y ahí sí es concluyente", conDatos.concluyente);

  // Una esperanza negativa nunca es "concluyente a favor".
  comprobar("perder no se declara concluyente", !resumir([-1, -1, -1, -1, -1, -1, -1]).concluyente);

  // Cuántas harían falta.
  const faltan = operacionesNecesarias(pocas);
  comprobar("dice cuántas operaciones harían falta", faltan !== null && faltan > pocas.n,
    `${faltan} vs las ${pocas.n} que hay`);
  comprobar("y el número que da es coherente con lo que se ve",
    faltan > 100 && faltan < 200, String(faltan));
  comprobar("si ya alcanza, no pide más",
    operacionesNecesarias(conDatos) <= conDatos.n,
    `${operacionesNecesarias(conDatos)} vs ${conDatos.n}`);
  comprobar("con esperanza negativa no responde", operacionesNecesarias(resumir([-1, -1, -2])) === null);
}

console.log("Comparar dos activos");
{
  // ESTO es lo que hay que entender antes de rankear activos: con diez
  // operaciones cada uno, un activo que da 0,00R y otro que da 1,40R
  // TODAVÍA se solapan. La diferencia parece enorme y no se puede
  // afirmar. Por eso la tabla lleva el intervalo al lado.
  const flojo = resumir([1, -1, 1, -1, 1, -1, 1, -1, -1, 1]);
  const bueno = resumir([2, 2, 2, 2, -1, 2, 2, -1, 2, 2]);
  comprobar("con 10 operaciones, 0,00R y 1,40R TODAVÍA se solapan",
    seSolapan(flojo, bueno),
    `${flojo.esperanza.toFixed(2)} vs ${bueno.esperanza.toFixed(2)}`);

  // Con suficientes datos sí se separan.
  const flojoLargo = resumir(Array.from({ length: 120 }, (_, i) => (i % 2 ? 1 : -1)));
  const buenoLargo = resumir(Array.from({ length: 120 }, (_, i) => (i % 5 === 4 ? -1 : 2)));
  comprobar("con 120 operaciones cada uno, ya se separan",
    !seSolapan(flojoLargo, buenoLargo),
    `${flojoLargo.esperanza.toFixed(2)} vs ${buenoLargo.esperanza.toFixed(2)}`);

  // Dos activos parecidos: la diferencia es ruido y hay que decirlo.
  const a = resumir([2, -1, -1, 3, -1, -1, 2, -1]);
  const b = resumir([3, -1, -1, 2, -1, -1, -1, 2]);
  comprobar("dos parecidos SÍ se solapan: la diferencia es ruido", seSolapan(a, b),
    `${a.esperanza.toFixed(2)} vs ${b.esperanza.toFixed(2)}`);
  comprobar("con muy pocos datos siempre se solapan", seSolapan(resumir([5]), resumir([-1])));
  comprobar("la comparación es simétrica", seSolapan(a, b) === seSolapan(b, a));
}

console.log(`\n${bien} bien, ${malos.length} mal`);
process.exit(malos.length === 0 ? 0 : 1);
