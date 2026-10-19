/**
 * Los conceptos macro en español del buscador.
 *
 * Lo que de verdad se prueba acá no es que «dolar» encuentre UUP, sino
 * dos cosas más fáciles de romper: que escribir la frase entera («indice
 * del dolar») siga funcionando, y que ningún papel aparezca sin su
 * advertencia cuando no es lo que el nombre promete.
 */
import { CONCEPTOS, atajosDe, conceptoDe, normalizar } from "../src/lib/exchanges/macro.ts";
import { rankearSimbolos } from "../src/lib/exchanges/buscar.ts";

const fallos = [];
const comprobar = (nombre, cond, detalle = "") => {
  console.log(`  ${cond ? "ok " : "MAL"} ${nombre}${!cond && detalle ? ` — ${detalle}` : ""}`);
  if (!cond) fallos.push(nombre);
};

console.log("Lo que uno escribe de verdad");
{
  const casos = [
    ["indice del dolar", "UUP"],
    ["índice del dólar", "UUP"],
    ["INDICE DEL DOLAR", "UUP"],
    ["dolar", "UUP"],
    ["dxy", "UUP"],
    ["volatilidad", "VIXY"],
    ["el vix", "VIXY"],
    ["indice del miedo", "VIXY"],
    ["volat", "VIXY"], // a medio escribir
    ["bonos del tesoro", "TLT"],
    ["bono 10 anos", "IEF"],
    ["tasas", "BIL"],
    ["oro", "GLD"],
    ["petroleo", "USO"],
    ["materias primas", "DBC"],
  ];
  for (const [consulta, esperado] of casos) {
    const s = atajosDe(consulta);
    // El PRIMERO, no «está en la lista»: el orden es la prioridad, y
    // «dolar» ofreciendo UDN antes que UUP sería el fondo que sube
    // cuando el dólar baja.
    comprobar(`«${consulta}» → ${esperado} (y primero)`, s[0] === esperado,
      JSON.stringify(s));
  }
}

console.log("La frase más larga gana, si hay dos que encajan");
{
  // «bono 10 anos» contiene «bonos»… y también «bono 10 anos». Tiene que
  // ganar la larga, o escribir el plazo no serviría de nada.
  comprobar("«bono 10 anos» da IEF y no el paquete genérico de bonos",
    conceptoDe("bono 10 anos")?.frases[0] === "bono 10 anos",
    conceptoDe("bono 10 anos")?.frases[0]);
  comprobar("pero «bonos» solo sigue dando el paquete",
    conceptoDe("bonos")?.frases[0] === "bonos", conceptoDe("bonos")?.frases[0]);
}

console.log("Palabras enteras: no vale cazar pedazos");
{
  // Sin el corte por palabra entera, «ahorro» contiene «oro» y el
  // buscador te ofrece lingotes.
  comprobar("«ahorro» no devuelve oro", !atajosDe("ahorro").includes("GLD"),
    JSON.stringify(atajosDe("ahorro")));
  comprobar("«doloroso» no devuelve el dólar", !atajosDe("doloroso").includes("UUP"),
    JSON.stringify(atajosDe("doloroso")));
  comprobar("«gaseosa» no devuelve gas natural", !atajosDe("gaseosa").includes("UNG"),
    JSON.stringify(atajosDe("gaseosa")));
  comprobar("pero «oro» sí", atajosDe("oro").includes("GLD"));
  comprobar("y «precio del oro» también", atajosDe("precio del oro").includes("GLD"));
}

