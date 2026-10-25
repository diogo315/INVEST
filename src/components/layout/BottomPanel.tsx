"use client";

import { useEffect, useState } from "react";
import { useChartStore, graficoActivo } from "@/lib/store/chart-store";
import { getAdapter, parseSymbol, partirPar } from "@/lib/exchanges";
import { CLASE_MERCADO } from "@/lib/exchanges/buscar";
import type { Ticker24h } from "@/lib/binance/types";
import { formatPrice, formatPct, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";
import { reconnectAllBinanceWS } from "@/lib/binance/ws";
import {
  estadoDelPulso,
  segundosSinDatos,
  textoDelPulso,
  type EstadoPulso,
} from "@/lib/chart/pulso";

export function BottomPanel() {
  const symbol = useChartStore((s) => graficoActivo(s).symbol);
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
      <IndicadorDePulso nombre={adapter.name} />
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

/**
 * Dice si de verdad están llegando datos, y cuánto hace que no.
 *
 * Antes era un punto verde que latía siempre, dijera lo que dijera la
 * conexión. Eso convierte un problema de red en un misterio: uno ve el
 * punto verde, ve el precio quieto, y concluye que la app está rota.
 *
 * Al hacer clic fuerza una reconexión, que es lo que uno quiere
 * intentar antes de recargar toda la página.
 */
function IndicadorDePulso({ nombre }: { nombre: string }) {
  const [segundos, setSegundos] = useState(() => segundosSinDatos());
  useEffect(() => {
    // Cada segundo: es la resolución que tiene sentido para un cartel
    // que cuenta segundos, y no cuesta nada.
    const id = setInterval(() => setSegundos(segundosSinDatos()), 1000);
    return () => clearInterval(id);
  }, []);

  const estado = estadoDelPulso(segundos);
  const color: Record<EstadoPulso, string> = {
    vivo: "bg-tv-green",
    lento: "bg-tv-yellow",
    cortado: "bg-tv-red",
    esperando: "bg-tv-text-dim",
  };
  const texto = textoDelPulso(estado, segundos);

  return (
    <button
      onClick={() => reconnectAllBinanceWS()}
      title={
        estado === "vivo"
          ? "Los precios están llegando. Clic para reconectar igual."
          : "Clic para reconectar. Si sigue así, puede estar bloqueado el WebSocket en tu red."
      }
      aria-label={`Estado de los datos: ${texto}`}
      data-pulso={estado}
      className="ml-auto flex items-center gap-2 rounded px-1.5 py-0.5 text-[10px] text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
    >
      <span
        className={cn(
          "inline-flex h-1.5 w-1.5 rounded-full",
          color[estado],
          estado === "vivo" && "animate-pulse",
        )}
      />
      <span>
        {nombre} · {texto}
      </span>
    </button>
  );
}
