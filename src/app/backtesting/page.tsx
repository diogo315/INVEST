"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CandlestickChart, History, Sigma, Zap } from "lucide-react";
import { NuevoBacktest } from "@/components/backtest/NuevoBacktest";
import { VistaBacktest } from "@/components/backtest/VistaBacktest";
import { useBacktestStore } from "@/lib/store/backtest-store";

export default function BacktestingPage() {
  // Lo guardado vive en localStorage: renderizar primero los valores por
  // defecto y después los guardados haría saltar el aviso de hidratación.
  const montado = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const activoId = useBacktestStore((s) => s.activoId);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-tv-border bg-tv-panel px-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-tv-blue/20">
            <Zap className="h-4 w-4 text-tv-blue" />
          </div>
          <span className="text-sm font-semibold text-tv-text">
            TradingView <span className="text-tv-text-muted">Gratis</span>
          </span>
          <nav className="ml-3 flex gap-0.5 rounded bg-tv-bg p-0.5">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-tv-text-muted transition-colors hover:text-tv-text"
            >
              <CandlestickChart className="h-3.5 w-3.5" />
              Gráfico
            </Link>
            <Link
              href="/opciones"
              className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-tv-text-muted transition-colors hover:text-tv-text"
            >
              <Sigma className="h-3.5 w-3.5" />
              Opciones
            </Link>
            <span className="flex items-center gap-1.5 rounded bg-tv-panel-hover px-2.5 py-1 text-xs font-medium text-tv-text">
              <History className="h-3.5 w-3.5" />
              Backtesting
            </span>
          </nav>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {!montado ? (
          <p className="p-6 text-xs text-tv-text-muted">Cargando…</p>
        ) : activoId ? (
          <VistaBacktest />
        ) : (
          <NuevoBacktest />
        )}
      </main>
    </div>
  );
}
