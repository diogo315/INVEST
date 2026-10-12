"use client";

import { Copy, Play, Trash2 } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import {
  HISTORIAS,
  useBacktestStore,
  BORRADOR_INICIAL,
} from "@/lib/store/backtest-store";
import { resumir, type Backtest } from "@/lib/backtest/tipos";
import { TIMEFRAME_SECONDS, type Timeframe } from "@/lib/binance/types";
import { parseSymbol } from "@/lib/exchanges";
import { cn } from "@/lib/utils";

const TEMPORALIDADES: Timeframe[] = ["5m", "15m", "1h", "4h", "1d", "1w"];
/**
 * El reloj se fija al cargar la pantalla, no en cada render.
 *
 * React exige que renderizar sea puro, y `Date.now()` no lo es. Para
 * contar cuántas velas hay desde una fecha, unos minutos de diferencia no
 * cambian nada, así que se congela acá y listo.
 */
const AHORA = Date.now();
const CAPITALES = [1000, 5000, 10000, 25000, 100000];

/**
 * Cuántas velas hay que bajar: la historia previa más el backtest. Sirve
 * para avisar antes de empezar si el plan no entra en el tope.
 */
function velasEstimadas(desde: string, tf: Timeframe, historiaDias: number): number {
  const ms = Date.parse(`${desde}T00:00:00Z`);
  if (Number.isNaN(ms)) return 0;
  const arranque = ms / 1000 - historiaDias * 86400;
  return Math.round((AHORA / 1000 - arranque) / TIMEFRAME_SECONDS[tf]);
}

