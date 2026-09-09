"use client";

import { Code2, RefreshCw, Zap } from "lucide-react";
import { SymbolSelector } from "@/components/chart/SymbolSelector";
import { TimeframeSelector } from "@/components/chart/TimeframeSelector";
import { IndicatorMenu } from "@/components/chart/IndicatorMenu";
import { TimezoneSelector } from "@/components/chart/TimezoneSelector";
import { Separator } from "@/components/ui/separator";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

export function Header() {
  const refreshChart = useChartStore((s) => s.refreshChart);
  const loading = useChartStore((s) => s.chartLoading);

  return (
    <header className="flex h-12 items-center justify-between border-b border-tv-border bg-tv-panel px-3">
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-2 pr-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-tv-blue/20">
            <Zap className="h-4 w-4 text-tv-blue" />
          </div>
          <span className="text-sm font-semibold text-tv-text">
            TradingView <span className="text-tv-text-muted">Gratis</span>
          </span>
        </div>
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <SymbolSelector />
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <TimeframeSelector />
        <Separator orientation="vertical" className="mx-1 h-6 bg-tv-border" />
        <IndicatorMenu />
        <Separator orientation="vertical" className="mx-1 h-6 bg-tv-border" />
        <TimezoneSelector />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={refreshChart}
          disabled={loading}
          title="Actualizar datos del gráfico"
          aria-label="Actualizar datos del gráfico"
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text disabled:cursor-default"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          <span>Actualizar</span>
        </button>
        <Separator orientation="vertical" className="h-6 bg-tv-border" />
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Code2 className="h-3.5 w-3.5" />
          <span>Source</span>
        </a>
      </div>
    </header>
  );
}
