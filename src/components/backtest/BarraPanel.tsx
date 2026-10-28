"use client";

import { GraficoBacktest } from "./GraficoBacktest";
import { IndicadoresMenu } from "./IndicadoresMenu";
import { EditorMedias } from "./EditorMedias";
import { EditorVwap } from "./EditorVwap";
import { BarraDibujo } from "./BarraDibujo";
import type { IndicatorConfig } from "@/lib/store/chart-store";
import { TEMPORALIDADES_BT } from "@/lib/backtest/multi";
import type { Panel } from "@/lib/store/backtest-store";
import type { MediaMovil } from "@/lib/chart/medias";
import type { Cual, NivelDibujado } from "./CapaNiveles";
import type { Operacion } from "@/lib/backtest/tipos";
import type { Candle, Timeframe } from "@/lib/binance/types";
import { cn } from "@/lib/utils";

interface Props {
  panel: Panel;
  temporalidad: string;
  indicadores: string[];
  medias: MediaMovil[];
  /** true cuando esta gráfica es la que manda el reproductor. */
  esBase: boolean;
  /** Hay dos gráficas: solo entonces tiene sentido elegir cuál manda. */
  hayDos: boolean;
  cargando: boolean;
  // Lo que necesita el gráfico.
  desde: number;
  visibles: Candle[];
  operaciones: Operacion[];
  curva: Array<{ time: number; value: number }>;
  vencimientos: Array<{ time: number; etiqueta: string }>;
  zona: string;
  onTemporalidad: (tf: Timeframe, panel: Panel) => void;
  onAlternar: (clave: string, panel: Panel) => void;
  onMedias: (medias: MediaMovil[], panel: Panel) => void;
  onBase: (panel: Panel) => void;
  /** Niveles arrastrables: solo llegan a la gráfica base. */
  niveles?: NivelDibujado[];
  onMoverNivel?: (opId: string, cual: Cual, precio: number) => void;
  config: IndicatorConfig;
  onConfig: (parche: Record<string, unknown>) => void;
  /** Clave de los dibujos de este backtest; sin ella no hay caja de herramientas. */
  claveDibujos?: string;
}

/** Una de las gráficas del backtest, con sus propios controles arriba. */
export function BarraPanel({
  panel,
  temporalidad,
  indicadores,
  medias,
  esBase,
  hayDos,
  cargando,
  desde,
  visibles,
  operaciones,
  curva,
  vencimientos,
  zona,
  onTemporalidad,
  onAlternar,
  onMedias,
  onBase,
  niveles,
  onMoverNivel,
  config,
  onConfig,
  claveDibujos,
}: Props) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-tv-border bg-tv-panel px-2 py-1">
        {hayDos && (
          // El botón dice quién manda el play. Es el dato que más cambia
          // lo que ves: el paso del reproductor es una vela de ESTA
          // temporalidad, y su cierre marca hasta dónde se sabe.
          <button
            onClick={() => onBase(panel)}
            title={
              esBase
                ? "El reproductor avanza una vela de esta gráfica"
                : "Hacer que el reproductor avance con esta gráfica"
            }
            aria-pressed={esBase}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
              esBase
                ? "bg-tv-blue text-white"
                : "border border-tv-border text-tv-text-muted hover:text-tv-text",
            )}
          >
            Base
          </button>
        )}
        <div className="flex gap-0.5 rounded bg-tv-bg p-0.5">
          {TEMPORALIDADES_BT.map((t) => (
            <button
              key={t}
              onClick={() => onTemporalidad(t as Timeframe, panel)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] transition-colors",
                t === temporalidad
                  ? "bg-tv-panel-hover text-tv-text"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <IndicadoresMenu
          puestos={indicadores}
          onAlternar={(clave) => onAlternar(clave, panel)}
        />
        <EditorMedias medias={medias} onCambiar={(m) => onMedias(m, panel)} />
        {/* El ajuste del VWAP aparece solo cuando el VWAP está puesto:
            una barra con los ajustes de todos los indicadores apagados
            no deja ver los que sí importan. */}
        {indicadores.includes("vwap") && (
          <EditorVwap config={config} onCambiar={onConfig} />
        )}
      </div>
      <div className="flex min-h-[280px] flex-1 lg:min-h-0">
      {/* La caja de herramientas va PEGADA a su gráfica, no en una barra
          global: con dos gráficas abiertas, una sola barra no diría
          sobre cuál de las dos se está dibujando. */}
      {claveDibujos && <BarraDibujo clave={claveDibujos} />}
      {/* `min-w-0` no es decorativo: dentro de una fila flex, un hijo
          `flex-1` no puede encogerse por debajo del ancho de su
          contenido, y el lienzo del gráfico conserva el ancho que tuvo.
          Medido: al plegar y desplegar el panel lateral, la gráfica se
          quedaba en 1.446 px en vez de volver a 1.106. */}
      <div className="relative min-h-0 min-w-0 flex-1">
        {cargando && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-tv-bg/70 text-xs text-tv-text-muted">
            Bajando velas…
          </div>
        )}
        <GraficoBacktest
          desde={desde}
          visibles={visibles}
          operaciones={operaciones}
          curva={curva}
          indicadores={indicadores}
          medias={medias}
          vencimientos={vencimientos}
          zona={zona}
          temporalidad={temporalidad}
          config={config}
          claveDibujos={claveDibujos}
          // Las dos gráficas comparten los dibujos pero no la selección.
          idGrafico={claveDibujos ? `${claveDibujos}:${panel}` : undefined}
          niveles={niveles}
          onMoverNivel={onMoverNivel}
        />
      </div>
      </div>
    </div>
  );
}
