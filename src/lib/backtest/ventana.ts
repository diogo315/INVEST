/**
 * Qué tramo de velas hay que pedirle al proveedor.
 *
 * El problema que resuelve, medido: un backtest que arranca el
 * 2026-01-01 con velas de 15 minutos necesita unas 28.600 velas para
 * llegar hasta hoy, y el tope por petición es 10.000. La librería las
 * trae HACIA ATRÁS DESDE AHORA, así que esas 10.000 cubren los últimos
 * 104 días —del 2026-07-13 en adelante— y el reloj del backtest, parado
 * en enero, queda ANTES de todas ellas. Resultado: el panel se dibuja
 * vacío y no dice por qué.
 *
 * La solución es pedir una ventana anclada al RELOJ DEL BACKTEST en vez
 * de a la hora actual. Para que no haya una petición nueva en cada vela,
 * la ventana se mueve a saltos: se divide el tiempo en bloques y solo se
 * vuelve a pedir cuando el reloj cambia de bloque.
 *
 * Sin imports: se prueba sola.
 *   node --experimental-strip-types scripts/verificar-ventana-velas.mjs
 */

export interface VentanaVelas {
  /** Fin de la ventana, en milisegundos. `undefined` = ahora mismo. */
  hastaMs: number | undefined;
  /** Cuántas velas pedir. */
  limite: number;
  /**
   * Identifica la ventana. Mientras no cambie, no hay que volver a pedir.
   * Es lo que evita una petición por vela del reproductor.
   */
  clave: string;
  /** true cuando el rango completo no entra y hay que ir por tramos. */
  deslizante: boolean;
}

/**
 * Decide la ventana para una temporalidad.
 *
 * @param segundos   duración de una vela
 * @param arranque   inicio de la historia previa, en segundos
 * @param reloj      dónde está parado el backtest, en segundos
 * @param tope       máximo de velas por petición
 * @param ahora      hora actual, en segundos (parámetro para poder probar)
 */
export function ventanaDeVelas(
  segundos: number,
  arranque: number,
  reloj: number,
  tope: number,
  ahora: number,
): VentanaVelas {
  const necesarias = Math.ceil((ahora - arranque) / segundos) + 10;

  // Caso fácil y el más común (diario, semanal): todo el rango entra en
  // una petición. Se pide como siempre, anclado a ahora, y el gráfico
  // tiene la serie completa: el reproductor puede recorrerla entera y la
  // barra de posición dice la verdad.
  if (necesarias <= tope) {
    return {
      hastaMs: undefined,
      limite: Math.min(tope, Math.max(100, necesarias)),
      clave: "completa",
      deslizante: false,
    };
  }

  // No entra: ventana deslizante centrada en el reloj.
  //
  // El bloque es medio tope, y la ventana se extiende MEDIO BLOQUE más
  // allá de él por los dos lados. Esa holgura no es un adorno: con la
  // ventana pegada al bloque, un reloj parado justo al principio del
  // bloque se quedaba con CERO velas por detrás y los indicadores no
  // tenían con qué calcularse. Medido, y por eso está la prueba que
  // recorre el backtest entero comprobando el margen.
  //
  // Con esta holgura, en el peor punto del recorrido siempre quedan un
  // cuarto del tope de velas por detrás del reloj y otro tanto por
  // delante: 2.500 velas de cada lado con el tope en 10.000.
  const bloque = Math.floor(tope / 2) * segundos;
  const indice = Math.floor(reloj / bloque);
  // Nunca más allá de ahora: pedir el futuro no devuelve nada y correría
  // la ventana sin motivo.
  const fin = Math.min(ahora, indice * bloque + Math.floor(bloque * 1.5));
  return {
    hastaMs: fin * 1000,
    limite: tope,
    clave: `b${indice}`,
    deslizante: true,
  };
}

/**
 * Lo que la ventana alcanza a cubrir hacia atrás, en segundos.
 *
 * Sirve para avisar con precisión en vez de dejar el panel mudo: «en 15m
 * la ventana cubre 104 días alrededor de donde estás».
 */
export function coberturaDeVentana(segundos: number, tope: number): number {
  return segundos * tope;
}
