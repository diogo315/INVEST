"use client";

import {
  ArrowUpRight,
  Minus,
  MousePointer2,
  MoveVertical,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Type,
  Waves,
} from "lucide-react";
import { NOMBRES_DIBUJO } from "@/lib/dibujos/tipos";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

interface Props {
  /** Clave con la que se guardan los dibujos de este backtest. */
  clave: string;
}

interface Herramienta {
  key: DrawingTool;
  icon: typeof MousePointer2;
  label: string;
  pista: string;
}

const HERRAMIENTAS: Herramienta[] = [
  { key: "cursor", icon: MousePointer2, label: "Cursor", pista: "Seleccionar y mover dibujos" },
  { key: "tendencia", icon: TrendingUp, label: NOMBRES_DIBUJO.tendencia, pista: "Dos clics: inicio y fin" },
  { key: "horizontal", icon: Minus, label: NOMBRES_DIBUJO.horizontal, pista: "Un clic sobre el precio" },
  { key: "vertical", icon: MoveVertical, label: NOMBRES_DIBUJO.vertical, pista: "Un clic sobre la fecha" },
  { key: "rectangulo", icon: Square, label: NOMBRES_DIBUJO.rectangulo, pista: "Dos clics: esquinas opuestas" },
  { key: "flecha", icon: ArrowUpRight, label: NOMBRES_DIBUJO.flecha, pista: "Dos clics: de dónde a dónde" },
  { key: "fibonacci", icon: Waves, label: NOMBRES_DIBUJO.fibonacci, pista: "Dos clics: del 0 % al 100 %" },
  {
    key: "posicionLarga",
    icon: TrendingUp,
    label: NOMBRES_DIBUJO.posicionLarga,
    pista: "Dos clics: entrada y objetivo. El stop nace a 1:1 y se arrastra",
  },
  {
    key: "posicionCorta",
    icon: TrendingDown,
    label: NOMBRES_DIBUJO.posicionCorta,
    pista: "Dos clics: entrada y objetivo abajo. El stop nace arriba",
  },
  { key: "texto", icon: Type, label: NOMBRES_DIBUJO.texto, pista: "Un clic y se escribe" },
];

/**
 * La caja de herramientas del backtest.
 *
 * Usa el MISMO sistema de dibujo que la pestaña Gráfico —mismas figuras,
 * mismo arrastre, mismo guardado— en vez de uno propio. Tener dos
 * sistemas de dibujo significaría arreglar cada cosa dos veces y que se
 * comportaran distinto sin que nadie supiera por qué.
 *
 * Lo que NO comparte es dónde se guardan los dibujos: van bajo una clave
 * del backtest, así que anotar una repetición no ensucia el gráfico en
 * vivo ni al revés.
 */
export function BarraDibujo({ clave }: Props) {
  const tool = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const borrarDibujosDe = useChartStore((s) => s.borrarDibujosDe);
  const cuantos = useChartStore((s) => s.dibujos[clave]?.length ?? 0);

  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5 border-r border-tv-border bg-tv-panel px-1 py-1.5">
      {HERRAMIENTAS.map((h) => {
        const Icono = h.icon;
        const activa = tool === h.key;
        const corta = h.key === "posicionCorta";
        const larga = h.key === "posicionLarga";
        return (
          <button
            key={h.key}
            type="button"
            onClick={() => setTool(activa ? "cursor" : h.key)}
            aria-pressed={activa}
            aria-label={h.label}
            title={`${h.label} — ${h.pista}`}
            className={cn(
              "rounded p-1.5 transition-colors",
              activa
                ? "bg-tv-blue text-white"
                : larga
                  ? "text-tv-green hover:bg-tv-panel-hover"
                  : corta
                    ? "text-tv-red hover:bg-tv-panel-hover"
                    : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
            )}
          >
            <Icono className="h-4 w-4" />
          </button>
        );
      })}

      <div className="my-1 h-px w-5 bg-tv-border" />

      <button
        type="button"
        onClick={() => {
          // Se pregunta antes: borrar diez dibujos de una repetición
          // larga sin poder deshacer es un disgusto, no una comodidad.
          if (cuantos === 0) return;
          if (confirm(`¿Borrar los ${cuantos} dibujos de este backtest?`)) {
            borrarDibujosDe(clave);
          }
        }}
        disabled={cuantos === 0}
        aria-label="Borrar todos los dibujos"
        title={
          cuantos === 0
            ? "No hay dibujos que borrar"
            : `Borrar los ${cuantos} dibujos de este backtest`
        }
        className="rounded p-1.5 text-tv-text-muted transition-colors hover:bg-tv-red/15 hover:text-tv-red disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {cuantos > 0 && (
        <span className="font-mono text-[9px] tabular-nums text-tv-text-dim">
          {cuantos}
        </span>
      )}
    </div>
  );
}
