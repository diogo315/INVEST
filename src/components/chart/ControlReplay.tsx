"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import {
  VELOCIDADES_REPLAY,
  useChartStore,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/**
 * Barra de reproducción del replay, flotando abajo del gráfico que está
 * reproduciendo.
 *
 * El reloj vive acá y no en el gráfico: así el gráfico solo sabe dibujar
 * hasta cierta vela y no le importa quién la va cambiando.
 */
export function ControlReplay({ graficoId }: { graficoId: string }) {
  const replay = useChartStore((s) => s.replay);
  const avanzar = useChartStore((s) => s.avanzarReplay);
  const reproducir = useChartStore((s) => s.reproducirReplay);
  const velocidad = useChartStore((s) => s.velocidadReplay);
  const salir = useChartStore((s) => s.salirReplay);

  const mio = replay?.graficoId === graficoId;
  const corriendo = !!replay?.reproduciendo;
  const vel = replay?.velocidad ?? 2;

  useEffect(() => {
    if (!mio || !corriendo) return;
    const id = window.setInterval(() => avanzar(1), Math.max(60, 1000 / vel));
    return () => window.clearInterval(id);
  }, [mio, corriendo, vel, avanzar]);

  // Barra espaciadora para arrancar y frenar, flechas para ir de a una.
  useEffect(() => {
    if (!mio) return;
    const alTeclear = (e: KeyboardEvent) => {
      const dentroDeUnCampo =
        e.target instanceof HTMLElement &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (dentroDeUnCampo) return;
      if (e.code === "Space") {
        e.preventDefault();
        reproducir(!corriendo);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        avanzar(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        avanzar(-1);
      } else if (e.key === "Escape") {
        salir();
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [mio, corriendo, avanzar, reproducir, salir]);

  if (!mio || !replay) return null;

  const eligiendo = replay.indice === null;
  const restantes = replay.indice === null ? 0 : replay.total - 1 - replay.indice;

  return (
    <div className="pointer-events-auto absolute bottom-10 left-1/2 z-30 -translate-x-1/2">
      <div className="flex items-center gap-1.5 rounded-lg border border-tv-border bg-tv-panel/95 px-2 py-1.5 shadow-lg backdrop-blur">
        {eligiendo ? (
          <span className="px-2 text-[11px] text-tv-text">
            Hacé clic en la vela donde querés empezar
          </span>
        ) : (
          <>
            <button
              onClick={() => avanzar(-1)}
              title="Una vela atrás (←)"
              aria-label="Una vela atrás"
              className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => reproducir(!replay.reproduciendo)}
              title={replay.reproduciendo ? "Pausar (espacio)" : "Reproducir (espacio)"}
              aria-label={replay.reproduciendo ? "Pausar" : "Reproducir"}
              className="rounded bg-tv-blue/20 p-1 text-tv-blue hover:bg-tv-blue/30"
            >
              {replay.reproduciendo ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => avanzar(1)}
              title="Una vela adelante (→)"
              aria-label="Una vela adelante"
              className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="mx-1 flex items-center gap-0.5">
              {VELOCIDADES_REPLAY.map((v) => (
                <button
                  key={v}
                  onClick={() => velocidad(v)}
                  title={`${v} velas por segundo`}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] tabular-nums",
                    v === replay.velocidad
                      ? "bg-tv-blue text-white"
                      : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                >
                  {v}×
                </button>
              ))}
            </div>

            <span className="px-1 text-[10px] tabular-nums text-tv-text-muted">
              quedan {restantes}
            </span>
          </>
        )}

        <button
          onClick={salir}
          title="Salir del replay (Esc)"
          aria-label="Salir del replay"
          className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
