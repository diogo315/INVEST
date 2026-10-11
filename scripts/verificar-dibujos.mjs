/**
 * Geometría de los dibujos: lo que decide si un clic le dio a una línea.
 * Es lo único que no se puede mirar "a ojo" en el navegador.
 *
 *   node --experimental-strip-types scripts/verificar-dibujos.mjs
 */

import {
  NIVELES_FIB,
  PUNTOS_DE,
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

console.log(fallos === 0 ? "\n✓ dibujos: la geometría responde bien" : `\n✗ ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
