/**
 * Geometría de los dibujos: lo que decide si un clic le dio a una línea.
 * Es lo único que no se puede mirar "a ojo" en el navegador.
 *
 *   node --experimental-strip-types scripts/verificar-dibujos.mjs
 */

import {
  NIVELES_FIB,
  PUNTOS_DE,
  esPosicion,
  nivelesDePosicion,
  puntosIniciales,
  relacionDePosicion,
  TOLERANCIA,
  correrDibujo,
  dentroDeRectangulo,
  dibujoBajoElClic,
  dibujoNuevo,
  distanciaABorde,
  distanciaASegmento,
  guionesDe,
  leDiAlDibujo,
  sanearDibujos,
  LADOS_RECT,
  ejeDelLado,
  indiceDelLado,
  moverLado,
  moverEje,
  tiradoresDePosicion,
  juntarDibujosDeBacktest,
} from "../src/lib/dibujos/tipos.ts";

let fallos = 0;
const ok = (que, cond, detalle = "") => {
  if (cond) console.log(`✓ ${que}`);
  else {
    fallos++;
    console.log(`✗ ${que}${detalle ? ` — ${detalle}` : ""}`);
  }
};
const cerca = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ── distancia a un segmento ────────────────────────────────────────────
ok("sobre la línea: distancia 0", cerca(distanciaASegmento(50, 50, 0, 0, 100, 100), 0));
ok(
  "en perpendicular: la distancia es la perpendicular",
  cerca(distanciaASegmento(0, 10, 0, 0, 100, 0), 10),
);
ok(
  "más allá del extremo mide hasta el extremo, no hasta la recta",
  cerca(distanciaASegmento(110, 0, 0, 0, 100, 0), 10),
);
ok("un segmento de largo cero no divide por cero", cerca(distanciaASegmento(3, 4, 0, 0, 0, 0), 5));

// ── rectángulos ────────────────────────────────────────────────────────
ok("adentro del rectángulo", dentroDeRectangulo(50, 50, 0, 0, 100, 100));
ok("afuera", !dentroDeRectangulo(150, 50, 0, 0, 100, 100));
ok("las esquinas cuentan como adentro", dentroDeRectangulo(0, 0, 0, 0, 100, 100));
ok("el rectángulo al revés también funciona", dentroDeRectangulo(50, 50, 100, 100, 0, 0));
ok("en el borde la distancia al borde es 0", cerca(distanciaABorde(0, 50, 0, 0, 100, 100), 0));
ok("en el centro, la distancia al borde es la mitad", cerca(distanciaABorde(50, 50, 0, 0, 100, 100), 50));

// ── darle a cada tipo de dibujo ────────────────────────────────────────
const pant = (...ps) => ps.map(([x, y]) => ({ x, y }));
const base = { relleno: false, tamanoTexto: 14, texto: "" };

