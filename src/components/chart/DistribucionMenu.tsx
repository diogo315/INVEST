"use client";

import { Check, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DISTRIBUCIONES,
  GRAFICOS_DE,
  OPCIONES_HISTORIA,
  useChartStore,
  type Distribucion,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/** Dibujito de la distribución, para reconocerla de un vistazo. */
function Miniatura({ id, activa }: { id: Distribucion; activa: boolean }) {
  const celda = cn("rounded-[1px]", activa ? "bg-tv-blue" : "bg-tv-text-dim");
  const marco = "flex h-3.5 w-4 shrink-0 gap-px";
  if (id === "1") return <div className={marco}><div className={cn(celda, "flex-1")} /></div>;
  if (id === "2v")
    return (
      <div className={marco}>
        <div className={cn(celda, "flex-1")} />
        <div className={cn(celda, "flex-1")} />
      </div>
    );
  if (id === "2h")
    return (
      <div className={cn(marco, "flex-col")}>
        <div className={cn(celda, "flex-1")} />
        <div className={cn(celda, "flex-1")} />
      </div>
    );
  if (id === "3")
    return (
      <div className={cn(marco, "flex-col")}>
        <div className={cn(celda, "flex-1")} />
        <div className="flex flex-1 gap-px">
          <div className={cn(celda, "flex-1")} />
          <div className={cn(celda, "flex-1")} />
        </div>
      </div>
    );
  return (
    <div className={cn(marco, "flex-col")}>
      <div className="flex flex-1 gap-px">
        <div className={cn(celda, "flex-1")} />
        <div className={cn(celda, "flex-1")} />
      </div>
      <div className="flex flex-1 gap-px">
        <div className={cn(celda, "flex-1")} />
        <div className={cn(celda, "flex-1")} />
      </div>
    </div>
  );
}

/** Elige cuántos gráficos se ven a la vez y cómo se reparten. */
export function DistribucionMenu() {
  const distribucion = useChartStore((s) => s.distribucion);
  const setDistribucion = useChartStore((s) => s.setDistribucion);
  const velas = useChartStore((s) => s.velasHistoria);
  const setVelas = useChartStore((s) => s.setVelasHistoria);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Cuántos gráficos ver a la vez"
        className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text hover:bg-tv-panel-hover"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>Vista</span>
        {GRAFICOS_DE[distribucion] > 1 && (
          <span className="ml-0.5 rounded bg-tv-blue/20 px-1.5 py-0.5 text-[10px] font-semibold text-tv-blue">
            {GRAFICOS_DE[distribucion]}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 bg-tv-panel">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Gráficos a la vez
          </DropdownMenuLabel>
          {DISTRIBUCIONES.map((d) => (
            <DropdownMenuItem
              key={d.id}
              onClick={() => setDistribucion(d.id)}
              className="flex items-center gap-2.5 text-xs"
            >
              <Miniatura id={d.id} activa={d.id === distribucion} />
              <span className="flex-1">{d.etiqueta}</span>
              {d.id === distribucion && (
                <Check className="h-3.5 w-3.5 text-tv-blue" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <div className="border-t border-tv-border px-2 py-1.5 text-[10px] leading-relaxed text-tv-text-muted">
          Cada gráfico tiene su activo, su temporalidad y sus indicadores. El
          del borde azul es el que recibe lo que elegís acá arriba: hacé clic
          en otro para cambiarlo.
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Historia (velas por gráfico)
          </DropdownMenuLabel>
          <div className="flex gap-1 px-2 pb-1">
            {OPCIONES_HISTORIA.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setVelas(n)}
                className={cn(
                  "flex-1 rounded px-1.5 py-1 text-[11px] tabular-nums transition-colors",
                  n === velas
                    ? "bg-tv-blue text-white"
                    : "bg-tv-bg text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                )}
              >
                {n >= 1000 ? `${n / 1000}k` : n}
              </button>
            ))}
          </div>
        </DropdownMenuGroup>
        <div className="px-2 pb-1.5 text-[10px] leading-relaxed text-tv-text-muted">
          Más historia es más scroll hacia atrás, pero también más datos que
          bajar y más cuenta para los indicadores en cada gráfico.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
