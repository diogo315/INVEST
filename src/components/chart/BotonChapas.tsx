"use client";

import { Captions, CaptionsOff } from "lucide-react";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/**
 * Esconde los TEXTOS de los indicadores, no los indicadores.
 *
 * El modo «ocultas» ya existía dentro del menú de Estilo, pero ahí no
 * sirve para lo que se usa: uno quiere sacar los carteles un momento
 * para mirar las velas y volver a ponerlos enseguida. Tres clics en un
 * menú para cada viaje no es eso.
 *
 * Al apagarlos se recuerda cómo estaban, así que encenderlos devuelve
 * la marca de agua a quien la tenía en vez de dejar a todos en
 * «normal».
 */
export function BotonChapas() {
  const chapas = useChartStore((s) => s.apariencia.chapas);
  const chapasAntes = useChartStore((s) => s.apariencia.chapasAntes);
  const setApariencia = useChartStore((s) => s.setApariencia);

  const ocultas = chapas === "ocultas";
  const alternar = () =>
    setApariencia(
      ocultas
        ? { chapas: chapasAntes === "ocultas" ? "normal" : chapasAntes }
        : { chapas: "ocultas", chapasAntes: chapas },
    );

  const titulo = ocultas
    ? "Mostrar los textos de los indicadores"
    : "Ocultar los textos de los indicadores (los indicadores se siguen dibujando)";

  return (
    <button
      onClick={alternar}
      title={titulo}
      aria-label={titulo}
      aria-pressed={ocultas}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors",
        ocultas
          ? "bg-tv-blue/15 text-tv-blue"
          : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
      )}
    >
      {ocultas ? <CaptionsOff className="h-3.5 w-3.5" /> : <Captions className="h-3.5 w-3.5" />}
      <span>Textos</span>
    </button>
  );
}
