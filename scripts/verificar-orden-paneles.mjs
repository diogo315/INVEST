/**
 * El orden de los paneles de indicadores.
 *
 * La parte pura: qué orden queda después de subir o bajar uno, qué pasa
 * con los que están apagados, y qué pasa al prender uno nuevo. El
 * reparto sobre el chart de verdad se prueba en el navegador.
 */
import {
  INDICADORES_CON_PANEL,
  ordenEfectivo,
  useChartStore,
} from "../src/lib/store/chart-store.ts";

const fallos = [];
const comprobar = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "ok " : "MAL"} ${nombre}${!cond && detalle ? ` — ${detalle}` : ""}`);
  if (!cond) fallos.push(nombre);
};

const g = () => useChartStore.getState().graficos[0];
const id = () => g().id;
const prender = (claves) =>
  useChartStore.setState((s) => ({
    graficos: s.graficos.map((x) =>
      x.id === id()
        ? {
            ...x,
            ordenPaneles: [],
            indicators: Object.fromEntries(
              Object.keys(x.indicators).map((k) => [k, claves.includes(k)]),
            ),
          }
        : x,
    ),
  }));
/** Los paneles prendidos, en el orden en que irían de arriba a abajo. */
const orden = () => ordenEfectivo(g()).filter((k) => g().indicators[k]);
const mover = (k, d) => useChartStore.getState().moverPanel(k, d, id());

console.log("Sin tocar nada, el orden es el natural");
{
  prender(["rsi", "cipher", "srsi"]);
  comprobar("arranca en el orden de la lista",
    orden().join(",") === "rsi,cipher,srsi", orden().join(","));
  comprobar("y el orden guardado está vacío",
    g().ordenPaneles.length === 0, JSON.stringify(g().ordenPaneles));
}

console.log("Subir y bajar");
{
  prender(["rsi", "cipher", "srsi"]);
  // Lo que pidió Diego: el Cipher B arriba del RSI.
  const r = mover("cipher", -1);
  comprobar("subir el cipher lo pone primero",
    orden().join(",") === "cipher,rsi,srsi", orden().join(","));
  comprobar("y devuelve el orden nuevo",
    Array.isArray(r) && r.join(",") === "cipher,rsi,srsi", JSON.stringify(r));

  mover("cipher", 1);
  comprobar("bajarlo lo devuelve a donde estaba",
    orden().join(",") === "rsi,cipher,srsi", orden().join(","));

  mover("srsi", -1);
  mover("srsi", -1);
  comprobar("dos veces arriba lo lleva al tope",
    orden().join(",") === "srsi,rsi,cipher", orden().join(","));
}

console.log("Los bordes no se pasan");
{
  prender(["rsi", "cipher", "srsi"]);
  comprobar("el primero no puede subir más", mover("rsi", -1) === null);
  comprobar("y el orden no cambió",
    orden().join(",") === "rsi,cipher,srsi", orden().join(","));
  comprobar("el último no puede bajar más", mover("srsi", 1) === null);
  comprobar("un indicador apagado no se mueve", mover("macd", -1) === null);
  comprobar("ni uno que no lleva panel", mover("medias", -1) === null);
}

console.log("Prender y apagar respetan lo que ya habías ordenado");
{
  prender(["rsi", "cipher", "srsi"]);
  mover("cipher", -1); // cipher, rsi, srsi
  // Se prende el MACD: tiene que ir al final, sin desarmar lo de arriba.
  useChartStore.setState((s) => ({
    graficos: s.graficos.map((x) =>
      x.id === id() ? { ...x, indicators: { ...x.indicators, macd: true } } : x),
  }));
  comprobar("el que se prende después va al final",
    orden().join(",") === "cipher,rsi,srsi,macd", orden().join(","));

  // Y apagar uno del medio no desordena a los demás.
  useChartStore.setState((s) => ({
    graficos: s.graficos.map((x) =>
      x.id === id() ? { ...x, indicators: { ...x.indicators, rsi: false } } : x),
  }));
  comprobar("apagar uno del medio no desordena al resto",
    orden().join(",") === "cipher,srsi,macd", orden().join(","));

  // Al volver a prenderlo, vuelve a SU lugar, no al final: su posición
  // seguía guardada.
  useChartStore.setState((s) => ({
    graficos: s.graficos.map((x) =>
      x.id === id() ? { ...x, indicators: { ...x.indicators, rsi: true } } : x),
  }));
  comprobar("y al volver a prenderlo recupera su lugar",
    orden().join(",") === "cipher,rsi,srsi,macd", orden().join(","));
}

console.log("Un orden guardado con basura no rompe nada");
{
  // Esto es lo que llegaría de un localStorage de otra versión.
  comprobar("ordenEfectivo ignora claves que no llevan panel",
    ordenEfectivo({ ordenPaneles: ["medias", "volume", "cipher"] })[0] === "cipher",
    JSON.stringify(ordenEfectivo({ ordenPaneles: ["medias", "volume", "cipher"] }).slice(0, 2)));
  comprobar("y devuelve TODOS los que llevan panel, sin perder ninguno",
    ordenEfectivo({ ordenPaneles: ["srsi"] }).slice().sort().join(",") ===
      [...INDICADORES_CON_PANEL].sort().join(","),
    JSON.stringify(ordenEfectivo({ ordenPaneles: ["srsi"] })));
  comprobar("sin repetir ninguno",
    new Set(ordenEfectivo({ ordenPaneles: ["srsi", "srsi"] })).size ===
      INDICADORES_CON_PANEL.length);
}

console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