ok(
  "horizontal: se le da a cualquier x, a la altura de la línea",
  leDiAlDibujo({ ...base, tipo: "horizontal" }, pant([0, 200]), 900, 203, 1000, 400),
);
ok(
  "horizontal: no se le da 30 px más abajo",
  !leDiAlDibujo({ ...base, tipo: "horizontal" }, pant([0, 200]), 900, 230, 1000, 400),
);
ok(
  "vertical: se le da a cualquier y",
  leDiAlDibujo({ ...base, tipo: "vertical" }, pant([300, 0]), 302, 380, 1000, 400),
);
ok(
  "tendencia: se le da sobre la línea",
  leDiAlDibujo({ ...base, tipo: "tendencia" }, pant([0, 0], [100, 100]), 50, 52, 1000, 400),
);
ok(
  "tendencia: no se le da lejos",
  !leDiAlDibujo({ ...base, tipo: "tendencia" }, pant([0, 0], [100, 100]), 50, 80, 1000, 400),
);
ok(
  "rectángulo sin relleno: el borde sí, el centro no",
  leDiAlDibujo({ ...base, tipo: "rectangulo" }, pant([0, 0], [200, 200]), 0, 100, 1000, 400) &&
    !leDiAlDibujo({ ...base, tipo: "rectangulo" }, pant([0, 0], [200, 200]), 100, 100, 1000, 400),
);
ok(
  "rectángulo con relleno: el centro también",
  leDiAlDibujo(
    { ...base, relleno: true, tipo: "rectangulo" },
    pant([0, 0], [200, 200]),
    100,
    100,
    1000,
    400,
  ),
);
ok(
  "texto: se le da sobre las letras",
  leDiAlDibujo({ ...base, tipo: "texto", texto: "Soporte" }, pant([100, 100]), 110, 100, 1000, 400),
);
ok(
  "texto: no se le da bien a la izquierda",
  !leDiAlDibujo({ ...base, tipo: "texto", texto: "Soporte" }, pant([100, 100]), 50, 100, 1000, 400),
);
ok(
  "fibonacci: se le da a cualquiera de sus niveles",
  NIVELES_FIB.every((n) =>
    leDiAlDibujo(
      { ...base, tipo: "fibonacci" },
      pant([0, 0], [300, 200]),
      150,
      200 * n,
      1000,
      400,
    ),
  ),
);
ok(
  "fibonacci: entre dos niveles, no",
  !leDiAlDibujo({ ...base, tipo: "fibonacci" }, pant([0, 0], [300, 200]), 150, 110, 1000, 400),
);
ok(
  "fibonacci: fuera del ancho, no",
  !leDiAlDibujo({ ...base, tipo: "fibonacci" }, pant([0, 0], [300, 200]), 500, 0, 1000, 400),
);
ok(`la tolerancia del clic es de ${TOLERANCIA} px`, TOLERANCIA >= 5 && TOLERANCIA <= 10);

// ── cuál se selecciona cuando hay varios encima ────────────────────────
{
  const a = { id: "viejo", tipo: "horizontal", relleno: false, tamanoTexto: 14, texto: "" };
  const b = { id: "nuevo", tipo: "horizontal", relleno: false, tamanoTexto: 14, texto: "" };
  const elegido = dibujoBajoElClic([a, b], () => pant([0, 100]), 500, 100, 1000, 400);
  ok("con dos encimados gana el último dibujado", elegido?.id === "nuevo");
  ok(
    "si no hay nada debajo, no se selecciona nada",
    dibujoBajoElClic([a], () => pant([0, 100]), 500, 300, 1000, 400) === null,
  );
}

// ── mover ──────────────────────────────────────────────────────────────
{
  const movido = correrDibujo([{ time: 100, price: 10 }, { time: 200, price: 20 }], 50, -5);
  ok(
    "mover corre los dos puntos por igual",
    movido[0].time === 150 && movido[0].price === 5 && movido[1].time === 250 && movido[1].price === 15,
  );
}

// ── estilos de línea ───────────────────────────────────────────────────
ok("la línea sólida no lleva guiones", guionesDe("solida", 2) === undefined);
ok("la rayada sí", typeof guionesDe("rayada", 2) === "string");
ok("la punteada tiene puntos más juntos", guionesDe("punteada", 2) !== guionesDe("rayada", 2));

// ── cuántos clics lleva cada herramienta ───────────────────────────────
ok(
  "un clic: horizontal, vertical y texto",
  PUNTOS_DE.horizontal === 1 && PUNTOS_DE.vertical === 1 && PUNTOS_DE.texto === 1,
);
ok(
  "dos clics: tendencia, rectángulo, flecha y Fibonacci",
  PUNTOS_DE.tendencia === 2 && PUNTOS_DE.rectangulo === 2 && PUNTOS_DE.flecha === 2 && PUNTOS_DE.fibonacci === 2,
);

