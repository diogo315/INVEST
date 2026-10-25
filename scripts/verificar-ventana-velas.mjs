/**
 * La ventana de velas que se le pide al proveedor.
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs \
 *     scripts/verificar-ventana-velas.mjs
 *
 * Lo que se cuida: que la ventana SIEMPRE cubra el reloj del backtest.
 * Si no lo cubre, el panel se dibuja vacío sin decir por qué, que es
 * exactamente el error que esto viene a arreglar.
 */
import {
  coberturaDeVentana,
  ventanaDeVelas,
} from "../src/lib/backtest/ventana.ts";

let bien = 0;
const malos = [];
const ck = (n, c, d = "") => {
  if (c) bien++; else malos.push(`${n}${d ? ` — ${d}` : ""}`);
  console.log(`  ${c ? "ok " : "MAL"} ${n}${!c && d ? ` — ${d}` : ""}`);
};

const DIA = 86400;
const M15 = 900;
const D1 = DIA;
const TOPE = 10000;
const AHORA = Math.floor(Date.UTC(2026, 9, 25) / 1000);

console.log("Cuando todo el rango entra, se pide como siempre");
{
  // Diario, un año de historia y dos de backtest: ~1.100 velas.
  const arranque = AHORA - 1100 * DIA;
  const v = ventanaDeVelas(D1, arranque, AHORA - 100 * DIA, TOPE, AHORA);
  ck("no es deslizante", !v.deslizante);
  ck("se pide hasta ahora", v.hastaMs === undefined);
  ck("la clave es estable", v.clave === "completa");
  ck("pide todas las necesarias", v.limite > 1100 && v.limite <= TOPE, String(v.limite));
  // Y la clave NO cambia al mover el reloj: una sola petición para todo.
  const w = ventanaDeVelas(D1, arranque, AHORA - 5 * DIA, TOPE, AHORA);
  ck("mover el reloj no provoca otra petición", v.clave === w.clave);
}

console.log("EL CASO DE DIEGO: 15m, backtest desde enero, hoy es octubre");
{
  const desde = Math.floor(Date.UTC(2026, 0, 1) / 1000);
  const arranque = desde - 365 * DIA;
  const v = ventanaDeVelas(M15, arranque, desde, TOPE, AHORA);
  ck("detecta que no entra y desliza", v.deslizante);
  ck("la ventana NO termina en ahora", v.hastaMs !== undefined);
  const fin = v.hastaMs / 1000;
  const ini = fin - TOPE * M15;
  ck("el reloj queda DENTRO de la ventana", ini <= desde && desde <= fin,
    `ventana ${new Date(ini * 1000).toISOString().slice(0, 10)} → ${new Date(fin * 1000).toISOString().slice(0, 10)}, reloj ${new Date(desde * 1000).toISOString().slice(0, 10)}`);
  ck("y queda con margen hacia atrás para los indicadores",
    desde - ini > 300 * M15,
    `${Math.round((desde - ini) / M15)} velas antes del reloj`);
  ck("y con margen hacia adelante para que el play avance",
    fin - desde > 300 * M15,
    `${Math.round((fin - desde) / M15)} velas después`);
}

console.log("El reloj SIEMPRE cae dentro de la ventana, en todo el recorrido");
{
  const desde = Math.floor(Date.UTC(2026, 0, 1) / 1000);
  const arranque = desde - 365 * DIA;
  let fuera = 0;
  let peorMargen = Infinity;
  // Se recorre el backtest entero, día a día, como haría el reproductor.
  for (let t = desde; t <= AHORA; t += DIA) {
    const v = ventanaDeVelas(M15, arranque, t, TOPE, AHORA);
    const fin = (v.hastaMs ?? AHORA * 1000) / 1000;
    const ini = fin - v.limite * M15;
    if (t < ini || t > fin) fuera++;
    peorMargen = Math.min(peorMargen, (t - ini) / M15);
  }
  ck("ni un solo día queda fuera de su ventana", fuera === 0, `${fuera} días fuera`);
  // El límite se fija en el que GARANTIZA el diseño (un cuarto del tope),
  // no en un número cómodo: así una regresión que achique el margen se
  // cae acá en vez de aparecer como un indicador plano en pantalla.
  ck(`y siempre hay al menos ${TOPE / 4} velas de historia antes del reloj`,
    peorMargen >= TOPE / 4, `peor margen: ${Math.round(peorMargen)} velas`);
}

console.log("No se pide una ventana nueva en cada vela");
{
  const desde = Math.floor(Date.UTC(2026, 0, 1) / 1000);
  const arranque = desde - 365 * DIA;
  const claves = new Set();
  let pasos = 0;
  for (let t = desde; t <= AHORA; t += M15) {
    claves.add(ventanaDeVelas(M15, arranque, t, TOPE, AHORA).clave);
    pasos++;
  }
  ck(`${pasos} velas de recorrido provocan pocas peticiones`,
    claves.size <= 8, `${claves.size} ventanas distintas`);
  ck("y son más de una (si no, no estaría deslizando)", claves.size > 1,
    String(claves.size));
}

console.log("No se pide el futuro");
{
  const arranque = AHORA - 700 * DIA;
  const v = ventanaDeVelas(M15, arranque, AHORA, TOPE, AHORA);
  ck("con el reloj en el presente, la ventana termina ahora",
    (v.hastaMs ?? 0) / 1000 <= AHORA, String(v.hastaMs / 1000 - AHORA));
}

console.log("Retroceder vuelve a la misma ventana que ya se había pedido");
{
  const desde = Math.floor(Date.UTC(2026, 0, 1) / 1000);
  const arranque = desde - 365 * DIA;
  const a = ventanaDeVelas(M15, arranque, desde, TOPE, AHORA);
  const b = ventanaDeVelas(M15, arranque, desde + 200 * DIA, TOPE, AHORA);
  const c = ventanaDeVelas(M15, arranque, desde, TOPE, AHORA);
  ck("avanzar mucho cambia de ventana", a.clave !== b.clave);
  ck("volver atrás da la MISMA clave que antes", a.clave === c.clave);
  ck("y el mismo fin", a.hastaMs === c.hastaMs);
}

console.log("La cobertura que se puede anunciar");
{
  ck("en 15m, unos 104 días",
    Math.round(coberturaDeVentana(M15, TOPE) / DIA) === 104,
    String(Math.round(coberturaDeVentana(M15, TOPE) / DIA)));
  ck("en 5m, unos 34 días",
    Math.round(coberturaDeVentana(300, TOPE) / DIA) === 35,
    String(Math.round(coberturaDeVentana(300, TOPE) / DIA)));
}

console.log(`\n${malos.length === 0 ? `TODO BIEN (${bien})` : `FALLARON ${malos.length}:\n - ${malos.join("\n - ")}`}`);
process.exit(malos.length === 0 ? 0 : 1);
