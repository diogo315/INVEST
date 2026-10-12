"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
  type DeepPartial,
  type ChartOptions,
  type CandlestickSeriesPartialOptions,
} from "lightweight-charts";
import { opcionesDeChart, opcionesDeVelas } from "@/lib/chart/apariencia";
import { useChartStore } from "@/lib/store/chart-store";
import type { Operacion } from "@/lib/backtest/tipos";
import type { Candle } from "@/lib/binance/types";

interface Props {
  /** Solo las velas que el backtest ya "vivió". */
  visibles: Candle[];
  operaciones: Operacion[];
  /** Curva de capital, para el panel de abajo. */
  curva: Array<{ time: number; value: number }>;
}

/** Una marca por entrada y otra por salida, como en un bróker. */
function marcas(ops: Operacion[]): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];
  for (const o of ops) {
    const compra = o.lado === "compra";
    const etiqueta =
      o.instrumento === "activo"
        ? compra
          ? "Compra"
          : "Venta"
        : `${o.instrumento === "call" ? "Call" : "Put"} ${o.strike ?? ""}`;
    out.push({
      time: o.tiempoEntrada as UTCTimestamp,
      position: compra ? "belowBar" : "aboveBar",
      shape: compra ? "arrowUp" : "arrowDown",
      color: compra ? "#26a69a" : "#ef5350",
      text: etiqueta,
    });
    if (o.tiempoSalida !== undefined) {
      out.push({
        time: o.tiempoSalida as UTCTimestamp,
        position: compra ? "aboveBar" : "belowBar",
        shape: "circle",
        color: "#787b86",
        text: o.motivo === "vencimiento" ? "vence" : "cierra",
      });
    }
  }
  return out.sort((a, b) => Number(a.time) - Number(b.time));
}

/**
 * El gráfico del backtest: velas hasta el momento actual, las operaciones
 * marcadas encima, y debajo la curva de capital.
 *
 * Es un chart aparte del principal a propósito. El de la pestaña Gráfico
 * arrastra indicadores, dibujos, replay y multi-panel; acá hace falta algo
 * que solo muestre lo que ya pasó, y mezclarlos habría obligado a poner un
 * "modo backtest" dentro de 3.800 líneas que ya tienen bastante.
 */
export function GraficoBacktest({ visibles, operaciones, curva }: Props) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const velasRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const capitalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const marcasRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const apariencia = useChartStore((s) => s.apariencia);
  const aparienciaRef = useRef(apariencia);
  /** Para encuadrar solo la primera vez que llegan datos. */
  const encuadrado = useRef(false);
  /** Cuántas velas se ven a la vez; el usuario la cambia con el zoom. */
  const ventanaRef = useRef(120);
  /**
   * La curva de capital se escala sobre la corrida entera, no sobre el
   * tramo visible. Si no, al acercarse a un tramo sin operaciones el eje
   * se comprime a unos centavos y la curva se ve plana aunque la cuenta
   * haya ido de 10.000 a 10.350.
   */
  const rangoCurva = useRef<{ min: number; max: number } | null>(null);

  useEffect(() => {
    if (!cajaRef.current) return;
    const vis = opcionesDeChart(aparienciaRef.current);
    const chart = createChart(cajaRef.current, {
      ...vis,
      layout: { ...vis.layout, fontSize: 11 },
      timeScale: { ...vis.timeScale, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      autoSize: true,
    } as DeepPartial<ChartOptions>);

    velasRef.current = chart.addSeries(
      CandlestickSeries,
      opcionesDeVelas(aparienciaRef.current) as CandlestickSeriesPartialOptions,
    );
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      velasRef.current = null;
      capitalRef.current = null;
      marcasRef.current = null;
      encuadrado.current = false;
    };
  }, []);

  // Apariencia: el backtest usa el mismo tema que el gráfico principal.
  useEffect(() => {
    aparienciaRef.current = apariencia;
    chartRef.current?.applyOptions(
      opcionesDeChart(apariencia) as DeepPartial<ChartOptions>,
    );
    velasRef.current?.applyOptions(
      opcionesDeVelas(apariencia) as CandlestickSeriesPartialOptions,
    );
  }, [apariencia]);

  // Velas visibles.
  useEffect(() => {
    const s = velasRef.current;
    if (!s) return;
    s.setData(
      visibles.map((k) => ({
        time: k.time as UTCTimestamp,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      })),
    );
    // La vista sigue al reloj: se conserva el zoom que tenga puesto el
    // usuario (el ancho de la ventana visible) y se desliza para que la
    // última vela quede pegada al borde derecho. Sin esto, al avanzar el
    // backtest las velas nuevas se dibujan fuera de la pantalla.
    const ts = chartRef.current?.timeScale();
    if (!ts || visibles.length === 0) return;
    const rango = ts.getVisibleLogicalRange();
    // Si el usuario cambió el zoom, se adopta su ancho; si el rango es el
    // que pusimos nosotros, se conserva el guardado. El borde derecho se
    // calcula desde el mismo punto que el izquierdo para que el ancho no
    // se vaya agrandando solo en cada avance.
    if (encuadrado.current && rango && rango.to > rango.from) {
      const ancho = rango.to - rango.from;
      if (Math.abs(ancho - ventanaRef.current) > 1) {
        ventanaRef.current = Math.max(10, ancho);
      }
    }
    encuadrado.current = true;
    const borde = visibles.length + 4;
    ts.setVisibleLogicalRange({ from: borde - ventanaRef.current, to: borde });
  }, [visibles]);

  // Marcas de las operaciones.
  useEffect(() => {
    const s = velasRef.current;
    if (!s) return;
    if (!marcasRef.current) marcasRef.current = createSeriesMarkers(s, []);
    marcasRef.current.setMarkers(marcas(operaciones));
  }, [operaciones]);

  // Curva de capital, en su propio panel debajo.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (curva.length === 0) {
      if (capitalRef.current) {
        chart.removeSeries(capitalRef.current);
        capitalRef.current = null;
      }
      return;
    }
    if (!capitalRef.current) {
      const panes = chart.panes();
      if (panes.length < 2) chart.addPane();
      capitalRef.current = chart.addSeries(
        LineSeries,
        {
          color: "#2962ff",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: "Capital",
          autoscaleInfoProvider: () => {
            const r = rangoCurva.current;
            if (!r) return null;
            const margen = Math.max(1, (r.max - r.min) * 0.1);
            return {
              priceRange: { minValue: r.min - margen, maxValue: r.max + margen },
            };
          },
        },
        1,
      );
      chart.panes()[0]?.setStretchFactor(3);
      chart.panes()[1]?.setStretchFactor(1);
    }
    const valores = curva.map((p) => p.value);
    rangoCurva.current = {
      min: Math.min(...valores),
      max: Math.max(...valores),
    };
    capitalRef.current.setData(
      curva.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );
  }, [curva]);

  return <div ref={cajaRef} className="h-full w-full" />;
}