// ── lo guardado ────────────────────────────────────────────────────────
{
  const d = dibujoNuevo("x", "tendencia", [{ time: 1, price: 2 }, { time: 3, price: 4 }]);
  ok("un dibujo nuevo nace desbloqueado y visible", !d.bloqueado && d.grosor >= 1);

  const limpio = sanearDibujos([
    d,
    { id: "roto" },
    null,
    { id: "sin-puntos", tipo: "tendencia", puntos: [] },
    { id: "tipo-raro", tipo: "nave-espacial", puntos: [{ time: 1, price: 1 }] },
    { id: "nan", tipo: "horizontal", puntos: [{ time: 1, price: NaN }] },
  ]);
  ok("se descarta todo lo que no sea un dibujo válido", limpio.length === 1, JSON.stringify(limpio.map((x) => x.id)));

  const acotado = sanearDibujos([
    { id: "a", tipo: "horizontal", puntos: [{ time: 1, price: 1 }], grosor: 99, tamanoTexto: 500, estilo: "zigzag" },
  ]);
  ok(
    "los valores fuera de rango se acotan",
    acotado[0].grosor === 6 && acotado[0].tamanoTexto === 48 && acotado[0].estilo === "solida",
    JSON.stringify(acotado[0]),
  );
  ok("lo que no es una lista devuelve vacío", sanearDibujos("nada").length === 0);
}

console.log("Herramienta de posición larga y corta");
{
  const pt = (time, price) => ({ time, price });
  ok("se reconocen las dos de posición",
    esPosicion("posicionLarga") && esPosicion("posicionCorta"));
  ok("y el rectángulo no lo es", !esPosicion("rectangulo"));
  ok("los demás dibujos nacen con los dos puntos marcados",
    puntosIniciales("rectangulo", pt(1, 100), pt(2, 110)).length === 2);

  // LARGA: entrada 100, objetivo 110 → el stop nace en 90 (1:1).
  const larga = puntosIniciales("posicionLarga", pt(1, 100), pt(5, 110));
  ok("la posición nace con TRES puntos", larga.length === 3);
  ok("el stop nace al otro lado de la entrada", larga[2].price === 90,
    String(larga[2].price));
  ok("y a la misma distancia que el objetivo (1:1)",
    Math.abs(larga[1].price - larga[0].price) === Math.abs(larga[0].price - larga[2].price));

  const d = { tipo: "posicionLarga", puntos: larga };
  const n = nivelesDePosicion(d);
  ok("los niveles salen bien", n.entrada === 100 && n.objetivo === 110 && n.stop === 90);
  ok("y el tramo de tiempo va del primero al último", n.desde === 1 && n.hasta === 5);
  ok("la relación inicial es 1", relacionDePosicion(d) === 1);

  // Arrastrar el objetivo a 120 deja 2:1.
  const movido = { tipo: "posicionLarga", puntos: [pt(1, 100), pt(5, 120), pt(5, 90)] };
  ok("mover el objetivo cambia la relación a 2", relacionDePosicion(movido) === 2);
  // Y acercar el stop a 95 la lleva a 4:1.
  const stopCerca = { tipo: "posicionLarga", puntos: [pt(1, 100), pt(5, 120), pt(5, 95)] };
  ok("acercar el stop la lleva a 4", relacionDePosicion(stopCerca) === 4);

  // CORTA: el objetivo va abajo, así que el stop nace arriba.
  const corta = puntosIniciales("posicionCorta", pt(1, 100), pt(5, 90));
  ok("en la corta el stop nace ARRIBA", corta[2].price === 110, String(corta[2].price));

  // Marcar el objetivo del lado equivocado se respeta, no se corrige solo.
  const alReves = puntosIniciales("posicionLarga", pt(1, 100), pt(5, 90));
  ok("un objetivo del lado equivocado se dibuja igual", alReves[1].price === 90);
  ok("y el stop queda del otro lado, coherente", alReves[2].price === 110);

  // Lo que no se puede calcular, no se inventa.
  ok("sin el tercer punto no hay niveles",
    nivelesDePosicion({ tipo: "posicionLarga", puntos: [pt(1, 100), pt(5, 110)] }) === null);
  ok("un rectángulo no tiene niveles de posición",
    nivelesDePosicion({ tipo: "rectangulo", puntos: [pt(1, 100), pt(5, 110)] }) === null);
  ok("con riesgo cero la relación es null, no infinito",
    relacionDePosicion({ tipo: "posicionLarga", puntos: [pt(1, 100), pt(5, 110), pt(5, 100)] }) === null);
  ok("PUNTOS_DE dice 2 clics para la posición",
    PUNTOS_DE.posicionLarga === 2 && PUNTOS_DE.posicionCorta === 2);
}


