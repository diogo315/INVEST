/**
 * Pruebas de la apariencia del gráfico.
 *   node --experimental-strip-types scripts/verificar-apariencia.mjs
 */
import {
  APARIENCIA_POR_DEFECTO,
  TEMAS,
  aplicarTema,
  colorVolumen,
  conAlfa,
  esColor,
  opcionesDeChart,
  opcionesDeVelas,
  sanearApariencia,
  tocaColores,
} from "../src/lib/chart/apariencia.ts";

let ok = 0;
let mal = 0;
function comprobar(nombre, condicion, detalle = "") {
  if (condicion) {
    ok++;
  } else {
    mal++;
    console.log(`  FALLA: ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

const D = APARIENCIA_POR_DEFECTO;

// ── temas ───────────────────────────────────────────────────────────
console.log("Temas");
comprobar("hay al menos 5 temas", TEMAS.length >= 5, `son ${TEMAS.length}`);
comprobar("los ids no se repiten", new Set(TEMAS.map((t) => t.id)).size === TEMAS.length);
comprobar("el primero es el de siempre", TEMAS[0].id === "negro" && TEMAS[0].colores.fondo === "#000000");
comprobar(
  "todos los colores de todos los temas son hex válidos",
  TEMAS.every((t) => Object.values(t.colores).every(esColor)),
);
comprobar(
  "el tema daltónico no usa verde contra rojo",
  TEMAS.find((t) => t.id === "daltonico").colores.subida === "#3b82f6",
);
comprobar(
  "el por defecto sale del primer tema",
  D.fondo === TEMAS[0].colores.fondo && D.tema === "negro",
);

// ── aplicarTema ─────────────────────────────────────────────────────
console.log("Aplicar tema");
{
  const retocada = { ...D, huecas: true, cuadriculaV: false, escalaLog: true };
  const claro = aplicarTema(retocada, "claro");
  comprobar("cambia el fondo", claro.fondo === "#ffffff");
  comprobar("cambia el verde", claro.subida === "#089981");
  comprobar("respeta los interruptores", claro.huecas === true && claro.cuadriculaV === false && claro.escalaLog === true);
  comprobar("deja marcado el tema", claro.tema === "claro");
  comprobar("un id inexistente no cambia nada", aplicarTema(D, "no-existe") === D);
}

// ── qué desmarca el preset ──────────────────────────────────────────
console.log("Qué desmarca el preset");
comprobar("cambiar el verde sí", tocaColores({ subida: "#fff" }));
comprobar("cambiar el fondo sí", tocaColores({ fondo: "#fff" }));
comprobar("cambiar la cuadrícula sí", tocaColores({ cuadricula: "#fff" }));
comprobar("apagar las mechas no", !tocaColores({ mechas: false }));
comprobar("apagar la cuadrícula no", !tocaColores({ cuadriculaV: false }));
comprobar("velas huecas no", !tocaColores({ huecas: true }));
comprobar("escala log no", !tocaColores({ escalaLog: true }));
comprobar("cambiar la cruz no", !tocaColores({ cruz: "iman" }));
comprobar("opacidad del volumen no", !tocaColores({ opacidadVolumen: 80 }));
comprobar("un parche vacío no", !tocaColores({}));
comprobar(
  "mezcla de color e interruptor sí",
  tocaColores({ mechas: false, subida: "#fff" }),
);

// ── esColor ─────────────────────────────────────────────────────────
console.log("esColor");
comprobar("acepta #rrggbb", esColor("#1e222d"));
comprobar("acepta #rgb", esColor("#abc"));
comprobar("acepta mayúsculas", esColor("#FF00AA"));
comprobar("rechaza sin almohadilla", !esColor("1e222d"));
comprobar("rechaza largo raro", !esColor("#12345"));
comprobar("rechaza rgb()", !esColor("rgb(1,2,3)"));
comprobar("rechaza lo que no es texto", !esColor(null) && !esColor(42));

// ── conAlfa ─────────────────────────────────────────────────────────
console.log("conAlfa");
comprobar("100 % deja opaco", conAlfa("#26a69a", 100) === "#26a69aff");
comprobar("0 % deja transparente", conAlfa("#26a69a", 0) === "#26a69a00");
comprobar("40 % da 66, como el código viejo", conAlfa("#26a69a", 40) === "#26a69a66");
comprobar("expande el hex de 3", conAlfa("#abc", 100) === "#aabbccff");
comprobar("recorta por encima de 100", conAlfa("#000000", 400) === "#000000ff");
comprobar("recorta por debajo de 0", conAlfa("#000000", -20) === "#00000000");
comprobar("devuelve tal cual lo que no es color", conAlfa("transparent", 50) === "transparent");

// ── opciones del chart ──────────────────────────────────────────────
console.log("Opciones del chart");
{
  const o = opcionesDeChart(D);
  comprobar("pasa el fondo", o.layout.background.color === D.fondo);
  comprobar("cuadrícula encendida por defecto", o.grid.vertLines.visible && o.grid.horzLines.visible);
  comprobar("cruz libre es modo 0", o.crosshair.mode === 0);
  comprobar("punteada es estilo 1", o.crosshair.vertLine.style === 1);
  comprobar("escala normal es modo 0", o.rightPriceScale.mode === 0);
}
{
  const o = opcionesDeChart({ ...D, cuadriculaV: false, cuadriculaH: false, cruz: "iman", estiloCruz: "solida", escalaLog: true });
  comprobar("apaga las verticales", o.grid.vertLines.visible === false);
  comprobar("apaga las horizontales", o.grid.horzLines.visible === false);
  comprobar("imán es modo 1", o.crosshair.mode === 1);
  comprobar("sólida es estilo 0", o.crosshair.horzLine.style === 0);
  comprobar("log es modo 1", o.rightPriceScale.mode === 1);
}
comprobar("cruz oculta es modo 2", opcionesDeChart({ ...D, cruz: "oculta" }).crosshair.mode === 2);

// ── opciones de las velas ───────────────────────────────────────────
console.log("Opciones de las velas");
{
  const v = opcionesDeVelas(D);
  comprobar("rellena las de subida", v.upColor === D.subida);
  comprobar("rellena las de bajada", v.downColor === D.bajada);
  comprobar("mechas encendidas", v.wickVisible === true);
  comprobar("línea de precio encendida", v.priceLineVisible === true);
}
{
  const v = opcionesDeVelas({ ...D, huecas: true, bordes: false });
  comprobar("hueca deja el relleno transparente", v.upColor === "rgba(0,0,0,0)");
  comprobar("hueca conserva el borde con color", v.borderUpColor === D.subida);
  comprobar("hueca enciende el borde aunque esté apagado", v.borderVisible === true);
  comprobar("hueca NO afecta a las de bajada", v.downColor === D.bajada);
}
comprobar("sin bordes ni huecas, borde apagado", opcionesDeVelas({ ...D, bordes: false }).borderVisible === false);
comprobar("sin mechas", opcionesDeVelas({ ...D, mechas: false }).wickVisible === false);

// ── volumen ─────────────────────────────────────────────────────────
console.log("Volumen");
comprobar("sube usa el verde", colorVolumen(D, true) === conAlfa(D.subida, D.opacidadVolumen));
comprobar("baja usa el rojo", colorVolumen(D, false) === conAlfa(D.bajada, D.opacidadVolumen));
comprobar("al 40 % reproduce el 66 de antes", colorVolumen(D, true) === "#26a69a66");

// ── saneo ───────────────────────────────────────────────────────────
console.log("Saneo de lo guardado");
comprobar("null da el por defecto", sanearApariencia(null).fondo === D.fondo);
comprobar("objeto vacío da el por defecto", sanearApariencia({}).subida === D.subida);
comprobar("color basura se reemplaza", sanearApariencia({ subida: "verde" }).subida === D.subida);
comprobar("color bueno se conserva", sanearApariencia({ subida: "#AABBCC" }).subida === "#aabbcc");
comprobar("booleano basura se reemplaza", sanearApariencia({ mechas: "si" }).mechas === D.mechas);
comprobar("booleano false se respeta", sanearApariencia({ mechas: false }).mechas === false);
comprobar("cruz inválida cae al por defecto", sanearApariencia({ cruz: "laser" }).cruz === D.cruz);
comprobar("cruz válida se conserva", sanearApariencia({ cruz: "iman" }).cruz === "iman");
comprobar("opacidad se recorta arriba", sanearApariencia({ opacidadVolumen: 500 }).opacidadVolumen === 100);
comprobar("opacidad se recorta abajo", sanearApariencia({ opacidadVolumen: 0 }).opacidadVolumen === 10);
comprobar("opacidad NaN cae al por defecto", sanearApariencia({ opacidadVolumen: NaN }).opacidadVolumen === D.opacidadVolumen);
comprobar(
  "lo saneado vuelve a salir igual si se sanea otra vez",
  JSON.stringify(sanearApariencia(sanearApariencia({ subida: "#ABC" }))) ===
    JSON.stringify(sanearApariencia({ subida: "#ABC" })),
);
comprobar(
  "el por defecto sobrevive una vuelta completa",
  JSON.stringify(sanearApariencia(JSON.parse(JSON.stringify(D)))) === JSON.stringify(D),
);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal === 0 ? 0 : 1);
