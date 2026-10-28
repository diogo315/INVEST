"use client";

import {
  ArrowUpRight,
  Minus,
  MousePointer2,
  MoveVertical,
  Ruler,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Type,
  Waves,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  graficoActivo,
  useChartStore,
  type DrawingTool,
} from "@/lib/store/chart-store";
import { NOMBRES_DIBUJO } from "@/lib/dibujos/tipos";
import { cn } from "@/lib/utils";

interface Herramienta {
  key: DrawingTool;
  icon: typeof MousePointer2;
  label: string;
  hint?: string;
}

/** El cursor y la regla, que no dibujan nada. */
const BASICAS: Herramienta[] = [
  { key: "cursor", icon: MousePointer2, label: "Cursor", hint: "Mover el gráfico y seleccionar dibujos" },
  {
    key: "measure",
    icon: Ruler,
    label: "Regla / Medir",
    hint: "Dos clics para medir Δ precio, %, barras y volumen",
  },
];

/** Las de dibujar. Un clic para las de un punto, dos para las de dos. */
const DIBUJO: Herramienta[] = [
  { key: "tendencia", icon: TrendingUp, label: NOMBRES_DIBUJO.tendencia, hint: "Dos clics: inicio y fin" },
  { key: "horizontal", icon: Minus, label: NOMBRES_DIBUJO.horizontal, hint: "Un clic sobre el precio" },
  { key: "vertical", icon: MoveVertical, label: NOMBRES_DIBUJO.vertical, hint: "Un clic sobre la fecha" },
  { key: "rectangulo", icon: Square, label: NOMBRES_DIBUJO.rectangulo, hint: "Dos clics: esquinas opuestas" },
  { key: "flecha", icon: ArrowUpRight, label: NOMBRES_DIBUJO.flecha, hint: "Dos clics: de dónde a dónde" },
  { key: "fibonacci", icon: Waves, label: NOMBRES_DIBUJO.fibonacci, hint: "Dos clics: del 0 % al 100 %" },
  {
    key: "posicionLarga",
    icon: TrendingUp,
    label: NOMBRES_DIBUJO.posicionLarga,
    hint: "Dos clics: entrada y objetivo. El stop nace a 1:1 y se arrastra",
  },
  {
    key: "posicionCorta",
    icon: TrendingDown,
    label: NOMBRES_DIBUJO.posicionCorta,
    hint: "Dos clics: entrada y objetivo abajo. El stop nace arriba",
  },
  { key: "texto", icon: Type, label: NOMBRES_DIBUJO.texto, hint: "Un clic y se escribe" },
];

export function LeftSidebar() {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const borrarDibujosDe = useChartStore((s) => s.borrarDibujosDe);
  const symbol = useChartStore((s) => graficoActivo(s).symbol);
  const cuantos = useChartStore((s) => s.dibujos[graficoActivo(s).symbol]?.length ?? 0);

  const boton = (t: Herramienta) => {
    const Icon = t.icon;
    const activa = tool === t.key;
    return (
      <Tooltip key={t.key}>
        <TooltipTrigger
          onClick={() => setTool(t.key)}
          aria-label={t.label}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded transition-colors hover:bg-tv-panel-hover",
            activa
              ? "bg-tv-blue/15 text-tv-blue"
              : "text-tv-text-muted hover:text-tv-text",
          )}
        >
          <Icon className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          <div className="font-medium">{t.label}</div>
          {t.hint && (
            <div className="mt-0.5 text-[10px] text-tv-text-muted">{t.hint}</div>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <aside className="flex w-11 flex-col items-center gap-0.5 border-r border-tv-border bg-tv-panel py-1.5">
      {BASICAS.map(boton)}

      <div className="my-1 h-px w-6 bg-tv-border" />

      {DIBUJO.map(boton)}

      <div className="my-1 h-px w-6 bg-tv-border" />

      {/* Borrador: un clic sobre un dibujo lo borra. */}
      {boton({
        key: "eraser",
        icon: Trash2,
        label: "Borrador",
        hint: "Clic sobre un dibujo para borrarlo",
      })}

      <Tooltip>
        <TooltipTrigger
          onClick={() => {
            if (cuantos > 0) borrarDibujosDe(symbol);
          }}
          disabled={cuantos === 0}
          aria-label="Borrar todos los dibujos"
          className="relative flex h-8 w-8 items-center justify-center rounded text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red disabled:opacity-30"
        >
          <Trash2 className="h-4 w-4" />
          <span className="absolute -right-0 bottom-0.5 text-[8px] font-semibold">
            {cuantos > 0 ? cuantos : ""}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          <div className="font-medium">Borrar todos</div>
          <div className="mt-0.5 text-[10px] text-tv-text-muted">
            Saca los {cuantos} dibujos de este activo. Los dibujos quedan
            guardados hasta que los borres.
          </div>
        </TooltipContent>
      </Tooltip>
    </aside>
  );
}