function Fila({ bt }: { bt: Backtest }) {
  const abrir = useBacktestStore((s) => s.abrir);
  const borrar = useBacktestStore((s) => s.borrar);
  const duplicar = useBacktestStore((s) => s.duplicar);
  // En la lista se muestra solo lo ya cerrado: valorar lo abierto exigiría
  // bajar las velas de cada backtest, y eso para una lista no compensa.
  const r = resumir(bt, () => 0);
  const cerradas = bt.operaciones.filter((o) => o.precioSalida !== undefined).length;
  const verde = r.realizado > 0;

  return (
    <div className="flex items-center gap-3 border-b border-tv-border/60 px-3 py-2 last:border-b-0 hover:bg-tv-panel-hover">
      <button
        onClick={() => abrir(bt.id)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="w-32 shrink-0 truncate text-xs font-medium text-tv-text">
          {bt.nombre}
        </span>
        <span className="w-20 shrink-0 font-mono text-[11px] text-tv-text-muted">
          {parseSymbol(bt.simbolo).symbol}
        </span>
        <span className="w-12 shrink-0 text-[11px] text-tv-text-dim">
          {bt.temporalidad}
        </span>
        <span className="w-24 shrink-0 text-[11px] text-tv-text-muted">
          {new Date(bt.desde * 1000).toISOString().slice(0, 10)}
        </span>
        <span className="w-24 shrink-0 text-[11px] text-tv-text-muted">
          {bt.operaciones.length} oper. · {cerradas} cerr.
        </span>
        <span
          className={cn(
            "flex-1 text-right font-mono text-xs tabular-nums",
            cerradas === 0
              ? "text-tv-text-dim"
              : verde
                ? "text-tv-green"
                : "text-tv-red",
          )}
        >
          {cerradas === 0
            ? "sin cerrar"
            : `${r.realizado >= 0 ? "+" : "−"}$${Math.abs(r.realizado).toFixed(0)}`}
        </span>
      </button>
      <button
        onClick={() => duplicar(bt.id)}
        title="Repetir con la misma configuración, sin las operaciones"
        aria-label={`Repetir ${bt.nombre}`}
        className="shrink-0 rounded p-1 text-tv-text-dim hover:bg-tv-bg hover:text-tv-text"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => borrar(bt.id)}
        title="Borrar este backtest"
        aria-label={`Borrar ${bt.nombre}`}
        className="shrink-0 rounded p-1 text-tv-text-dim hover:bg-tv-bg hover:text-tv-red"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Configurar un backtest nuevo y ver los guardados. */
export function NuevoBacktest() {
  const b = useBacktestStore((s) => s.borrador);
  const setB = useBacktestStore((s) => s.setBorrador);
  const crear = useBacktestStore((s) => s.crear);
  const backtests = useBacktestStore((s) => s.backtests);
  // Los activos que ya tenés en las listas: no hace falta otro buscador.
  const listas = useChartStore((s) => s.listas);
  const simbolos = [...new Set(listas.flatMap((l) => l.simbolos))];

  const n = velasEstimadas(b.desde, b.temporalidad, b.historia);
  const hayFecha = b.desde !== "" && !Number.isNaN(Date.parse(`${b.desde}T00:00:00Z`));
  const futuro = hayFecha && Date.parse(`${b.desde}T00:00:00Z`) > AHORA;
  const demasiadas = n > 10000;
  const puede = hayFecha && !futuro && !demasiadas;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-semibold text-tv-text">Backtesting</h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-tv-text-muted">
          Elegís un activo y una fecha de arranque, el gráfico avanza vela a
          vela y vos decidís en el momento: comprar, vender, o abrir un call o
          un put. Al final queda guardado con todo lo que hiciste.
        </p>
      </div>

      <div className="rounded border border-tv-border bg-tv-panel p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              Activo
            </span>
            <select
              value={b.simbolo}
              onChange={(e) => setB({ simbolo: e.target.value })}
              className="rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs text-tv-text"
            >
              {simbolos.length === 0 && (
                <option value={BORRADOR_INICIAL.simbolo}>AAPL</option>
              )}
              {simbolos.map((s) => {
                const p = parseSymbol(s);
                return (
                  <option key={s} value={s}>
                    {p.symbol} · {p.exchange}
                  </option>
                );
              })}
            </select>
            <span className="text-[10px] text-tv-text-dim">
              Salen de tus listas. Agregá el que falte desde el buscador del
              gráfico.
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              Empezar el
            </span>
            <input
              type="date"
              value={b.desde}
              max={new Date(AHORA).toISOString().slice(0, 10)}
              onChange={(e) => setB({ desde: e.target.value })}
              className="rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs text-tv-text [color-scheme:dark]"
            />
            <span className="text-[10px] text-tv-text-dim">
              {hayFecha
                ? `${n.toLocaleString("es")} velas en total, contando la historia previa`
                : "El gráfico arranca ahí y avanza hacia adelante"}
            </span>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              Temporalidad
            </span>
            <div className="flex flex-wrap gap-1">
              {TEMPORALIDADES.map((t) => (
                <button
                  key={t}
                  onClick={() => setB({ temporalidad: t })}
                  className={cn(
                    "rounded px-2.5 py-1 text-[11px] transition-colors",
                    b.temporalidad === t
                      ? "bg-tv-blue text-white"
                      : "bg-tv-bg text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-tv-text-dim">
              Se puede cambiar en marcha sin perder el momento.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              Historia previa
            </span>
            <div className="flex flex-wrap gap-1">
              {HISTORIAS.map((h) => (
                <button
                  key={h.dias}
                  onClick={() => setB({ historia: h.dias })}
                  className={cn(
                    "rounded px-2.5 py-1 text-[11px] transition-colors",
                    b.historia === h.dias
                      ? "bg-tv-blue text-white"
                      : "bg-tv-bg text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                >
                  {h.etiqueta}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-tv-text-dim">
              Velas anteriores al arranque, para que los indicadores lleguen
              calculados. No se puede operar ahí.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              Capital inicial
            </span>
            <div className="flex flex-wrap gap-1">
              {CAPITALES.map((c) => (
                <button
                  key={c}
                  onClick={() => setB({ capital: c })}
                  className={cn(
                    "rounded px-2.5 py-1 text-[11px] tabular-nums transition-colors",
                    b.capital === c
                      ? "bg-tv-blue text-white"
                      : "bg-tv-bg text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                >
                  ${c >= 1000 ? `${c / 1000}k` : c}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-tv-text-dim">
              Contra esto se mide el porcentaje final.
            </span>
          </div>
        </div>

        {demasiadas && (
          <p className="mt-3 rounded border-l-2 border-tv-yellow bg-tv-bg px-3 py-2 text-[11px] text-tv-text-muted">
            Son {n.toLocaleString("es")} velas y el máximo que se puede bajar
            son 10.000. Elegí una fecha más cercana o una temporalidad más
            grande.
          </p>
        )}
        {futuro && (
          <p className="mt-3 rounded border-l-2 border-tv-red bg-tv-bg px-3 py-2 text-[11px] text-tv-text-muted">
            Esa fecha todavía no pasó.
          </p>
        )}

        <button
          onClick={() => crear()}
          disabled={!puede}
          className="mt-4 flex items-center gap-2 rounded bg-tv-blue px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Play className="h-3.5 w-3.5" />
          Empezar el backtest
        </button>
      </div>

      <div>
        <h2 className="mb-2 text-[10px] uppercase tracking-wider text-tv-text-muted">
          Guardados ({backtests.length})
        </h2>
        {backtests.length === 0 ? (
          <p className="rounded border border-dashed border-tv-border px-3 py-6 text-center text-xs text-tv-text-dim">
            Todavía no corriste ninguno.
          </p>
        ) : (
          <div className="rounded border border-tv-border bg-tv-panel">
            {backtests.map((bt) => (
              <Fila key={bt.id} bt={bt} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
