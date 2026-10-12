"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { GraficoBacktest } from "./GraficoBacktest";
import { PanelOperar } from "./PanelOperar";
import { Operaciones } from "./Operaciones";
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
  VELOCIDADES,
  backtestActivo,
  useBacktestStore,
} from "@/lib/store/backtest-store";
import { getAdapter, parseSymbol } from "@/lib/exchanges";
import { TIMEFRAME_SECONDS, type Candle, type Timeframe } from "@/lib/binance/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const TEMPORALIDADES: Timeframe[] = ["5m", "15m", "1h", "4h", "1d", "1w"];
const TOPE_VELAS = 10000;

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

  const simbolo = bt?.simbolo ?? "";
  const tf = (bt?.temporalidad ?? "1d") as Timeframe;
  const desde = bt?.desde ?? 0;

  /**
   * Las velas se guardan junto a la clave de la petición que las trajo.
   *
   * Así «cargando» y «error» se deducen comparando la clave, en vez de
   * ponerlos con setState al entrar al efecto: eso dispara un render en
   * cascada y React lo marca como error.
   */
  const clave = `${simbolo}|${tf}|${desde}`;
  const [datos, setDatos] = useState<{
    clave: string;
    velas: Candle[];
    error: string | null;
  } | null>(null);
  const alDia = datos?.clave === clave;
  const velas = alDia ? datos.velas : [];
  const cargando = !alDia && simbolo !== "";
  const error = alDia ? datos.error : null;

  // ── datos ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!simbolo || !desde) return;
    let vivo = true;
    const segundos = TIMEFRAME_SECONDS[tf];
    // Se pide desde la fecha de arranque hasta hoy, con un poco de
    // colchón hacia atrás: la volatilidad de la primera vela necesita las
    // 20 anteriores, y sin ellas el backtest arrancaría a ciegas.
    const necesarias = Math.ceil((Date.now() / 1000 - desde) / segundos) + 40;
    const limite = Math.min(TOPE_VELAS, Math.max(100, necesarias));
    const { adapter, symbol } = getAdapter(simbolo);
    adapter
      .fetchKlines(symbol, tf, limite)
      .then((k) => {
        if (!vivo) return;
        const aviso =
          k.length === 0
            ? "El proveedor no devolvió velas."
            : k[0].time > desde
              ? `Solo hay historia desde el ${new Date(k[0].time * 1000)
                  .toISOString()
                  .slice(0, 10)} en esta temporalidad.`
              : null;
        setDatos({ clave, velas: k, error: aviso });
      })
      .catch(() => {
        if (vivo) setDatos({ clave, velas: [], error: "No se pudieron bajar las velas." });
      });
    return () => {
      vivo = false;
    };
  }, [simbolo, tf, desde, clave]);

  // ── el momento actual ───────────────────────────────────────────────
  const tiempo = bt?.tiempoActual ?? 0;
  const idx = useMemo(() => indiceHasta(velas, tiempo), [velas, tiempo]);
  const visibles = useMemo(() => velas.slice(0, idx + 1), [velas, idx]);
  const precio = visibles.at(-1)?.close ?? 0;
  const vol = useMemo(
    () => volRealizada(velas, tiempo, 20, TIMEFRAME_SECONDS[tf]),
    [velas, tiempo, tf],
  );
  const ultimo = velas.length - 1;
  const alFinal = idx >= ultimo;

  /** Precio del instrumento de una operación, ahora mismo. */
  const precioAhora = useCallback(
    (op: Operacion) => precioDeOp(op, precio, tiempo, vol),
    [precio, tiempo, vol],
  );

  const resumen = useMemo(() => {
    if (!bt) return null;
    const curva = curvaDeCapital(bt, visibles, () => vol);
    return {
      r: resumir(bt, precioAhora, curva.map((p) => p.value)),
      curva,
    };
  }, [bt, visibles, vol, precioAhora]);

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
      const destino = Math.min(ultimo, Math.max(0, idx + n));
      if (destino === idx) {
        if (n > 0) reproducir(false);
        return;
      }
      setTiempo(velas[destino].time);
      if (destino >= ultimo) reproducir(false);
    },
    [velas, idx, ultimo, setTiempo, reproducir],
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
        <div className="ml-2 flex gap-0.5 rounded bg-tv-bg p-0.5">
          {TEMPORALIDADES.map((t) => (
            <button
              key={t}
              onClick={() => setTemporalidad(t)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px] transition-colors",
                t === bt.temporalidad
                  ? "bg-tv-panel-hover text-tv-text"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-xs tabular-nums text-tv-text">
          {new Date(tiempo * 1000).toISOString().slice(0, 16).replace("T", " ")}
          {precio > 0 && (
            <span className="ml-3 text-tv-text-muted">{formatPrice(precio)}</span>
          )}
        </span>
      </div>

      {/* ── cuerpo ───────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[320px] flex-1 lg:min-h-0">
          {cargando && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-tv-bg/70 text-xs text-tv-text-muted">
              Bajando velas…
            </div>
          )}
          <GraficoBacktest
            visibles={visibles}
            operaciones={bt.operaciones}
            curva={resumen?.curva ?? []}
          />
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
          disabled={idx <= 0}
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
          min={0}
          max={Math.max(0, ultimo)}
          value={idx}
          onChange={(e) => {
            reproducir(false);
            const i = Number(e.target.value);
            if (velas[i]) setTiempo(velas[i].time);
          }}
          aria-label="Posición en el tiempo"
          className="h-1 min-w-32 flex-1 cursor-pointer accent-tv-blue"
        />

        <span className="font-mono text-[11px] tabular-nums text-tv-text-dim">
          {idx + 1}/{velas.length || 0}
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