console.log("Cada proxy lleva su advertencia, sin excepción");
{
  // Esta es la que importa: un papel que no es lo que el concepto dice,
  // mostrado sin aviso, hace que uno lea el gráfico al revés.
  const DEBEN_AVISAR = ["dolar", "volatilidad", "tasas", "bono 10 anos", "inflacion"];
  for (const q of DEBEN_AVISAR) {
    const c = conceptoDe(q);
    comprobar(`«${q}» avisa de qué está mirando`,
      typeof c?.advertencia === "string" && c.advertencia.length > 30,
      JSON.stringify(c?.advertencia));
  }
  comprobar("la advertencia del VIX dice que son futuros",
    /futuros/i.test(conceptoDe("vix")?.advertencia ?? ""),
    conceptoDe("vix")?.advertencia ?? "");
  comprobar("la del bono a 10 años avisa de que es el precio, no la tasa",
    /precio/i.test(conceptoDe("bono 10 anos")?.advertencia ?? ""));
  comprobar("y la de tasas, que se mueve al revés",
    /al rev[eé]s/i.test(conceptoDe("tasas")?.advertencia ?? ""));

  // Y al revés: lo que SÍ es directo no debe llevar aviso de más.
  for (const q of ["oro", "plata", "sp500", "nasdaq"]) {
    comprobar(`«${q}» no inventa una advertencia`, conceptoDe(q)?.advertencia === null,
      JSON.stringify(conceptoDe(q)?.advertencia));
  }
}

console.log("Lo que todavía no hay, se dice");
{
  for (const q of ["desempleo", "m2", "balance de la fed", "curva de bonos"]) {
    const c = conceptoDe(q);
    comprobar(`«${q}» se reconoce aunque no haya símbolo`, c !== null);
    comprobar(`«${q}» no inventa un papel`, c?.simbolos.length === 0,
      JSON.stringify(c?.simbolos));
    comprobar(`«${q}» explica por qué no está`,
      /FRED/.test(c?.advertencia ?? ""), c?.advertencia ?? "");
  }
}

console.log("El catálogo está sano");
{
  const vistas = new Map();
  let repetidas = [];
  for (const c of CONCEPTOS) {
    for (const f of c.frases) {
      if (vistas.has(f)) repetidas.push(f);
      vistas.set(f, c);
      if (normalizar(f) !== f) repetidas.push(`${f} (sin normalizar)`);
    }
  }
  comprobar("ninguna frase repetida ni con tildes", repetidas.length === 0,
    JSON.stringify(repetidas));
  comprobar("todo concepto dice qué es",
    CONCEPTOS.every((c) => c.que.length > 10));
  comprobar("todo concepto sin símbolos explica por qué",
    CONCEPTOS.filter((c) => c.simbolos.length === 0).every((c) => c.advertencia),
    JSON.stringify(CONCEPTOS.filter((c) => c.simbolos.length === 0 && !c.advertencia)));
}

console.log("Y el buscador los sube arriba de todo");
{
  const catalogo = [
    { qualified: "ALP:UUP", exchange: "ALP", symbol: "UUP", base: "UUP", quote: "USD", nombre: "Invesco DB US Dollar Index Bullish Fund" },
    { qualified: "ALP:AAPL", exchange: "ALP", symbol: "AAPL", base: "AAPL", quote: "USD", nombre: "Apple Inc" },
    { qualified: "ALP:VIXY", exchange: "ALP", symbol: "VIXY", base: "VIXY", quote: "USD", nombre: "ProShares VIX Short-Term Futures ETF" },
    { qualified: "BIN:BTCUSDT", exchange: "BIN", symbol: "BTCUSDT", base: "BTC", quote: "USDT", nombre: "Bitcoin" },
  ];
  const primero = (q) => rankearSimbolos(catalogo, q)[0]?.symbol;
  comprobar("«indice del dolar» pone UUP primero", primero("indice del dolar") === "UUP",
    String(primero("indice del dolar")));
  comprobar("«volatilidad» pone VIXY primero", primero("volatilidad") === "VIXY",
    String(primero("volatilidad")));
  comprobar("y escribir el ticker sigue funcionando", primero("AAPL") === "AAPL",
    String(primero("AAPL")));
}

console.log(`\n${fallos.length === 0 ? "TODO BIEN" : `FALLARON ${fallos.length}:\n - ${fallos.join("\n - ")}`}`);
process.exit(fallos.length === 0 ? 0 : 1);