console.log("Estirar el rectángulo por un lado");
{
  const pt = (time, price) => ({ time, price });
  // Esquinas EN DESORDEN a propósito: se guardan como las marcó el
  // usuario, y empezar por abajo-derecha es tan normal como por
  // arriba-izquierda.
  const r = [pt(100, 50), pt(20, 90)];   // 0 = derecha-abajo, 1 = izquierda-arriba

  ok("el lado derecho es el punto con la fecha mayor", indiceDelLado(r, "derecha") === 0);
  ok("el izquierdo, el de la fecha menor", indiceDelLado(r, "izquierda") === 1);
  ok("el de arriba es el PRECIO mayor", indiceDelLado(r, "arriba") === 1);
  ok("el de abajo, el precio menor", indiceDelLado(r, "abajo") === 0);

  ok("los lados verticales mueven el tiempo",
    ejeDelLado("izquierda") === "tiempo" && ejeDelLado("derecha") === "tiempo");
  ok("y los horizontales, el precio",
    ejeDelLado("arriba") === "precio" && ejeDelLado("abajo") === "precio");
  ok("son cuatro lados", LADOS_RECT.length === 4);

  // EL PUNTO DE TODO ESTO: estirar de un lado NO cambia la altura.
  const estirado = moverLado(r, indiceDelLado(r, "derecha"), "tiempo", pt(300, 999));
  const altoAntes = Math.abs(r[0].price - r[1].price);
  const altoDespues = Math.abs(estirado[0].price - estirado[1].price);
  ok("ESTIRAR POR LA DERECHA NO TOCA LA ALTURA", altoAntes === altoDespues,
    `${altoAntes} -> ${altoDespues}`);
  ok("el precio de esa esquina queda igual, aunque el mouse esté en otro",
    estirado[0].price === 50, String(estirado[0].price));
  ok("y la fecha sí se mueve", estirado[0].time === 300, String(estirado[0].time));
  ok("la otra esquina no se toca",
    estirado[1].time === 20 && estirado[1].price === 90, JSON.stringify(estirado[1]));

  // Y el espejo: por arriba no cambia el ancho.
  const subido = moverLado(r, indiceDelLado(r, "arriba"), "precio", pt(777, 130));
  const anchoAntes = Math.abs(r[0].time - r[1].time);
  const anchoDespues = Math.abs(subido[0].time - subido[1].time);
  ok("ESTIRAR POR ARRIBA NO TOCA EL ANCHO", anchoAntes === anchoDespues,
    `${anchoAntes} -> ${anchoDespues}`);
  ok("sube el precio de la esquina de arriba", subido[1].price === 130);
  ok("y le deja la fecha", subido[1].time === 20, String(subido[1].time));

  // Pasarse de largo está permitido: el rectángulo se da vuelta, no se traba.
  const dadoVuelta = moverLado(r, indiceDelLado(r, "derecha"), "tiempo", pt(5, 0));
  ok("se puede pasar el lado derecho al otro lado del izquierdo",
    dadoVuelta[0].time === 5 && dadoVuelta[0].price === 50);

  ok("con un solo punto no revienta", indiceDelLado([pt(1, 1)], "derecha") === 0);
}

console.log("Los dibujos de las dos gráficas se juntan");
{
  const d = (id) => ({ id });
  const juntos = juntarDibujosDeBacktest({
    "bt:7:a": [d("uno"), d("dos")],
    "bt:7:b": [d("tres")],
    "BTCUSDT": [d("delMercado")],
  });
  ok("los dos paneles caen en la misma clave",
    juntos["bt:7"]?.map((x) => x.id).join(",") === "uno,dos,tres",
    JSON.stringify(juntos["bt:7"]?.map((x) => x.id)));
  ok("y las claves viejas desaparecen",
    !("bt:7:a" in juntos) && !("bt:7:b" in juntos), Object.keys(juntos).join(","));
  ok("EL SÍMBOLO DEL MERCADO NO SE TOCA",
    juntos["BTCUSDT"]?.length === 1, Object.keys(juntos).join(","));

  const repetido = juntarDibujosDeBacktest({ "bt:9": [d("x")], "bt:9:a": [d("x"), d("y")] });
  ok("un id repetido no entra dos veces",
    repetido["bt:9"].map((v) => v.id).join(",") === "x,y",
    JSON.stringify(repetido["bt:9"].map((v) => v.id)));

  const vacio = juntarDibujosDeBacktest({});
  ok("sin nada guardado no inventa claves", Object.keys(vacio).length === 0);
}

