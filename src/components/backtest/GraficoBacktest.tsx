"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  CandlestickSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Logical,
  type Time,
  type UTCTimestamp,
  type DeepPartial,
  type ChartOptions,
  type CandlestickSeriesPartialOptions,
} from "lightweight-charts";
import { BaselineSeries, HistogramSeries } from "lightweight-charts";
import { opcionesDeChart, opcionesDeVelas } from "@/lib/chart/apariencia";
import { tickMarkFormatter, timeFormatter, zonaDelEje } from "@/lib/chart/timezone";
import { BandFill } from "@/lib/chart/band-fill";
import { useChartStore } from "@/lib/store/chart-store";
import { CONFIG_BT, indicadorPorClave } from "@/lib/backtest/indicadores";
import type { MediaMovil } from "@/lib/chart/medias";
import type { SerieSpec } from "@/lib/chart/indicadores-nuevos";
import { indiceDeTiempo } from "@/lib/dibujos/coordenadas";
import type { Operacion } from "@/lib/backtest/tipos";
import type { Candle } from "@/lib/binance/types";

interface Props {
  /** Fecha de arranque: lo anterior es historia para los indicadores. */
  desde: number;
  /** Solo las velas que el backtest ya "vivió". */
  visibles: Candle[];
  operaciones: Operacion[];
  /** Curva de capital, para el panel de abajo. */
  curva: Array<{ time: number; value: number }>;
  /** Claves de los indicadores encendidos. */
  indicadores: string[];
  /** Medias móviles configuradas: cuántas, de qué tipo y de qué color. */
  medias: MediaMovil[];
  /** Vencimientos de las opciones abiertas, para marcarlos en el futuro. */
  vencimientos: Array<{ time: number; etiqueta: string }>;
  /** Zona horaria con la que se escriben las fechas del eje y la cruz. */
  zona: string;
  /** Temporalidad de ESTA gráfica: decide si la zona aplica (ver `zonaDelEje`). */
  temporalidad: string;
}

/** Lo que hay montado de un indicador, para poder quitarlo después. */
interface Montado {
  series: Map<string, ISeriesApi<"Line" | "Histogram" | "Baseline">>;
  relleno?: BandFill;
  pane: number | null;
  /**
   * Qué series tenía montadas, resumido en un texto.
   *
   * Las medias cambian de cantidad y de color cuando el usuario las
   * edita: si la firma no coincide con la actual hay que rehacer las
   * series, porque `setData` no puede inventar una línea que no existe.
   */
  firma: string;
}

/** Resumen de un juego de series, para detectar si cambió. */
function firmaDe(specs: SerieSpec[]): string {
  return specs
    .map(
      (s) =>
        `${s.clave}:${s.forma}:${s.color}:${s.grosor ?? 1}:${s.estilo ?? 0}:${
          s.area ? `${s.area.lineaArriba}/${s.area.lineaAbajo}` : "-"
        }`,
    )
    .join("|");
}

/**
 * Una marca por entrada y otra por salida, como en un bróker, más una que
 * señala dónde empieza el backtest: todo lo que queda a la izquierda es
 * historia para alimentar los indicadores, no terreno donde se operó.
 */
