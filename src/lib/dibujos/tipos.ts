/**
 * Dibujos sobre el gráfico: líneas, textos, rectángulos, Fibonacci.
 *
 * Los puntos se guardan en coordenadas del MERCADO (fecha y precio), no en
 * píxeles: así el dibujo queda pegado a las velas al mover, hacer zoom o
 * cambiar de temporalidad, en vez de quedarse flotando en un lugar de la
 * pantalla.
 *
 * Sin imports a propósito, para poder probar la geometría sola:
 *   node --experimental-strip-types scripts/verificar-dibujos.mjs
 */

export type TipoDibujo =
  | "tendencia"
  | "horizontal"
  | "vertical"
  | "rectangulo"
  | "flecha"
  | "texto"
  | "fibonacci"
  | "posicionLarga"
  | "posicionCorta";

export type EstiloLinea = "solida" | "rayada" | "punteada";

export interface PuntoDibujo {
  /** Segundos epoch, como las velas. */
  time: number;
  price: number;
}

export interface Dibujo {
  id: string;
  tipo: TipoDibujo;
  /** Uno o dos puntos según el tipo. */
  puntos: PuntoDibujo[];
  color: string;
  grosor: number;
  estilo: EstiloLinea;
  /** Pintar el interior (rectángulo y Fibonacci). */
  relleno: boolean;
  texto: string;
  tamanoTexto: number;
  /** Bloqueado: se ve pero no se mueve ni se borra sin desbloquear. */
  bloqueado: boolean;
  creado: number;
}

/** Cuántos puntos hace falta marcar para cada herramienta. */
export const PUNTOS_DE: Record<TipoDibujo, 1 | 2> = {
  tendencia: 2,
  horizontal: 1,
  vertical: 1,
  rectangulo: 2,
  flecha: 2,
  texto: 1,
  fibonacci: 2,
  // Dos CLICS: entrada y objetivo. El stop se agrega solo, a la misma
  // distancia que el objetivo (relación 1:1), y después se arrastra.
  // Pedir tres clics para empezar a dibujar es pedir demasiado antes de
  // ver nada en pantalla.
  posicionLarga: 2,
  posicionCorta: 2,
};

export const NOMBRES_DIBUJO: Record<TipoDibujo, string> = {
  tendencia: "Línea de tendencia",
  horizontal: "Línea horizontal",
  vertical: "Línea vertical",
  rectangulo: "Rectángulo",
  flecha: "Flecha",
  texto: "Texto",
  fibonacci: "Fibonacci",
  posicionLarga: "Posición larga",
  posicionCorta: "Posición corta",
};

/** Las dos herramientas de posición, que llevan un punto más. */
export function esPosicion(t: TipoDibujo): boolean {
  return t === "posicionLarga" || t === "posicionCorta";
}

/**
 * Los puntos con los que NACE un dibujo.
 *
 * Para casi todos son los que marcó el usuario. Las herramientas de
 * posición llevan tres —entrada, objetivo y stop— pero se dibujan con
 * dos clics, así que el tercero se calcula acá: el stop va al otro lado
 * de la entrada, a la misma distancia que el objetivo, o sea una
 * relación beneficio/riesgo de 1:1 para empezar. No es una
 * recomendación: es un punto de partida que se arrastra.
 *
 * Si el usuario marca el objetivo del lado equivocado —abajo en una
 * larga— se respeta igual: se dibuja al revés y los números lo dicen.
 * Corregirlo en silencio escondería que se marcó mal.
 */
export function puntosIniciales(
  tipo: TipoDibujo,
  a: PuntoDibujo,
  b: PuntoDibujo,
): PuntoDibujo[] {
  if (!esPosicion(tipo)) return [a, b];
  const distancia = b.price - a.price;
  return [a, b, { time: b.time, price: a.price - distancia }];
}

/**
 * Entrada, objetivo y stop de una posición dibujada.
 *
 * Devuelve null si no es una herramienta de posición o le faltan puntos,
 * en vez de inventar un tercer nivel: media posición dibujada no es una
 * posición con el stop en cero.
 */
export function nivelesDePosicion(d: {
  tipo: TipoDibujo;
  puntos: PuntoDibujo[];
}): { entrada: number; objetivo: number; stop: number; desde: number; hasta: number } | null {
  if (!esPosicion(d.tipo) || d.puntos.length < 3) return null;
  const [a, b, c] = d.puntos;
  return {
    entrada: a.price,
    objetivo: b.price,
    stop: c.price,
    desde: Math.min(a.time, b.time, c.time),
    hasta: Math.max(a.time, b.time, c.time),
  };
}

