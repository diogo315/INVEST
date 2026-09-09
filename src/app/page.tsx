"use client";

import { Header } from "@/components/layout/Header";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { BottomPanel } from "@/components/layout/BottomPanel";
import { PriceChart } from "@/components/chart/PriceChart";
import dynamic from "next/dynamic";
import { useChartStore } from "@/lib/store/chart-store";

// ~900 líneas de formularios que solo se ven al abrir "configurar" un
// indicador: fuera del bundle inicial.
const IndicatorSettingsDialog = dynamic(
  () =>
    import("@/components/chart/IndicatorSettingsDialog").then(
      (m) => m.IndicatorSettingsDialog,
    ),
  { ssr: false },
);

export default function HomePage() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <Header />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        {/* min-w-0: sin esto el canvas del chart fija el ancho mínimo del
            flex item y el área no vuelve a encogerse al reabrir el watchlist. */}
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 min-w-0 flex-1">
            <PriceChart symbol={symbol} timeframe={timeframe} />
          </div>
        </main>
        <RightSidebar />
      </div>
      <BottomPanel />
      <IndicatorSettingsDialog />
    </div>
  );
}