function marcas(
  ops: Operacion[],
  desde: number,
  velas: Candle[],
): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];
  const primeraDelBacktest = velas.find((k) => k.time >= desde);
  if (primeraDelBacktest) {
    out.push({
      time: primeraDelBacktest.time as UTCTimestamp,
      position: "aboveBar",
      shape: "arrowDown",
      color: "#2962ff",
      text: "inicio",
    });
  }
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
export function GraficoBacktest({
  desde,
  visibles,
  operaciones,
  curva,
  indicadores,
  medias,
  vencimientos,
  zona,
  temporalidad,
}: Props) {
  const zonaEje = zonaDelEje(zona, temporalidad);
  const cajaRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const velasRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const capitalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const marcasRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const apariencia = useChartStore((s) => s.apariencia);
  const aparienciaRef = useRef(apariencia);
  /**
   * La zona se lee por ref al crear el gráfico, igual que la apariencia:
   * el chart se crea una sola vez y cambiar de zona no puede rehacerlo.
   */
  const zonaRef = useRef(zonaEje);
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
  /** Indicadores montados ahora mismo, por clave. */
  const montados = useRef<Map<string, Montado>>(new Map());
  /** La capa con las líneas de vencimiento. */
  const capaRef = useRef<HTMLDivElement>(null);
  /** Las velas visibles, para poder ubicar fechas desde una suscripción. */
  const visiblesRef = useRef<Candle[]>([]);

  /**
   * Reparte el alto entre los paneles.
   *
   * En un solo lugar a propósito: antes lo tocaban dos efectos distintos
   * —el de la curva de capital y el de los indicadores— y cada uno daba
   * por sentado un orden de paneles. Con dos gráficas ese orden cambia
   * según cuál se monte primero, y el resultado era un Cipher de treinta
   * píxeles. Acá el índice de cada panel se PREGUNTA (`getPane()`), no se
   * supone.
   *
   * El precio pesa 4; cada indicador, lo que pida (1 salvo el Cipher, que
   * pide 2); el capital, 1.
   */
  const repartirAlto = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const factor = new Map<number, number>();
    for (const [clave, m] of montados.current) {
      const serie = m.series.values().next().value;
      if (!serie) continue;
      try {
        factor.set(serie.getPane().paneIndex(), indicadorPorClave(clave)?.alto ?? 1);
      } catch {}
    }
    for (const [i, p] of chart.panes().entries()) {
      p.setStretchFactor(i === 0 ? 4 : (factor.get(i) ?? 1));
    }
  }, []);

  /**
   * Pone cada línea de vencimiento en su sitio.
   *
   * `logicalToCoordinate` sí sabe ubicar una fecha que todavía no tiene
   * vela: trabaja con la posición continua en la escala. `timeToCoordinate`
   * devolvería null para el futuro y no se dibujaría nada.
   */
  const colocarVenc = useCallback(() => {
    const chart = chartRef.current;
    const capa = capaRef.current;
    if (!chart || !capa) return;
    const ts = chart.timeScale();
    const velas = visiblesRef.current;
    const n = velas.length;

    // `logicalToCoordinate` NO extrapola: para un índice más allá de la
    // última vela devuelve 0, no la posición que correspondería. Medido.
    // Como el eje es lineal en píxeles, se saca el ancho de una vela con
    // dos puntos que sí sabe convertir y se extiende desde el último.
    const xIni = n > 1 ? ts.logicalToCoordinate(0 as Logical) : null;
    const xFin = n > 1 ? ts.logicalToCoordinate((n - 1) as Logical) : null;
    const ancho = capa.clientWidth;
    const paso =
      xIni === null || xFin === null ? 0 : (Number(xFin) - Number(xIni)) / (n - 1);

    for (const nodo of Array.from(capa.children) as HTMLElement[]) {
      const t = Number(nodo.dataset.venc);
      if (!Number.isFinite(t) || paso <= 0 || xFin === null) {
        nodo.style.display = "none";
        continue;
      }
      const x = Number(xFin) + (indiceDeTiempo(velas, t) - (n - 1)) * paso;
      // Fuera de la vista no se dibuja: si no, el nodo se sale del ancho
      // y empuja la página.
      if (x < 0 || x > ancho) {
        nodo.style.display = "none";
        continue;
      }
      nodo.style.display = "";
      nodo.style.left = `${x}px`;
      // La línea suele quedar pegada al borde derecho —es el futuro—, y
      // ahí la etiqueta se cortaría: se pasa al otro lado de la línea.
      const etiqueta = nodo.firstElementChild as HTMLElement | null;
      if (etiqueta) {
        const pegada = x > ancho - 110;
        etiqueta.style.left = pegada ? "auto" : "4px";
        etiqueta.style.right = pegada ? "4px" : "auto";
      }
    }
  }, []);

  useEffect(() => {
    if (!cajaRef.current) return;
    const vis = opcionesDeChart(aparienciaRef.current);
    const chart = createChart(cajaRef.current, {
      ...vis,
      layout: { ...vis.layout, fontSize: 11 },
      timeScale: {
        ...vis.timeScale,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        tickMarkFormatter: tickMarkFormatter(zonaRef.current),
      },
      localization: { timeFormatter: timeFormatter(zonaRef.current) },
      autoSize: true,
    } as DeepPartial<ChartOptions>);

    velasRef.current = chart.addSeries(
      CandlestickSeries,
      opcionesDeVelas(aparienciaRef.current) as CandlestickSeriesPartialOptions,
    );
    chartRef.current = chart;
    // Las líneas de vencimiento se dibujan en HTML encima del lienzo, así
    // que hay que recolocarlas cada vez que el gráfico se mueve o se
    // acerca. No es setState dentro del efecto: es una suscripción.
    const alMover = () => colocarVenc();
    chart.timeScale().subscribeVisibleLogicalRangeChange(alMover);
    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(alMover);
      chart.remove();
      chartRef.current = null;
      velasRef.current = null;
      capitalRef.current = null;
      marcasRef.current = null;
      montados.current.clear();
      encuadrado.current = false;
    };
  }, [colocarVenc]);

  // Zona horaria: solo reformatea etiquetas. NO toca ni un dato, que es
  // lo que hay que cuidar: mover los timestamps correría las velas y los
  // indicadores calcularían sobre otra cosa.
  useEffect(() => {
    zonaRef.current = zonaEje;
    chartRef.current?.applyOptions({
      timeScale: { tickMarkFormatter: tickMarkFormatter(zonaEje) },
      localization: { timeFormatter: timeFormatter(zonaEje) },
    } as DeepPartial<ChartOptions>);
  }, [zonaEje]);

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
    // Si hay una opción abierta, la vista llega hasta su vencimiento aunque
    // todavía no existan esas velas: el hueco a la derecha es justamente
    // el tiempo que le queda al contrato.
    const masLejos = vencimientos.reduce(
      (max, v) => Math.max(max, indiceDeTiempo(visibles, v.time)),
      -Infinity,
    );
    const borde = Math.max(
      visibles.length + 4,
      Number.isFinite(masLejos) ? masLejos + 3 : 0,
    );
    ts.setVisibleLogicalRange({ from: borde - ventanaRef.current, to: borde });
    visiblesRef.current = visibles;
    colocarVenc();
  }, [visibles, vencimientos, colocarVenc]);

  // Marcas de las operaciones.
  useEffect(() => {
    const s = velasRef.current;
    if (!s) return;
    if (!marcasRef.current) marcasRef.current = createSeriesMarkers(s, []);
    marcasRef.current.setMarkers(marcas(operaciones, desde, visibles));
  }, [operaciones, desde, visibles]);

  // Curva de capital, en su propio panel debajo.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (curva.length === 0) {
      if (capitalRef.current) {
        // `removeSeries` ya se lleva el panel cuando queda vacío (es el
        // comportamiento por defecto; `addPane(true)` sirve justamente
        // para evitarlo). Llamar además a `removePane` con el índice que
        // tenía borraba el panel del indicador de al lado: los índices se
        // corrieron en cuanto desapareció este. Medido: la gráfica que no
        // mandaba el reproductor se quedaba sin su RSI.
        chart.removeSeries(capitalRef.current);
        capitalRef.current = null;
        repartirAlto();
      }
      return;
    }
    if (!capitalRef.current) {
      // Su propio panel, SIEMPRE, y movido justo debajo del precio.
      //
      // Antes se metía a mano en el panel 1 dando por hecho que ese era el
      // suyo. Con dos gráficas el orden en que se montan los indicadores
      // cambia, y el panel 1 podía ser el de un indicador: la curva de
      // capital terminaba dentro del Cipher y los altos salían cualquier
      // cosa. Ahora el índice se pregunta, no se adivina.
      const panel = chart.addPane();
      panel.moveTo(1);
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
        panel.paneIndex(),
      );
      repartirAlto();
    }
    const valores = curva.map((p) => p.value);
    rangoCurva.current = {
      min: Math.min(...valores),
      max: Math.max(...valores),
    };
    capitalRef.current.setData(
      curva.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );
  }, [curva, repartirAlto]);

  /**
   * Indicadores: un solo bloque genérico para todos.
   *
   * Monta y desmonta según la lista encendida, y recalcula con las velas
   * VISIBLES —nunca con la serie completa—, que es lo que impide que un
   * indicador mire el futuro y arruine el backtest.
   */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Lo que se apagó: fuera.
    for (const [clave, m] of montados.current) {
      if (indicadores.includes(clave)) continue;
      for (const s of m.series.values()) {
        try {
          chart.removeSeries(s);
        } catch {}
      }
      montados.current.delete(clave);
      repartirAlto();
    }

    for (const clave of indicadores) {
      const def = indicadorPorClave(clave);
      if (!def) continue;
      const specs = def.seriesDe ? def.seriesDe(medias) : def.series;
      const firma = firmaDe(specs);
      let m = montados.current.get(clave);

      // Cambió la configuración: se desmonta y se vuelve a armar.
      if (m && m.firma !== firma) {
        for (const s of m.series.values()) {
          try {
            chart.removeSeries(s);
          } catch {}
        }
        montados.current.delete(clave);
        m = undefined;
      }

      if (!m) {
        // Los que llevan panel propio van después del de capital.
        let pane: number | null = null;
        if (def.conPanel) {
          pane = chart.panes().length;
          chart.addPane();
        }
        const series = new Map<string, ISeriesApi<"Line" | "Histogram" | "Baseline">>();
        // El panel no puede encogerse más que el rango que pida el
        // indicador. Se cuelga de la primera serie: alcanza con una, el
        // autoescalado del panel es la unión de todas.
        let faltaRango = def.rango !== undefined;
        for (const spec of specs) {
          const comun = {
            color: spec.color,
            lineWidth: (spec.grosor ?? 1) as 1 | 2,
            lineStyle: spec.estilo ?? 0,
            priceLineVisible: false,
            lastValueVisible: false,
          };
          const rango =
            faltaRango && def.rango
              ? {
                  autoscaleInfoProvider: (
                    original: () => {
                      priceRange: { minValue: number; maxValue: number } | null;
                    } | null,
                  ) => {
                    const base = original()?.priceRange;
                    return {
                      priceRange: {
                        minValue: Math.min(base?.minValue ?? 0, def.rango!.min),
                        maxValue: Math.max(base?.maxValue ?? 0, def.rango!.max),
                      },
                    };
                  },
                }
              : {};
          let s: ISeriesApi<"Line" | "Histogram" | "Baseline">;
          if (spec.forma === "histograma") {
            s = chart.addSeries(
              HistogramSeries,
              {
                color: spec.color,
                priceLineVisible: false,
                lastValueVisible: false,
                ...rango,
              },
              pane ?? 0,
            );
          } else if (spec.forma === "area" && spec.area) {
            // Onda que cruza el cero: relleno distinto arriba y abajo, que
            // es como se dibuja el Cipher B en el gráfico principal.
            s = chart.addSeries(
              BaselineSeries,
              {
                baseValue: { type: "price" as const, price: 0 },
                topFillColor1: spec.area.arriba[0],
                topFillColor2: spec.area.arriba[1],
                topLineColor: spec.area.lineaArriba,
                bottomFillColor1: spec.area.abajo[0],
                bottomFillColor2: spec.area.abajo[1],
                bottomLineColor: spec.area.lineaAbajo,
                lineWidth: (spec.grosor ?? 1) as 1 | 2,
                priceLineVisible: false,
                lastValueVisible: false,
                ...rango,
              },
              pane ?? 0,
            );
          } else {
            s = chart.addSeries(
              LineSeries,
              // Los "puntos" son una línea sin unir: se dibujan con
              // grosor y sin continuidad visible entre huecos.
              spec.forma === "puntos"
                ? {
                    ...comun,
                    lineWidth: 1 as const,
                    pointMarkersVisible: true,
                    pointMarkersRadius: spec.radio ?? (spec.grosor === 2 ? 4 : 2),
                    lineVisible: false,
                    ...rango,
                  }
                : { ...comun, ...rango },
              pane ?? 0,
            );
          }
          faltaRango = false;
          series.set(spec.clave, s);
        }
        m = { series, pane, firma };
        if (def.relleno) {
          const arriba = series.get(def.relleno.arriba);
          const abajo = series.get(def.relleno.abajo);
          if (arriba && abajo) {
            const f = new BandFill(chart, arriba as ISeriesApi<"Line">, def.relleno.color);
            arriba.attachPrimitive(f);
            m.relleno = f;
          }
        }
        montados.current.set(clave, m);
        repartirAlto();
      }

      const datos = def.calcular(visibles, CONFIG_BT, medias);
      for (const [key, s] of m.series) {
        const pts = datos[key] ?? [];
        s.setData(
          pts.map((p) => ({
            time: p.time as UTCTimestamp,
            value: p.value as number,
            ...(p.color ? { color: p.color } : {}),
          })),
        );
      }
      if (m.relleno && def.relleno) {
        // El relleno se arma emparejando las dos series por fecha: si una
        // arranca más tarde que la otra, se pinta solo donde hay ambas.
        const arriba = datos[def.relleno.arriba] ?? [];
        const abajo = new Map(
          (datos[def.relleno.abajo] ?? []).map((p) => [p.time, p.value]),
        );
        m.relleno.setData(
          arriba
            .filter((p) => p.value !== undefined && abajo.get(p.time) !== undefined)
            .map((p) => ({
              time: p.time,
              upper: p.value as number,
              lower: abajo.get(p.time) as number,
            })),
        );
      }
    }
  }, [indicadores, visibles, medias, repartirAlto]);

  return (
    <div className="relative h-full w-full">
      <div ref={cajaRef} className="h-full w-full" />
      {/* Las líneas de vencimiento se colocan a mano desde `colocarVenc`,
          no con un `style` calculado al renderizar: leer el gráfico en
          pleno render no está permitido, y moverlas por DOM evita además
          volver a renderizar en cada arrastre. */}
      <div ref={capaRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
        {vencimientos.map((v) => (
          <div
            key={v.time}
            aria-hidden
            data-venc={v.time}
            className="absolute top-0 h-full border-l border-dashed border-tv-yellow/70"
            style={{ left: -9999 }}
          >
            <span className="absolute left-1 top-1 whitespace-nowrap rounded bg-tv-panel/90 px-1 py-0.5 font-mono text-[10px] text-tv-yellow ring-1 ring-tv-border">
              {v.etiqueta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
