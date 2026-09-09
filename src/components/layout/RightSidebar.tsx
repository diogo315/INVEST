"use client";

import { ChevronLeft } from "lucide-react";
import { Watchlist } from "@/components/watchlist/Watchlist";
import { useChartStore } from "@/lib/store/chart-store";

export function RightSidebar() {
  const collapsed = useChartStore((s) => s.watchlistCollapsed);
  const toggle = useChartStore((s) => s.toggleWatchlistCollapsed);

  if (collapsed) {
    // Riel angosto: deja ~230 px más de ancho al chart y mantiene visible
    // cómo volver a abrir el panel.
    return (
      <aside className="flex w-8 shrink-0 flex-col items-center border-l border-tv-border bg-tv-panel">
        <button
          onClick={toggle}
          title="Mostrar watchlist"
          aria-label="Mostrar watchlist"
          aria-expanded={false}
          className="mt-2 rounded p-1 text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={toggle}
          tabIndex={-1}
          aria-hidden="true"
          className="mt-3 cursor-pointer select-none text-[10px] font-semibold uppercase tracking-wider text-tv-text-dim hover:text-tv-text-muted"
          style={{ writingMode: "vertical-rl" }}
        >
          Watchlist
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-tv-border bg-tv-panel">
      <Watchlist />
    </aside>
  );
}