/**
 * La relación beneficio/riesgo de una posición dibujada.
 *
 * null cuando el riesgo es cero: un número ahí se leería como si
 * significara algo, y no significa nada.
 */
export function relacionDePosicion(d: {
  tipo: TipoDibujo;
  puntos: PuntoDibujo[];
}): number | null {
  const n = nivelesDePosicion(d);
  if (!n) return null;
  const riesgo = Math.abs(n.entrada - n.stop);
  if (riesgo <= 1e-12) return null;
  return Math.abs(n.objetivo - n.entrada) / riesgo;
}

/** Niveles del retroceso de Fibonacci, de arriba hacia abajo. */
export const NIVELES_FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export const COLORES_DIBUJO = [
  "#2962ff",
  "#26a69a",
  "#ef5350",
  "#ffb74d",
  "#ab47bc",
  "#ffffff",
];

export const COLOR_POR_DEFECTO = COLORES_DIBUJO[0];

/** Trazo de cada estilo, en el formato que entiende SVG. */
export function guionesDe(estilo: EstiloLinea, grosor: number): string | undefined {
  if (estilo === "rayada") return `${grosor * 5} ${grosor * 4}`;
  if (estilo === "punteada") return `${grosor} ${grosor * 3}`;
  return undefined;
}

export function dibujoNuevo(
  id: string,
  tipo: TipoDibujo,
  puntos: PuntoDibujo[],
  color = COLOR_POR_DEFECTO,
): Dibujo {
  return {
    id,
    tipo,
    puntos,
    color,
    grosor: 2,
    estilo: "solida",
    relleno: tipo === "rectangulo" || tipo === "fibonacci",
    texto: tipo === "texto" ? "Texto" : "",
    tamanoTexto: 14,
    bloqueado: false,
    creado: Date.now(),
  };
}

// ───────────────────────── geometría (en píxeles) ─────────────────────