console.log("Al recargar, la posición conserva su stop");
{
  const pt = (time, price) => ({ time, price });
  const guardada = sanearDibujos([{
    id: "p", tipo: "posicionLarga",
    puntos: [pt(1, 100), pt(5, 110), pt(5, 90)],
  }]);
  ok("LOS TRES NIVELES SOBREVIVEN A sanearDibujos",
    guardada[0]?.puntos.length === 3, String(guardada[0]?.puntos.length));
  ok("y siguen siendo entrada, objetivo y stop",
    nivelesDePosicion(guardada[0])?.stop === 90,
    JSON.stringify(nivelesDePosicion(guardada[0])));
  const rect = sanearDibujos([{
    id: "r", tipo: "rectangulo",
    puntos: [pt(1, 1), pt(2, 2), pt(3, 3)],
  }]);
  ok("el rectángulo sigue acotado a dos esquinas", rect[0].puntos.length === 2);
}


console.log("Los tiradores de la posición");
{
  const pt = (time, price) => ({ time, price });
  const pos = { tipo: "posicionLarga", puntos: [pt(10, 100), pt(40, 120), pt(40, 90)] };
  const ts = tiradoresDePosicion(pos);
  ok("son cinco: tres niveles y dos bordes", ts?.length === 5, String(ts?.length));
  const de = (k) => ts.find((t) => t.clave === k);
  ok("los tres niveles mueven el PRECIO",
    ["entrada", "objetivo", "stop"].every((k) => de(k).eje === "precio"));
  ok("y los dos bordes, la FECHA",
    de("izquierda").eje === "tiempo" && de("derecha").eje === "tiempo");
  ok("EL BORDE DERECHO MUEVE OBJETIVO Y STOP JUNTOS",
    de("derecha").indices.join(",") === "1,2", de("derecha").indices.join(","));
  ok("y el izquierdo, solo la entrada", de("izquierda").indices.join(",") === "0");

  // Subir el objetivo no le toca la duración a la operación.
  const subido = moverEje(pos.puntos, de("objetivo").indices, "precio", pt(999, 140));
  ok("SUBIR EL OBJETIVO NO LE CAMBIA LA FECHA", subido[1].time === 40, String(subido[1].time));
  ok("el objetivo sí sube", subido[1].price === 140);
  ok("la entrada y el stop quedan intactos",
    subido[0].price === 100 && subido[2].price === 90);

  // Alargarla mueve el borde de las DOS cajas, no de una.
  const largo = moverEje(pos.puntos, de("derecha").indices, "tiempo", pt(90, 777));
  ok("ALARGARLA MUEVE EL BORDE DE LAS DOS CAJAS",
    largo[1].time === 90 && largo[2].time === 90,
    `${largo[1].time} / ${largo[2].time}`);
  ok("sin tocar ninguno de los tres precios",
    largo[0].price === 100 && largo[1].price === 120 && largo[2].price === 90);
  ok("y sin mover el inicio", largo[0].time === 10);

  // La relación beneficio/riesgo sigue los niveles, no la duración.
  ok("alargarla no cambia la relación B/R",
    relacionDePosicion({ tipo: "posicionLarga", puntos: largo }) ===
      relacionDePosicion(pos));

  ok("un rectángulo no tiene tiradores de posición",
    tiradoresDePosicion({ tipo: "rectangulo", puntos: [pt(1, 1), pt(2, 2)] }) === null);
  ok("media posición tampoco",
    tiradoresDePosicion({ tipo: "posicionLarga", puntos: [pt(1, 1), pt(2, 2)] }) === null);
}

console.log(fallos === 0 ? "\n✓ dibujos: la geometría responde bien" : `\n✗ ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
