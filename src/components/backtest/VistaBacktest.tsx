"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { Columns2, Square } from "lucide-react";
import { BarraPanel } from "./BarraPanel";
import { PanelOperar } from "./PanelOperar";
import { Operaciones } from "./Operaciones";
import { useVelas } from "./useVelas";
import {
  indiceHasta,
  precioContrato,
  volRealizada,
} from "@/lib/backtest/cadena";
import {
  curvaDeCapital,
  precioDe as precioDeOp,
  resumir,
  type Operacion,
} from "@/lib/backtest/tipos";
import {
  HISTORIAS,
  VELOCIDADES,
  backtestActivo,
  useBacktestStore,
} from "@/lib/store/backtest-store";
import { velasDelPanel } from "@/lib/backtest/multi";
import { parseSymbol } from "@/lib/exchanges";
import { TIMEFRAME_SECONDS, type Timeframe } from "@/lib/binance/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/** El backtest corriendo: gráfico, reloj, panel de operar y resultados. */
export function VistaBacktest() {
  const bt = useBacktestStore(backtestActivo);
  const abrir = useBacktestStore((s) => s.abrir);
  const setTiempo = useBacktestStore((s) => s.setTiempo);
  const setTemporalidad = useBacktestStore((s) => s.setTemporalidad);
  const reproduciendo = useBacktestStore((s) => s.reproduciendo);
  const reproducir = useBacktestStore((s) => s.reproducir);
  const velocidad = useBacktestStore((s) => s.velocidad);
  const setVelocidad = useBacktestStore((s) => s.setVelocidad);
  const operar = useBacktestStore((s) => s.operar);
  const cerrarOp = useBacktestStore((s) => s.cerrar);
  const liquidarVencidas = useBacktestStore((s) => s.liquidarVencidas);
  const alternarIndicador = useBacktestStore((s) => s.alternarIndicador);
  const setHistoria = useBacktestStore((s) => s.setHistoria);
  const setMedias = useBacktestStore((s) => s.setMedias);
  const setSegunda = useBacktestStore((s) => s.setSegunda);
  const setBase = useBacktestStore((s) => s.setBase);

  const simbolo = bt?.simbolo ?? "";
  const desde = bt?.desde ?? 0;
  const historia = bt?.historiaPrevia ?? 365;

  // ── las dos gráficas ────────────────────────────────────────────────
  //
  // El panel A son los campos de siempre del backtest; el B, un objeto
  // aparte que puede no estar. `base` dice cuál manda el reproductor, y
  // nunca puede ser "b" sin panel B.
  const panelB = bt?.panelB ?? null;
  const base: "a" | "b" = panelB && bt?.base === "b" ? "b" : "a";
  const tfA = (bt?.temporalidad ?? "1d") as Timeframe;
  const tfB = (panelB?.temporalidad ?? "1d") as Timeframe;

  const a = useVelas(simbolo, tfA, desde, historia);
  const b = useVelas(simbolo, panelB ? tfB : null, desde, historia);

  const tfBase = base === "a" ? tfA : tfB;
  const velas = base === "a" ? a.velas : b.velas;
  const error = a.error ?? b.error;

  // ── el momento actual ───────────────────────────────────────────────
  const tiempo = bt?.tiempoActual ?? 0;
  const idx = useMemo(() => indiceHasta(velas, tiempo), [velas, tiempo]);
  const segBase = TIMEFRAME_SECONDS[tfBase];
  /**
   * Lo que puede mostrar cada gráfica sin enseñar el futuro.
   *
   * Para la base es exactamente lo de siempre (hasta la vela del reloj,
   * inclusive). Para la otra depende de su temporalidad: ver `multi.ts`,
   * que es donde está explicado y probado.
   */
  const fuente = useMemo(() => ({ velas, segundos: segBase }), [velas, segBase]);
  const visibles = useMemo(
    () => velasDelPanel(a.velas, TIMEFRAME_SECONDS[tfA], tiempo, fuente),
    [a.velas, tfA, tiempo, fuente],
  );
  const visiblesB = useMemo(
    () => (panelB ? velasDelPanel(b.velas, TIMEFRAME_SECONDS[tfB], tiempo, fuente) : []),
    [panelB, b.velas, tfB, tiempo, fuente],
  );
  const visiblesBase = base === "a" ? visibles : visiblesB;
  const precio = visiblesBase.at(-1)?.close ?? 0;
  const vol = useMemo(
    () => volRealizada(velas, tiempo, 20, segBase),
    [velas, tiempo, segBase],
  );
  const ultimo = velas.length - 1;
  /**
   * Primera vela del backtest. Todo lo anterior es historia previa: se ve
   * y alimenta a los indicadores, pero el reproductor no entra ahí porque
   * no hay nada que decidir antes de empezar.
   */
  const idxInicio = useMemo(() => indiceHasta(velas, desde), [velas, desde]);
  const alFinal = idx >= ultimo;

  /** Precio del instrumento de una operación, ahora mismo. */
  const precioAhora = useCallback(
    (op: Operacion) => precioDeOp(op, precio, tiempo, vol),
    [precio, tiempo, vol],
  );

  /**
   * Vencimientos de las opciones que siguen abiertas, sin repetir.
   *
   * Solo las abiertas: una vencida ya no es información, es historia, y
   * dejar su línea en el gráfico sería ruido.
   */
  const vencimientos = useMemo(() => {
    if (!bt) return [];
    const vistos = new Map<number, string>();
    for (const o of bt.operaciones) {
      if (o.precioSalida !== undefined || o.instrumento === "activo") continue;
      if (o.vencimiento === undefined) continue;
      const dias = Math.max(0, Math.round((o.vencimiento - tiempo) / 86400));
      vistos.set(
        o.vencimiento,
        `vence ${new Date(o.vencimiento * 1000).toISOString().slice(5, 10)} · ${dias} d`,
      );
    }
    return [...vistos].map(([time, etiqueta]) => ({ time, etiqueta }));
  }, [bt, tiempo]);

  const resumen = useMemo(() => {
    if (!bt) return null;
    const curva = curvaDeCapital(bt, visiblesBase, () => vol);
    return {
      r: resumir(bt, precioAhora, curva.map((p) => p.value)),
      curva,
    };
  }, [bt, visiblesBase, vol, precioAhora]);

  // ── liquidar lo vencido al avanzar ──────────────────────────────────
  // Una opción vencida deja de existir: si no se liquidara, seguiría
  // figurando como abierta y el capital sería mentira.
  useEffect(() => {
    if (!bt || velas.length === 0) return;
    const hayVencidas = bt.operaciones.some(
      (o) =>
        o.precioSalida === undefined &&
        o.instrumento !== "activo" &&
        o.vencimiento !== undefined &&
        o.vencimiento <= tiempo,
    );
    if (!hayVencidas) return;
    liquidarVencidas(tiempo, (o) => {
      const i = indiceHasta(velas, o.vencimiento ?? tiempo);
      const s = velas[i]?.close ?? precio;
      return precioContrato(
        s,
        o.strike ?? s,
        o.instrumento === "put" ? "put" : "call",
        o.vencimiento ?? tiempo,
        o.vencimiento ?? tiempo,
        vol,
      ).prima;
    });
  }, [bt, tiempo, velas, vol, precio, liquidarVencidas]);

  // ── reproducción ────────────────────────────────────────────────────
  const avanzar = useCallback(
    (n: number) => {
      if (velas.length === 0) return;
      const destino = Math.min(ultimo, Math.max(idxInicio, idx + n));
      if (destino === idx) {
        if (n > 0) reproducir(false);
        return;
      }
      setTiempo(velas[destino].time);
      if (destino >= ultimo) reproducir(false);
    },
    [velas, idx, ultimo, idxInicio, setTiempo, reproducir],
  );

  // El temporizador lee la última versión de `avanzar` por una ref: si
  // dependiera de ella, se reiniciaría en cada vela y el ritmo saldría
  // irregular.
  const avanzarRef = useRef(avanzar);
  useEffect(() => {
    avanzarRef.current = avanzar;
  }, [avanzar]);

  useEffect(() => {
    if (!reproduciendo) return;
    const id = setInterval(() => avanzarRef.current(1), 1000 / velocidad);
    return () => clearInterval(id);
  }, [reproduciendo, velocidad]);

  if (!bt) return null;

  const { symbol, exchange } = parseSymbol(bt.simbolo);
  const permiteOpciones = exchange === "ALP";
  const r = resumen?.r;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── cabecera ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-tv-border bg-tv-panel px-3 py-2">
        <button
          onClick={() => abrir(null)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Backtests
        </button>
        <span className="text-sm font-semibold text-tv-text">{symbol}</span>
        <span className="text-xs text-tv-text-muted">{bt.nombre}</span>
        {/* Los controles de cada gráfica (temporalidad, indicadores,
            medias) viven ARRIBA DE SU GRÁFICA, no acá: con dos paneles,
            dos juegos de controles en la misma cabecera no dejarían ver
            cuál es cuál. */}
        <button
          onClick={() => setSegunda(!panelB)}
          title={
            panelB
              ? "Volver a una sola gráfica"
              : "Agregar una segunda gráfica con otra temporalidad"
          }
          aria-pressed={!!panelB}
          className={cn(
            "ml-2 flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors",
            panelB
              ? "bg-tv-panel-hover text-tv-text"
              : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
          )}
        >
          {panelB ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Columns2 className="h-3.5 w-3.5" />
          )}
          {panelB ? "Una gráfica" : "Dos gráficas"}
        </button>
        <label className="flex items-center gap-1.5 text-[11px] text-tv-text-muted">
          <span className="hidden sm:inline">Historia previa</span>
          <select
            value={historia}
            onChange={(e) => setHistoria(Number(e.target.value))}
            title="Velas anteriores al arranque, para que los indicadores lleguen calculados"
            className="rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 text-[11px] text-tv-text"
          >
            {HISTORIAS.map((h) => (
              <option key={h.dias} value={h.dias}>
                {h.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto font-mono text-xs tabular-nums text-tv-text">
          {new Date(tiempo * 1000).toISOString().slice(0, 16).replace("T", " ")}
          {precio > 0 && (
            <span className="ml-3 text-tv-text-muted">{formatPrice(precio)}</span>
          )}
        </span>
      </div>

      {/* ── cuerpo ───────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Las gráficas, lado a lado. La curva de capital va SOLO en la
            base: sus puntos están en las fechas de las velas de la base, y
            en la otra temporalidad no caerían donde corresponde. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
          <BarraPanel
            panel="a"
            temporalidad={bt.temporalidad}
            indicadores={bt.indicadores ?? []}
            medias={bt.medias ?? []}
            esBase={base === "a"}
            hayDos={!!panelB}
            cargando={a.cargando}
            desde={desde}
            visibles={visibles}
            operaciones={bt.operaciones}
            curva={base === "a" ? (resumen?.curva ?? []) : []}
            vencimientos={vencimientos}
            onTemporalidad={setTemporalidad}
            onAlternar={alternarIndicador}
            onMedias={setMedias}
            onBase={setBase}
          />
          {panelB && (
            <div className="border-t border-tv-border lg:border-l lg:border-t-0" />
          )}
          {panelB && (
            <BarraPanel
              panel="b"
              temporalidad={panelB.temporalidad}
              indicadores={panelB.indicadores ?? []}
              medias={panelB.medias ?? []}
              esBase={base === "b"}
              hayDos
              cargando={b.cargando}
              desde={desde}
              visibles={visiblesB}
              operaciones={bt.operaciones}
              curva={base === "b" ? (resumen?.curva ?? []) : []}
              vencimientos={vencimientos}
              onTemporalidad={setTemporalidad}
              onAlternar={alternarIndicador}
              onMedias={setMedias}
              onBase={setBase}
            />
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col border-t border-tv-border bg-tv-panel lg:w-96 lg:border-l lg:border-t-0">
          <PanelOperar
            precio={precio}
            tiempo={tiempo}
            vol={vol}
            efectivo={r?.efectivo ?? bt.capitalInicial}
            permiteOpciones={permiteOpciones}
            onOperar={operar}
          />
          {r && (
            <Operaciones
              operaciones={bt.operaciones}
              resumen={r}
              capitalInicial={bt.capitalInicial}
              precioDe={precioAhora}
              onCerrar={(op) => cerrarOp(op.id, precioAhora(op), tiempo)}
            />
          )}
        </aside>
      </div>

      {/* ── barra de reproducción ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-tv-border bg-tv-panel px-3 py-2">
        <button
          onClick={() => reproducir(!reproduciendo)}
          disabled={alFinal || velas.length === 0}
          title={reproduciendo ? "Pausar" : "Reproducir"}
          aria-label={reproduciendo ? "Pausar" : "Reproducir"}
          className="rounded bg-tv-blue p-1.5 text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          {reproduciendo ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={() => avanzar(-1)}
          disabled={idx <= idxInicio}
          title="Una vela atrás"
          aria-label="Una vela atrás"
          className="rounded p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => avanzar(1)}
          disabled={alFinal}
          title="Una vela adelante"
          aria-label="Una vela adelante"
          className="rounded p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => avanzar(10)}
          disabled={alFinal}
          title="Diez velas adelante"
          aria-label="Diez velas adelante"
          className="rounded p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text disabled:opacity-30"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            reproducir(false);
            setTiempo(bt.desde);
          }}
          title="Volver al principio (las operaciones se conservan)"
          aria-label="Volver al principio"
          className="rounded p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <input
          type="range"
          min={idxInicio}
          max={Math.max(idxInicio, ultimo)}
          value={Math.max(idx, idxInicio)}
          onChange={(e) => {
            reproducir(false);
            const i = Number(e.target.value);
            if (velas[i]) setTiempo(velas[i].time);
          }}
          aria-label="Posición en el tiempo"
          className="h-1 min-w-32 flex-1 cursor-pointer accent-tv-blue"
        />

        <span className="font-mono text-[11px] tabular-nums text-tv-text-dim">
          {velas.length === 0 ? "0/0" : `${idx - idxInicio + 1}/${ultimo - idxInicio + 1}`}
        </span>
        <div className="flex gap-0.5 rounded bg-tv-bg p-0.5">
          {VELOCIDADES.map((v) => (
            <button
              key={v}
              onClick={() => setVelocidad(v)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
                v === velocidad
                  ? "bg-tv-panel-hover text-tv-text"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              {v}×
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="border-t border-tv-border bg-tv-bg px-3 py-1.5 text-[11px] text-tv-yellow">
          {error}
        </div>
      )}
    </div>
  );
}
