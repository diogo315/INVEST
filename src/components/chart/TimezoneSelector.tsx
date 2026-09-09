"use client";

import { Check, Clock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChartStore } from "@/lib/store/chart-store";
import {
  ZONAS,
  etiquetaZona,
  nombreZona,
  type OpcionZona,
} from "@/lib/chart/timezone";

/** Zonas agrupadas, conservando el orden de la lista. */
const GRUPOS = ZONAS.reduce<Record<string, OpcionZona[]>>((acc, z) => {
  (acc[z.grupo] ??= []).push(z);
  return acc;
}, {});

export function TimezoneSelector() {
  const timezone = useChartStore((s) => s.timezone);
  const setTimezone = useChartStore((s) => s.setTimezone);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={`Zona horaria del gráfico: ${nombreZona(timezone)} (${etiquetaZona(timezone)})`}
        aria-label="Elegir zona horaria del gráfico"
        className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <Clock className="h-3.5 w-3.5" />
        <span className="tabular-nums">{etiquetaZona(timezone)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 bg-tv-panel">
        {Object.entries(GRUPOS).map(([grupo, zonas], idx) => (
          <DropdownMenuGroup key={grupo}>
            {idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              {grupo}
            </DropdownMenuLabel>
            {zonas.map((z) => (
              <DropdownMenuItem
                key={z.id}
                onClick={() => setTimezone(z.id)}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">{z.nombre}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="tabular-nums text-[10px] text-tv-text-muted">
                    {etiquetaZona(z.id)}
                  </span>
                  {timezone === z.id && (
                    <Check className="h-3.5 w-3.5 text-tv-blue" />
                  )}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
