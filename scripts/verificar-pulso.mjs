/**
 * El estado del flujo de datos: los umbrales y los textos.
 *
 * Lo que se prueba acá es la parte que decide si decir «en vivo» o
 * «cortado». Importa porque un indicador que miente es peor que no
 * tenerlo: el anterior decía «Live» con un punto verde latiendo
 * aunque no hubiera llegado un solo dato.
 */
import {
  estadoDelPulso,
  marcarDato,
  olvidarPulso,
  segundosSinDatos,
  textoDelPulso,
} from "../src/lib/chart/pulso.ts";

const fallos = [];
const comprobar = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "ok " : "MAL"} ${nombre}${!cond && detalle ? ` — ${detalle}` : ""}`);
  if (!cond) fallos.push(nombre);
};

console.log("Antes del primer dato no dice que está en vivo");
{
  olvidarPulso();
  comprobar("sin datos, el contador es infinito", !Number.isFinite(segundosSinDatos()));
  comprobar("y el estado es «esperando», no «vivo»",
    estadoDelPulso(segundosSinDatos()) === "esperando",
    estadoDelPulso(segundosSinDatos()));
  comprobar("el texto no promete nada", textoDelPulso("esperando", Infinity) === "Esperando datos…");
}

console.log("Con un dato recién llegado, está vivo");
{
  marcarDato();
  const s = segundosSinDatos();
  comprobar("el contador arranca casi en cero", s >= 0 && s < 1, String(s));
  comprobar("y el estado es «vivo»", estadoDelPulso(s) === "vivo", estadoDelPulso(s));
}

console.log("Los umbrales");
{
  const casos = [
    [0, "vivo"], [9.9, "vivo"],
    [10, "lento"], [30, "lento"], [44.9, "lento"],
    [45, "cortado"], [3600, "cortado"],
    [Infinity, "esperando"],
  ];
  for (const [s, esperado] of casos) {
    comprobar(`${s} s → ${esperado}`, estadoDelPulso(s) === esperado, estadoDelPulso(s));
  }
}

console.log("Los textos dicen cuánto hace, que es lo accionable");
{
  comprobar("en vivo, solo «En vivo»", textoDelPulso("vivo", 2) === "En vivo");
  comprobar("lento, con los segundos", /hace 20 s/.test(textoDelPulso("lento", 20)),
    textoDelPulso("lento", 20));
  comprobar("redondea los segundos", /hace 21 s/.test(textoDelPulso("lento", 20.6)),
    textoDelPulso("lento", 20.6));
  comprobar("cortado, en minutos", /hace 2 min/.test(textoDelPulso("cortado", 120)),
    textoDelPulso("cortado", 120));
  comprobar("y más de diez minutos no se cuenta al minuto",
    /más de 10 min/.test(textoDelPulso("cortado", 5000)), textoDelPulso("cortado", 5000));
  // Nunca un «0 min», que no dice nada.
  comprobar("nunca dice «0 min»", !/\b0 min/.test(textoDelPulso("cortado", 45)),
    textoDelPulso("cortado", 45));
}

console.log("Cada dato nuevo reinicia la cuenta");
{
  olvidarPulso();
  comprobar("empieza sin nada", !Number.isFinite(segundosSinDatos()));
  marcarDato();
  comprobar("un dato lo pone en vivo", estadoDelPulso(segundosSinDatos()) === "vivo");
  olvidarPulso();
  comprobar("y olvidarlo lo devuelve a esperando",
    estadoDelPulso(segundosSinDatos()) === "esperando");
}

console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
