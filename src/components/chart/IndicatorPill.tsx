"use client";

import { Eye, EyeOff, Settings, X } from "lucide-react";
import type { ModoChapas } from "@/lib/chart/apariencia";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  value?: string;
  /**
   * Varios valores en una sola píldora, cada uno con su color. Lo usa el
   * indicador de medias móviles, que es una lista de líneas y no una sola.
   */
  valores?: Array<{ texto: string; color: string; apagada?: boolean }>;
  color: string;
  hidden: boolean;
  /**
   * "agua" la deja como marca de agua: más chica, sin fondo ni marco y
   * translúcida, para que no tape las velas. Al pasar el mouse vuelve a
   * verse entera, con sus botones, así que no se pierde nada.
   */
  modo?: ModoChapas;
  onToggleHide: () => void;
  onSettings: () => void;
  onRemove: () => void;
}

export function IndicatorPill({
  name,
  value,
  valores,
  color,
  hidden,
  modo = "normal",
  onToggleHide,
  onSettings,
  onRemove,
}: Props) {
  // "ocultas" se resuelve acá y no en cada sitio donde se pone una chapa:
  // son once, repartidas entre el panel del precio y el de cada
  // indicador, y una sola de ellas olvidada dejaría el modo a medias.
  if (modo === "ocultas") return null;
  const agua = modo === "agua";
  return (
    <div
      className={cn(
        "group/pill pointer-events-auto flex items-center rounded transition-all",
        agua
          ? // Sin fondo ni marco y a media tinta: deja ver las velas de
            // atrás. Al pasar el mouse recupera el aspecto normal.
            "gap-1 px-0.5 py-0 text-[10px] opacity-45 hover:bg-tv-panel/95 hover:px-1.5 hover:py-0.5 hover:opacity-100 hover:shadow-sm hover:ring-1 hover:ring-tv-border hover:backdrop-blur"
          : "gap-1.5 bg-tv-panel/95 px-1.5 py-0.5 text-[11px] shadow-sm ring-1 ring-tv-border backdrop-blur",
        hidden && "opacity-50",
      )}
    >
      <span
        className={cn("shrink-0 rounded-full", agua ? "h-1 w-1" : "h-1.5 w-1.5")}
        style={{ background: color }}
      />
      <span className="font-medium text-tv-text">{name}</span>
      {value !== undefined && (
        <span className="tabular-nums text-tv-text-muted">{value}</span>
      )}
      {valores?.map((v, i) => (
        <span
          key={i}
          className={cn("tabular-nums", v.apagada && "opacity-40 line-through")}
          style={{ color: v.color }}
        >
          {v.texto}
        </span>
      ))}
      {/* En marca de agua los botones no OCUPAN sitio hasta que se los
          necesita: con `w-0` el ancho de la chapa es solo su texto. */}
      <div
        className={cn(
          "flex items-center gap-0.5",
          agua
            ? "w-0 overflow-hidden opacity-0 group-hover/pill:ml-1 group-hover/pill:w-auto group-hover/pill:opacity-100"
            : "ml-1",
        )}
      >
        <button
          onClick={onToggleHide}
          title={hidden ? "Mostrar" : "Ocultar"}
          aria-label={hidden ? "Mostrar" : "Ocultar"}
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
        >
          {hidden ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </button>
        <button
          onClick={onSettings}
          title="Configurar"
          aria-label="Configurar"
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <Settings className="h-3 w-3" />
        </button>
        <button
          onClick={onRemove}
          title="Eliminar"
          aria-label="Eliminar"
          className="rounded p-0.5 text-tv-text-dim transition-colors hover:bg-tv-panel-hover hover:text-tv-red"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
