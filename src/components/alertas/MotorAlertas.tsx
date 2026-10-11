"use client";

import { useEffect, useMemo, useRef } from "react";
import { getAdapter, parseSymbol, ADAPTERS } from "@/lib/exchanges";
import type { ExchangeId } from "@/lib/exchanges/types";
import type { Timeframe } from "@/lib/binance/types";
import { notificar, pitido, valoresDe, velasNecesarias } from "@/lib/alertas/motor";
import { seDispara, textoDisparo, type Alerta } from "@/lib/alertas/tipos";
import { useChartStore } from "@/lib/store/chart-store";

/** Cada cuánto se recalculan las alertas de indicador. */
const CADA_MS = 30_000;
/** Cada cuánto se consulta el precio por si el WebSocket no llega. */
const SONDEO_PRECIO_MS = 15_000;

/**
 * Vigila las alertas mientras la app está abierta. No dibuja nada.
 *
 * Dos caminos distintos a propósito:
 *
 *  · **precio** — por el mismo WebSocket de precios que usa la lista de la
 *    derecha. Es instantáneo y gratis. (Antes esto salía de las velas
 *    cacheadas y no saltaba: la caché de velas de 15m dura 5 minutos, así
 *    que el motor veía el precio viejo.)
 *
 *  · **indicadores** — recalculando cada 30 segundos con velas frescas
 *    pedidas al exchange. Un RSI de 15m no cambia entre medio.
 *
 * El valor **anterior** de cada alerta vive en memoria, no en el store: un
 * cruce se define contra la lectura previa, y guardarlo haría que al abrir
 * la app saltaran cruces viejos.
 */
export function MotorAlertas() {
  const alertas = useChartStore((s) => s.alertas);
  const registrarDisparo = useChartStore((s) => s.registrarDisparo);

  const registrarRef = useRef(registrarDisparo);
  const previos = useRef<Map<string, number>>(new Map());
  const alertasRef = useRef(alertas);

  // Las copias en ref se refrescan después de cada render, no durante: los
  // suscriptores las leen cuando llega un precio, siempre después.
  useEffect(() => {
    alertasRef.current = alertas;
    registrarRef.current = registrarDisparo;
  });

  /** Avisa: deja el disparo guardado, suena y notifica. */
  const avisar = useRef((a: Alerta, valor: number) => {
    const texto = textoDisparo(a, valor);
    registrarRef.current(a.id, texto);
    if (a.sonido) pitido();
    notificar("TradingView Gratis", texto);
  });

  // ── alertas de precio: en vivo ────────────────────────────────────
  // La clave agrupa los activos vigilados; mientras no cambie, no se
  // vuelven a abrir los WebSockets.
  const simbolosPrecio = useMemo(() => {
    const s = alertas
      .filter((a) => a.activa && a.fuente === "precio")
      .map((a) => a.simbolo);
    return [...new Set(s)].sort().join(",");
  }, [alertas]);

  useEffect(() => {
    if (!simbolosPrecio) return;
    const porExchange = new Map<ExchangeId, string[]>();
    for (const q of simbolosPrecio.split(",")) {
      const { exchange, symbol } = parseSymbol(q);
      const lista = porExchange.get(exchange);
      if (lista) lista.push(symbol);
      else porExchange.set(exchange, [symbol]);
    }

    /** Un precio nuevo para un activo: se evalúan sus alertas de precio. */
    const mirar = (qualified: string, precio: number) => {
      for (const a of alertasRef.current) {
        if (!a.activa || a.fuente !== "precio" || a.simbolo !== qualified) continue;
        const previo = previos.current.get(a.id);
        previos.current.set(a.id, precio);
        if (seDispara(a, previo, precio)) avisar.current(a, precio);
      }
    };

    const bajas: Array<() => void> = [];
    let cancelado = false;

    for (const [exId, syms] of porExchange) {
      const adapter = ADAPTERS[exId];
      if (!adapter) continue;
      bajas.push(
        adapter.subscribeMiniTickers(syms, (tick) =>
          mirar(`${exId}:${tick.symbol}`, tick.close),
        ),
      );
    }

    // Respaldo: si el WebSocket no conecta (red del trabajo, proxy, el
    // exchange caído) las alertas quedarían mudas sin que nada lo diga.
    // Este sondeo las mantiene vivas aunque el socket no llegue nunca.
    const sondear = () => {
      for (const [exId, syms] of porExchange) {
        const adapter = ADAPTERS[exId];
        if (!adapter) continue;
        adapter
          .fetchTickers24h(syms)
          .then((tickers) => {
            if (cancelado) return;
            for (const t of tickers) mirar(`${exId}:${t.symbol}`, t.lastPrice);
          })
          .catch(() => {});
      }
    };
    sondear();
    const id = window.setInterval(sondear, SONDEO_PRECIO_MS);

    return () => {
      cancelado = true;
      window.clearInterval(id);
      for (const baja of bajas) {
        try {
          baja();
        } catch {
          // El socket ya se cerró: no es un problema.
        }
      }
    };
  }, [simbolosPrecio]);

  // ── alertas de indicador: recalculadas cada tanto ─────────────────
  useEffect(() => {
    let cancelado = false;

    async function revisar() {
      const activas = alertasRef.current.filter(
        (a) => a.activa && a.fuente !== "precio",
      );
      if (activas.length === 0) return;

      // Agrupadas por activo + temporalidad: un solo pedido para todas las
      // alertas que miran lo mismo.
      const grupos = new Map<string, Alerta[]>();
      for (const a of activas) {
        const clave = `${a.simbolo}|${a.timeframe}`;
        const g = grupos.get(clave);
        if (g) g.push(a);
        else grupos.set(clave, [a]);
      }

      await Promise.all(
        [...grupos.entries()].map(async ([clave, delGrupo]) => {
          const [simbolo, timeframe] = clave.split("|");
          const cuantas = Math.max(...delGrupo.map(velasNecesarias));
          const { adapter, symbol: raw } = getAdapter(simbolo);
          let velas;
          try {
            // Directo al exchange, sin la caché compartida: esa caché dura
            // minutos y es justo lo que hace falta que NO pase acá.
            velas = await adapter.fetchKlines(
              raw,
              timeframe as Timeframe,
              Math.min(500, cuantas),
            );
          } catch {
            return; // no respondió: se reintenta en la próxima vuelta
          }
          if (cancelado || velas.length < 2) return;

          for (const a of delGrupo) {
            const { anterior, actual } = valoresDe(a, velas);
            if (actual === undefined) continue;
            // La última lectura propia gana a la de las velas: entre dos
            // revisiones puede haber pasado más de una vela.
            const previo = previos.current.get(a.id) ?? anterior;
            previos.current.set(a.id, actual);
            if (seDispara(a, previo, actual)) avisar.current(a, actual);
          }
        }),
      );
    }

    // Una primera pasada al montar toma la lectura inicial de cada alerta
    // (que, al no tener previa, nunca dispara un cruce).
    revisar();
    const id = window.setInterval(revisar, CADA_MS);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, []);

  // Una alerta borrada no deja su lectura previa colgada.
  useEffect(() => {
    const vivas = new Set(alertas.map((a) => a.id));
    for (const id of previos.current.keys()) {
      if (!vivas.has(id)) previos.current.delete(id);
    }
  }, [alertas]);

  return null;
}
