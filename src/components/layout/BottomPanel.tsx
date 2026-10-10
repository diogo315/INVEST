"use client";

import { useEffect, useState } from "react";
import { useChartStore } from "@/lib/store/chart-store";
import { getAdapter, parseSymbol, partirPar } from "@/lib/exchanges";
import { CLASE_MERCADO } from "@/lib/exchanges/buscar";
import type { Ticker24h } from "@/lib/binance/types";
import { formatPrice, formatPct, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BottomPanel() {
  const symbol = useChartStore((s) => s.symbol);
  const [t, setT] = useState<Ticker24h | null>(null);

  useEffect(() => {
    let cancelled = false;
    setT(null);
    const { adapter, symbol: raw } = getAdapter(symbol);
    const load = () => {
      adapter
        .fetchTickers24h([raw])
        .then((rows) => {
          if (!cancelled) setT(rows[0] ?? null);
        })
        .catch(console.error);
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  const upClass = (n: number) => (n >= 0 ? "text-tv-green" : "text-tv-red");
  const { adapter } = getAdapter(symbol);
  const { exchange, symbol: par } = parseSymbol(symbol);
  const base = par;
  const { cotizacion } = partirPar(exchange, par);
  // La bolsa no tiene "últimas 24 h": abre y cierra, y la variación se mide
  // contra el cierre anterior.
  const lapso = CLASE_MERCADO[exchange] === "accion" ? "Hoy" : "24h";

  return (
    <div className="flex h-9 items-center gap-0 border-t border-tv-border bg-tv-panel px-3 text-xs">
      <Stat label="Símbolo" value={base} />
      <Stat
        label={`${lapso} Cambio`}
        value={t ? formatPct(t.priceChangePercent) : "—"}
        valueClass={t ? upClass(t.priceChangePercent) : ""}
      />
      <Stat
        label={`${lapso} Alto`}
        value={t ? formatPrice(t.highPrice) : "—"}
        valueClass="text-tv-green"
      />
      <Stat
        label={`${lapso} Bajo`}
        value={t ? formatPrice(t.lowPrice) : "—"}
        valueClass="text-tv-red"
      />
      <Stat
        label={`${lapso} Vol (base)`}
        value={t ? formatVolume(t.volume) : "—"}
      />
      <Stat
        label={`${lapso} Vol (${cotizacion || "—"})`}
        value={t ? formatVolume(t.quoteVolume) : "—"}
      />
      <div className="ml-auto flex items-center gap-2 text-[10px] text-tv-text-dim">
        <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-tv-green" />
        <span>{adapter.name} · Live</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 border-r border-tv-border px-3">
      <span className="text-tv-text-dim">{label}</span>
      <span className={cn("font-medium tabular-nums", valueClass ?? "text-tv-text")}>
        {value}
      </span>
    </div>
  );
}
