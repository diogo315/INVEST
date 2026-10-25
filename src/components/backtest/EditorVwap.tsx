"use client";

import { Settings2 } from "lucide-react";
import { CampoNumero } from "./CampoNumero";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ANCLAJE } from "@/lib/backtest/indicadores";
import type { IndicatorConfig } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface Props {
  config: IndicatorConfig;
  onCambiar: (parche: Record<string, unknown>) => void;
}

const FUENTES: Array<[string, string]> = [
  ["hlc3", "(A+B+C)/3"],
  ["hl2", "(A+B)/2"],
  ["hlcc4", "(A+B+C+C)/4"],
  ["ohlc4", "(O+A+B+C)/4"],
  ["close", "Cierre"],
];

/**
 * Los ajustes del VWAP del backtest.
 *
 * Son los MISMOS campos que el del gráfico principal —anclaje, fuente,
 * modo de banda y tres multiplicadores— porque es el mismo indicador: si
 * acá hubiera otros, el VWAP se vería distinto según la pestaña y no
 * habría forma de saber a cuál creerle.
 */
export function EditorVwap({ config, onCambiar }: Props) {
  const bandas: Array<[1 | 2 | 3, boolean, number]> = [
    [1, config.vwapShowBand1, config.vwapMult1],
    [2, config.vwapShowBand2, config.vwapMult2],
    [3, config.vwapShowBand3, config.vwapMult3],
  ];
  const pct = config.vwapBandsMode === "pct";

  return (
    <Dialog>
      <DialogTrigger
        title="Ajustes del VWAP"
        aria-label="Ajustes del VWAP"
        className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <Settings2 className="h-3.5 w-3.5" />
        VWAP
      </DialogTrigger>
      <DialogContent className="max-w-sm space-y-3 text-xs">
        <DialogHeader>
          <DialogTitle className="text-sm">Ajustes del VWAP</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-tv-text-muted">
            Anclaje
          </span>
          <select
            value={config.vwapAnchor}
            onChange={(e) => onCambiar({ vwapAnchor: e.target.value })}
            aria-label="Anclaje del VWAP"
            className="flex-1 rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs text-tv-text"
          >
            {Object.entries(ANCLAJE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-tv-text-muted">
            Fuente
          </span>
          <select
            value={config.vwapSource}
            onChange={(e) => onCambiar({ vwapSource: e.target.value })}
            aria-label="Fuente del VWAP"
            className="flex-1 rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs text-tv-text"
          >
            {FUENTES.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-tv-text-muted">
            Bandas
          </span>
          <div className="flex flex-1 gap-0.5 rounded bg-tv-bg p-0.5">
            {(
              [
                ["stdev", "Desvíos"],
                ["pct", "Porcentaje"],
              ] as const
            ).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => onCambiar({ vwapBandsMode: k })}
                className={cn(
                  "flex-1 rounded px-2 py-0.5 text-[10px] transition-colors",
                  config.vwapBandsMode === k
                    ? "bg-tv-panel-hover text-tv-text"
                    : "text-tv-text-muted hover:text-tv-text",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 border-t border-tv-border pt-2">
          {bandas.map(([n, visible, mult]) => (
            <div key={n} className="flex items-center gap-2">
              <label className="flex flex-1 cursor-pointer items-center gap-1.5 text-[11px] text-tv-text">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) =>
                    onCambiar({ [`vwapShowBand${n}`]: e.target.checked })
                  }
                  className="h-3 w-3 accent-tv-blue"
                />
                Banda {n}
              </label>
              <CampoNumero
                valor={mult}
                paso={pct ? 0.1 : 0.5}
                min={0}
                onCambiar={(v) => {
                  if (v !== null) onCambiar({ [`vwapMult${n}`]: v });
                }}
                aria-label={`Multiplicador de la banda ${n}`}
                className="w-20 rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs tabular-nums text-tv-text"
              />
              <span className="w-4 text-[10px] text-tv-text-dim">
                {pct ? "%" : "σ"}
              </span>
            </div>
          ))}
        </div>

        <p className="text-[10px] leading-relaxed text-tv-text-dim">
          En modo desvíos, la banda se separa N desviaciones estándar
          ponderadas por volumen. En porcentaje, un N % del propio VWAP.
          Los ajustes se guardan con esta corrida.
        </p>
      </DialogContent>
    </Dialog>
  );
}
