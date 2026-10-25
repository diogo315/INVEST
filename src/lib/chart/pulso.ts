/**
 * Cuándo llegó el último dato de precio, sea de donde sea.
 *
 * El indicador de abajo a la derecha decía «Live» con un punto verde
 * que parpadeaba SIEMPRE, viniera o no viniera un solo dato. Eso es
 * peor que no tener indicador: alguien con el WebSocket bloqueado por
 * la red de su oficina ve un punto verde latiendo y concluye que la
 * app está rota, cuando lo que está cortado es la conexión.
 *
 * Se mide el dato que de verdad importa —cuánto hace que no se mueve
 * un precio— y no el estado del socket, por dos razones: hay cuatro
 * proveedores y no todos usan WebSocket (la bolsa va por sondeo), y un
 * socket abierto pero mudo es exactamente el caso que hay que detectar.
 */

let ultimo = 0;

/** Lo llama todo el que recibe un precio: tick de vela, ticker, sondeo. */
export function marcarDato(): void {
  ultimo = Date.now();
}

/** Segundos desde el último precio recibido. `Infinity` si nunca llegó uno. */
export function segundosSinDatos(): number {
  return ultimo === 0 ? Infinity : (Date.now() - ultimo) / 1000;
}

/** Solo para las pruebas: vuelve al estado de recién arrancado. */
export function olvidarPulso(): void {
  ultimo = 0;
}

/** En qué estado está el flujo de datos. */
export type EstadoPulso = "vivo" | "lento" | "cortado" | "esperando";

/**
 * Los umbrales salen de lo que manda cada proveedor: Binance empuja el
 * ticker de 24 h cada segundo y las velas de futuros cada 250 ms, y la
 * bolsa sondea cada pocos segundos. Diez segundos sin nada ya no es
 * ruido; cuarenta y cinco es lo que espera el vigilante del socket
 * antes de reconectar solo, así que a partir de ahí está cortado de
 * verdad.
 */
export function estadoDelPulso(segundos: number): EstadoPulso {
  if (!Number.isFinite(segundos)) return "esperando";
  if (segundos < 10) return "vivo";
  if (segundos < 45) return "lento";
  return "cortado";
}

/** Lo que se muestra al lado del punto. */
export function textoDelPulso(estado: EstadoPulso, segundos: number): string {
  switch (estado) {
    case "vivo":
      return "En vivo";
    case "lento":
      return `Sin datos hace ${Math.round(segundos)} s`;
    case "cortado":
      return segundos > 600
        ? "Sin datos hace más de 10 min"
        : `Cortado hace ${Math.round(segundos / 60)} min`;
    default:
      return "Esperando datos…";
  }
}
