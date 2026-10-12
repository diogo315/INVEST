"use client";

import { Check, LineChart } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { INDICADORES_BT } from "@/lib/backtest/indicadores";
import { cn } from "@/lib/utils";

interface Props {
  puestos: string[];
  onAlternar: (clave: string) => void;
}

/** Elegir qué indicadores se ven mientras corre el backtest. */
export function IndicadoresMenu({ puestos, onAlternar }: Props) {
  const encima = INDICADORES_BT.filter((i) => !i.conPanel);
  const abajo = INDICADORES_BT.filter((i) => i.conPanel);

  const fila = (clave: string, etiqueta: string, color: string) => {
    const activo = puestos.includes(clave);
    return (
      <DropdownMenuItem
        key={clave}
        // `closeOnClick={false}`: sin esto el menú se cierra en cada clic
        // y hay que volver a abrirlo para poner el segundo indicador.
        // `preventDefault` solo no alcanza en Base UI.
        closeOnClick={false}
        onClick={() => onAlternar(clave)}
        className="flex items-center gap-2.5 text-xs"
      >
        <span
          aria-hidden
          className="h-0.5 w-3 shrink-0 rounded"
          style={{ background: color }}
        />
        <span className="flex-1">{etiqueta}</span>
        {activo && <Check className="h-3.5 w-3.5 text-tv-blue" />}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Indicadores del backtest"
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <LineChart className="h-3.5 w-3.5" />
        <span>Indicadores</span>
        {puestos.length > 0 && (
          <span className="rounded bg-tv-blue/20 px-1.5 py-0.5 text-[10px] font-semibold text-tv-blue">
            {puestos.length}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[70vh] w-60 overflow-y-auto bg-tv-panel"
      >
        {/* Cada etiqueta tiene que ir DENTRO de su grupo: Base UI lanza su
            error #31 si una GroupLabel queda suelta, y el menú no abre. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Sobre las velas
          </DropdownMenuLabel>
          {encima.map((i) => fila(i.clave, i.etiqueta, i.series[0]?.color ?? "#787b86"))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            En su propio panel
          </DropdownMenuLabel>
          {abajo.map((i) => fila(i.clave, i.etiqueta, i.series[0]?.color ?? "#787b86"))}
        </DropdownMenuGroup>
        <div
          className={cn(
            "border-t border-tv-border px-2 py-1.5 text-[10px] leading-relaxed",
            puestos.length >= 8 ? "text-tv-yellow" : "text-tv-text-muted",
          )}
        >
          {puestos.length >= 8
            ? "Son ocho, el máximo. Apagá uno para poner otro."
            : "Se calculan solo con las velas que el backtest ya vivió, así que no ven el futuro. Quedan guardados con la corrida."}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
