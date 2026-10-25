"use client";

import { useEffect, useState } from "react";
import { getAdapter } from "@/lib/exchanges";
import { coberturaDeVentana, ventanaDeVelas } from "@/lib/backtest/ventana";
import { TIMEFRAME_SECONDS, type Candle, type Timeframe } from "@/lib/binance/types";

/** Tope de velas que se le piden al proveedor de una sola vez. */
export const TOPE_VELAS = 10000;

/**
 * Cuánto se espera antes de pedir, en milisegundos.
 *
 * Es lo que convierte un arrastre de la barra de posición en UNA
 * petición en vez de cuarenta y cuatro.
 */
export const ESPERA_MS = 300;

export interface Velas {
  velas: Candle[];
  cargando: boolean;
  error: string | null;
}

const VACIO: Velas = { velas: [], cargando: false, error: null };

/**
 * Las velas de un símbolo y una temporalidad, con su historia previa.
 *
 * Está como hook y no dentro de la vista porque el backtest puede mostrar
 * DOS gráficas de distinta temporalidad: son dos peticiones iguales con
 * parámetros distintos, y duplicar el efecto era duplicar también los
 * avisos de historia corta y el manejo del error.
 *
 * `tf` en null apaga la petición (la segunda gráfica cuando está apagada),
 * sin saltearse el hook: el orden de los hooks no puede cambiar entre
 * renders.
 */
export function useVelas(
  simbolo: string,
  tf: Timeframe | null,
  desde: number,
  historia: number,
  /**
   * Dónde está parado el reloj del backtest.
   *
   * Solo se usa cuando el rango completo NO entra en una petición: ahí
   * la ventana se ancla al reloj en vez de a la hora actual. Ver
   * `ventana.ts`, donde está el porqué con los números.
   */
  reloj = 0,
): Velas {
  const arranque = desde - historia * 86400;
  /**
   * Las velas se guardan junto a la clave de la petición que las trajo.
   *
   * Así «cargando» y «error» se deducen comparando la clave, en vez de
   * ponerlos con setState al entrar al efecto: eso dispara un render en
   * cascada y React lo marca como error.
   */
  const segundos = tf ? TIMEFRAME_SECONDS[tf] : 0;
  /**
   * «Ahora», fijado una sola vez al montar.
   *
   * Leerlo en cada render sería impuro y haría que la ventana cambiara
   * de identidad sola, provocando peticiones que nadie pidió. Y no hace
   * falta al segundo: solo sirve para saber si el período entero entra
   * en una petición y para no pedir velas del futuro.
   */
  const [ahora] = useState(() => Math.floor(Date.now() / 1000));
  const ventana = tf
    ? ventanaDeVelas(segundos, arranque, reloj || desde, TOPE_VELAS, ahora)
    : null;
  // La clave incluye la ventana: mientras el reloj no cambie de bloque,
  // es la misma y no se vuelve a pedir nada.
  const clave = tf ? `${simbolo}|${tf}|${desde}|${historia}|${ventana?.clave}` : "";
  const [datos, setDatos] = useState<{
    clave: string;
    velas: Candle[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!simbolo || !desde || !tf) return;
    if (!ventana) return;
    let vivo = true;
    /**
     * Un respiro antes de pedir.
     *
     * Medido: arrastrar la barra de posición de punta a punta cruzaba
     * varios bloques de la ventana deslizante y disparaba 44 peticiones
     * por arrastre, con 22 en vuelo a la vez. Contra Binance de verdad
     * eso es un bloqueo por exceso de peticiones, no una app rápida.
     *
     * Con la espera, mientras el usuario arrastra no se pide nada: solo
     * se pide la ventana donde SUELTA. El retraso en la carga normal es
     * imperceptible y se paga una sola vez.
     */
    const id = setTimeout(() => {
      if (!vivo) return;
      const { adapter, symbol } = getAdapter(simbolo);
      adapter
      .fetchKlines(symbol, tf, ventana.limite, ventana.hastaMs)
      .then((k) => {
        if (!vivo) return;
        const primera = k[0]?.time ?? 0;
        const dias = Math.round(coberturaDeVentana(segundos, TOPE_VELAS) / 86400);
        const aviso =
          k.length === 0
            ? `El proveedor no devolvió velas en ${tf}.`
            : ventana.deslizante
              ? // No es un error: en temporalidades cortas el período
                // entero no entra en una petición, así que la ventana
                // acompaña al reloj. Se dice para que no sorprenda que
                // el gráfico no muestre todo el backtest de una vez.
                `En ${tf} se cargan ${dias} días alrededor de donde está el reproductor: el período completo no entra en una sola petición.`
              : primera > desde
                ? `En ${tf} solo hay historia desde el ${new Date(primera * 1000)
                    .toISOString()
                    .slice(0, 10)}: el backtest no puede arrancar antes.`
                : primera > arranque + segundos * 2
                  ? `En ${tf} la historia previa llega hasta el ${new Date(primera * 1000)
                      .toISOString()
                      .slice(0, 10)}, no al período completo: no entran más velas en el tope de ${TOPE_VELAS.toLocaleString("es")}.`
                  : null;
        setDatos({ clave, velas: k, error: aviso });
      })
      .catch(() => {
        if (vivo)
          setDatos({ clave, velas: [], error: `No se pudieron bajar las velas de ${tf}.` });
      });
    }, ESPERA_MS);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
    // `ventana` se recalcula en cada render pero solo cambia de verdad
    // cuando cambia `clave`, que es lo que manda acá.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simbolo, tf, desde, arranque, clave]);

  if (!tf) return VACIO;
  const alDia = datos?.clave === clave;
  return {
    velas: alDia ? datos.velas : [],
    cargando: !alDia && simbolo !== "",
    error: alDia ? datos.error : null,
  };
}
