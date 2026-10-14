"use client";

import { useEffect, useState } from "react";
import { getAdapter } from "@/lib/exchanges";
import { TIMEFRAME_SECONDS, type Candle, type Timeframe } from "@/lib/binance/types";

/** Tope de velas que se le piden al proveedor de una sola vez. */
export const TOPE_VELAS = 10000;

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
): Velas {
  const arranque = desde - historia * 86400;
  /**
   * Las velas se guardan junto a la clave de la petición que las trajo.
   *
   * Así «cargando» y «error» se deducen comparando la clave, en vez de
   * ponerlos con setState al entrar al efecto: eso dispara un render en
   * cascada y React lo marca como error.
   */
  const clave = tf ? `${simbolo}|${tf}|${desde}|${historia}` : "";
  const [datos, setDatos] = useState<{
    clave: string;
    velas: Candle[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!simbolo || !desde || !tf) return;
    let vivo = true;
    const segundos = TIMEFRAME_SECONDS[tf];
    // Se piden las velas de la historia previa MÁS las del backtest. La
    // historia previa es lo que da de comer a los indicadores: sin 200
    // velas antes del arranque, una EMA 200 no existe el primer día.
    const necesarias = Math.ceil((Date.now() / 1000 - arranque) / segundos) + 10;
    const limite = Math.min(TOPE_VELAS, Math.max(100, necesarias));
    const { adapter, symbol } = getAdapter(simbolo);
    adapter
      .fetchKlines(symbol, tf, limite)
      .then((k) => {
        if (!vivo) return;
        const primera = k[0]?.time ?? 0;
        const aviso =
          k.length === 0
            ? `El proveedor no devolvió velas en ${tf}.`
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
    return () => {
      vivo = false;
    };
  }, [simbolo, tf, desde, arranque, clave]);

  if (!tf) return VACIO;
  const alDia = datos?.clave === clave;
  return {
    velas: alDia ? datos.velas : [],
    cargando: !alDia && simbolo !== "",
    error: alDia ? datos.error : null,
  };
}