/** Distancia de un punto al segmento AB. La base de "¿le di al dibujo?". */
export function distanciaASegmento(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const largo2 = dx * dx + dy * dy;
  if (largo2 === 0) return Math.hypot(px - ax, py - ay);
  // Proyección del punto sobre la recta, acotada al segmento.
  let t = ((px - ax) * dx + (py - ay) * dy) / largo2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distancia al borde de un rectángulo (0 si el punto está sobre el borde). */
export function distanciaABorde(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const iz = Math.min(x1, x2);
  const de = Math.max(x1, x2);
  const ar = Math.min(y1, y2);
  const ab = Math.max(y1, y2);
  return Math.min(
    distanciaASegmento(px, py, iz, ar, de, ar),
    distanciaASegmento(px, py, de, ar, de, ab),
    distanciaASegmento(px, py, de, ab, iz, ab),
    distanciaASegmento(px, py, iz, ab, iz, ar),
  );
}

export function dentroDeRectangulo(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  return (
    px >= Math.min(x1, x2) &&
    px <= Math.max(x1, x2) &&
    py >= Math.min(y1, y2) &&
    py <= Math.max(y1, y2)
  );
}

/** Tolerancia del clic, en píxeles: una línea de 1 px sería imposible. */
export const TOLERANCIA = 7;

export interface PuntosEnPantalla {
  x: number;
  y: number;
}

/**
 * ¿El clic en (px, py) cae sobre este dibujo?
 *
 * Recibe los puntos ya convertidos a píxeles y el ancho del área, porque las
 * líneas horizontales y verticales se extienden de lado a lado.
 */
export function leDiAlDibujo(
  d: Pick<Dibujo, "tipo" | "relleno" | "tamanoTexto" | "texto">,
  pantalla: PuntosEnPantalla[],
  px: number,
  py: number,
  ancho: number,
  alto: number,
): boolean {
  const a = pantalla[0];
  if (!a) return false;
  const b = pantalla[1];

  switch (d.tipo) {
    case "horizontal":
      return Math.abs(py - a.y) <= TOLERANCIA;
    case "vertical":
      return Math.abs(px - a.x) <= TOLERANCIA;
    case "texto": {
      // Caja aproximada del texto: ancho por carácter y alto de la línea.
      const w = Math.max(20, d.texto.length * d.tamanoTexto * 0.6);
      const h = d.tamanoTexto * 1.4;
      return dentroDeRectangulo(px, py, a.x, a.y - h / 2, a.x + w, a.y + h / 2);
    }
    case "tendencia":
    case "flecha":
      return !!b && distanciaASegmento(px, py, a.x, a.y, b.x, b.y) <= TOLERANCIA;
    case "posicionLarga":
    case "posicionCorta": {
      // Todo el bloque —de la caja del objetivo a la del stop— es
      // agarrable. Es una figura que se mira y se mueve entera; exigir
      // acertarle a la línea de entrada la volvería incómoda.
      const c = pantalla[2];
      if (!b || !c) return false;
      const arriba = Math.min(a.y, b.y, c.y);
      const abajo = Math.max(a.y, b.y, c.y);
      const iz = Math.min(a.x, b.x, c.x);
      const de = Math.max(a.x, b.x, c.x);
      return dentroDeRectangulo(px, py, iz, arriba, de, abajo);
    }
    case "rectangulo":
      if (!b) return false;
      // Con relleno, todo el interior es agarrable; sin relleno, solo el
      // borde (si no, un rectángulo grande taparía todo lo que tiene debajo).
      return d.relleno
        ? dentroDeRectangulo(px, py, a.x, a.y, b.x, b.y)
        : distanciaABorde(px, py, a.x, a.y, b.x, b.y) <= TOLERANCIA;
    case "fibonacci": {
      if (!b) return false;
      const iz = Math.min(a.x, b.x);
      const de = Math.max(a.x, b.x);
      if (px < iz - TOLERANCIA || px > de + TOLERANCIA) return false;
      // Se le da a cualquiera de sus niveles.
      return NIVELES_FIB.some(
        (n) => Math.abs(py - (a.y + (b.y - a.y) * n)) <= TOLERANCIA,
      );
    }
    default:
      return false;
  }
  // `ancho` y `alto` quedan para las líneas que se extienden: no hace falta
  // compararlos, pero son parte del contrato del llamador.
}

/** El dibujo de más arriba (el último dibujado) que caiga bajo el clic. */
export function dibujoBajoElClic<
  T extends Pick<Dibujo, "id" | "tipo" | "relleno" | "tamanoTexto" | "texto">,
>(
  dibujos: T[],
  enPantalla: (d: T) => PuntosEnPantalla[],
  px: number,
  py: number,
  ancho: number,
  alto: number,
): T | null {
  for (let i = dibujos.length - 1; i >= 0; i--) {
    const d = dibujos[i];
    if (leDiAlDibujo(d, enPantalla(d), px, py, ancho, alto)) return d;
  }
  return null;
}

// ───────────────────── los lados del rectángulo ───────────────────────

/**
 * Los cuatro lados de un rectángulo, por si hay que estirarlo de uno solo.
 *
 * Un rectángulo se guarda con dos esquinas opuestas, así que arrastrar
 * una esquina mueve el ancho Y la altura a la vez. Marcar una zona de
 * precio y después querer alargarla hacia la derecha —porque el precio
 * siguió— es lo normal, y con esquinas nada más eso obliga a reacomodar
 * la altura a ojo cada vez.
 */
export type LadoRect = "izquierda" | "derecha" | "arriba" | "abajo";

export const LADOS_RECT: LadoRect[] = ["izquierda", "derecha", "arriba", "abajo"];

export const NOMBRES_LADO: Record<LadoRect, string> = {
  izquierda: "Lado izquierdo",
  derecha: "Lado derecho",
  arriba: "Lado superior",
  abajo: "Lado inferior",
};

/** Los lados verticales mueven la fecha; los horizontales, el precio. */
export function ejeDelLado(lado: LadoRect): "tiempo" | "precio" {
  return lado === "izquierda" || lado === "derecha" ? "tiempo" : "precio";
}

/**
 * Cuál de las dos esquinas manda en ese lado.
 *
 * Se resuelve UNA vez, al agarrar, y no en cada movimiento: si se
 * recalculara mientras se arrastra, al pasarse de largo el lado derecho
 * se convertiría en el izquierdo a mitad de camino y el rectángulo se
 * quedaría trabado contra sí mismo.
 */
export function indiceDelLado(puntos: PuntoDibujo[], lado: LadoRect): number {
  const [a, b] = puntos;
  if (!a || !b) return 0;
  switch (lado) {
    case "izquierda":
      return a.time <= b.time ? 0 : 1;
    case "derecha":
      return a.time >= b.time ? 0 : 1;
    // En pantalla "arriba" es el precio MAYOR, aunque en píxeles sea la Y
    // menor. Acá se razona en precios, que es lo que se guarda.
    case "arriba":
      return a.price >= b.price ? 0 : 1;
    case "abajo":
      return a.price <= b.price ? 0 : 1;
  }
}

/**
 * Estira el rectángulo por un lado.
 *
 * Cambia SOLO la coordenada de ese eje, en esa esquina: estirar por la
 * derecha mueve la fecha y deja el precio como estaba, así la altura no
 * se toca. La otra esquina no se mira siquiera.
 */
export function moverLado(
  puntos: PuntoDibujo[],
  indice: number,
  eje: "tiempo" | "precio",
  destino: PuntoDibujo,
): PuntoDibujo[] {
  return puntos.map((p, i) => {
    if (i !== indice) return p;
    return eje === "tiempo"
      ? { time: destino.time, price: p.price }
      : { time: p.time, price: destino.price };
  });
}

/**
 * Junta los dibujos que antes se guardaban por gráfica del backtest.
 *
 * Hasta ahora cada panel guardaba aparte (`bt:X:a` y `bt:X:b`). Al pasar
 * a una clave compartida (`bt:X`), lo ya guardado tiene que mudarse solo
 * o desaparecería de la pantalla sin aviso. Se descartan los repetidos
 * por id, que es lo que pasa con un dibujo duplicado entre paneles.
 *
 * Devuelve un objeto nuevo; no toca el que recibe.
 */
export function juntarDibujosDeBacktest<T extends { id: string }>(
  dibujos: Record<string, T[]>,
): Record<string, T[]> {
  const out: Record<string, T[]> = { ...dibujos };
  for (const clave of Object.keys(out)) {
    const m = /^(bt:.+):(a|b)$/.exec(clave);
    if (!m) continue;
    const destino = m[1];
    const yaEstan = out[destino] ?? [];
    const vienen = (out[clave] ?? []).filter(
      (d) => !yaEstan.some((x) => x.id === d.id),
    );
    out[destino] = [...yaEstan, ...vienen];
    delete out[clave];
  }
  return out;
}

/** Mueve todos los puntos de un dibujo por un delta de fecha y precio. */
export function correrDibujo(
  puntos: PuntoDibujo[],
  dTiempo: number,
  dPrecio: number,
): PuntoDibujo[] {
  return puntos.map((p) => ({ time: p.time + dTiempo, price: p.price + dPrecio }));
}

/** Saca la basura de lo guardado (otra pestaña, una versión vieja). */
export function sanearDibujos(crudo: unknown): Dibujo[] {
  if (!Array.isArray(crudo)) return [];
  return crudo
    .filter(
      (d): d is Dibujo =>
        !!d &&
        typeof d === "object" &&
        typeof (d as Dibujo).id === "string" &&
        Array.isArray((d as Dibujo).puntos) &&
        (d as Dibujo).puntos.length > 0 &&
        (d as Dibujo).puntos.every(
          (p) =>
            !!p && Number.isFinite(p.time) && Number.isFinite(p.price),
        ) &&
        typeof (d as Dibujo).tipo === "string" &&
        (d as Dibujo).tipo in PUNTOS_DE,
    )
    .map((d) => ({
      id: d.id,
      tipo: d.tipo,
      // Las de posición llevan TRES niveles (entrada, objetivo y stop).
      // Acotarlas a dos, como al resto, les borraba el stop al recargar
      // la página: el dibujo volvía a medias y sin decir por qué.
      puntos: d.puntos.slice(0, esPosicion(d.tipo) ? 3 : 2),
      color: typeof d.color === "string" && d.color ? d.color : COLOR_POR_DEFECTO,
      grosor: Math.min(6, Math.max(1, Number(d.grosor) || 2)),
      estilo:
        d.estilo === "rayada" || d.estilo === "punteada" ? d.estilo : "solida",
      relleno: d.relleno !== false,
      texto: typeof d.texto === "string" ? d.texto.slice(0, 200) : "",
      tamanoTexto: Math.min(48, Math.max(8, Number(d.tamanoTexto) || 14)),
      bloqueado: d.bloqueado === true,
      creado: Number(d.creado) || Date.now(),
    }));
}
