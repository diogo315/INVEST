"use client";

import { History } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/** Entra y sale del modo de reproducción barra por barra. */
export function BotonReplay() {
  const replay = useChartStore((s) => s.replay);
  const iniciar = useChartStore((s) => s.iniciarReplay);
  const salir = useChartStore((s) => s.salirReplay);
  const activo = replay !== null;

  return (
    <button
      onClick={() => (activo ? salir() : iniciar())}
      title={
        activo
          ? "Salir del replay"
          : "Reproducir el gráfico barra por barra desde donde elijas"
      }
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors",
        activo
          ? "bg-tv-blue/20 text-tv-blue"
          : "text-tv-text hover:bg-tv-panel-hover",
      )}
    >
      <History className="h-3.5 w-3.5" />
      <span>Replay</span>
    </button>
  );
}
