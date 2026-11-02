"use client";

import { Network } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useChartStore } from "@/lib/store/chart-store";
import type { VistaSMC } from "@/lib/smc/vista";
import type { ConfigSMC } from "@/lib/smc/motor";
import { cn } from "@/lib/utils";

/** Cada interruptor, con lo que hace en una línea. */
const PARTES: Array<{ clave: keyof VistaSMC; etiqueta: string; pista: string }> = [
  { clave: "estructuraInterna", etiqueta: "Estructura interna", pista: "BOS y CHoCH de los pivotes cortos" },
  { clave: "estructuraSwing", etiqueta: "Estructura de swing", pista: "BOS y CHoCH de los pivotes largos" },
  { clave: "bloquesInternos", etiqueta: "Bloques internos", pista: "Zonas de donde salió cada ruptura interna" },
  { clave: "bloquesSwing", etiqueta: "Bloques de swing", pista: "Lo mismo, de las rupturas largas" },
  { clave: "iguales", etiqueta: "Máximos/mínimos iguales", pista: "EQH y EQL" },
  { clave: "fvg", etiqueta: "Brechas de valor justo", pista: "FVG: huecos que el precio dejó sin negociar" },
  { clave: "extremos", etiqueta: "Extremos fuertes y débiles", pista: "El máximo y el mínimo que mandan" },
  { clave: "zonas", etiqueta: "Zonas premium/descuento", pista: "Caro, barato y el medio del tramo" },
  { clave: "nivelDiario", etiqueta: "Nivel del día anterior", pista: "Máximo y mínimo de ayer" },
  { clave: "nivelSemanal", etiqueta: "Nivel de la semana anterior", pista: "Máximo y mínimo de la semana pasada" },
  { clave: "nivelMensual", etiqueta: "Nivel del mes anterior", pista: "Máximo y mínimo del mes pasado" },
  { clave: "senales", etiqueta: "Señales BOS + retesteo", pista: "Las entradas con su stop y su objetivo" },
];

/**
 * Los ajustes del SMC.
 *
 * Va en un DIÁLOGO y no en un menú desplegable porque lleva campos de
 * número: Base UI no acepta contenido arbitrario dentro de un menú y la
 * página se caía al abrirlo con un error #31. Medido. Es el mismo camino
 * que ya había tomado el editor del VWAP, por la misma razón.
 *
 * Toca el store global: el indicador se ve igual en el Gráfico y en el
 * backtest. Que una pestaña muestre otra cosa con el mismo nombre sería
 * peor que no tenerlo.
 */
export function MenuSMC() {
  const activo = useChartStore((s) => s.smcActivo);
  const vista = useChartStore((s) => s.smcVista);
  const cfg = useChartStore((s) => s.smcCfg);
  const setActivo = useChartStore((s) => s.setSmcActivo);
  const setVista = useChartStore((s) => s.setSmcVista);
  const setCfg = useChartStore((s) => s.setSmcCfg);

  const puestas = PARTES.filter((p) => vista[p.clave] === true).length;

  const interruptor = (
    etiqueta: string,
    puesto: boolean,
    alternar: () => void,
    pista = "",
  ) => (
    <button
      key={etiqueta}
      type="button"
      role="switch"
      aria-checked={puesto}
      aria-label={etiqueta}
      title={pista}
      onClick={alternar}
      className={cn(
        "flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-left text-xs transition-colors",
        puesto
          ? "border-tv-blue/40 bg-tv-blue/10 text-tv-text"
          : "border-tv-border text-tv-text-muted hover:text-tv-text",
      )}
    >
      <span className="flex-1 leading-tight">{etiqueta}</span>
      <span
        aria-hidden
        className={cn(
          "h-3 w-3 shrink-0 rounded-sm border",
          puesto ? "border-tv-blue bg-tv-blue" : "border-tv-border",
        )}
      />
    </button>
  );

  const numero = (
    etiqueta: string,
    valor: number,
    poner: (n: number) => void,
    min: number,
    max: number,
    paso = 1,
    pista = "",
  ) => (
    <label key={etiqueta} className="flex items-center justify-between gap-2 text-xs" title={pista}>
      <span className="text-tv-text-muted">{etiqueta}</span>
      <input
        type="number"
        aria-label={etiqueta}
        value={valor}
        min={min}
        max={max}
        step={paso}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) poner(Math.min(max, Math.max(min, n)));
        }}
        className="w-24 rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 text-right font-mono text-[11px] text-tv-text"
      />
    </label>
  );

  const eleccion = <T extends string>(
    etiqueta: string,
    valor: T,
    opciones: Array<{ v: T; t: string }>,
    poner: (v: T) => void,
  ) => (
    <div key={etiqueta} className="flex items-center justify-between gap-2 text-xs">
      <span className="text-tv-text-muted">{etiqueta}</span>
      <div className="flex gap-0.5 rounded bg-tv-bg p-0.5">
        {opciones.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-label={`${etiqueta}: ${o.t}`}
            aria-pressed={valor === o.v}
            onClick={() => poner(o.v)}
            className={cn(
              "rounded px-2 py-0.5 text-[10px] transition-colors",
              valor === o.v
                ? "bg-tv-panel-hover text-tv-text"
                : "text-tv-text-muted hover:text-tv-text",
            )}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );

  const titulo = (t: string) => (
    <h3 className="mt-1 text-[10px] uppercase tracking-wider text-tv-text-dim">{t}</h3>
  );

  return (
    <Dialog>
      <DialogTrigger
        title="Smart Money Concepts (LuxAlgo)"
        aria-label="Indicador SMC"
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
          activo
            ? "bg-tv-blue/15 text-tv-blue"
            : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
        )}
      >
        <Network className="h-3.5 w-3.5" />
        <span>SMC</span>
        {activo && (
          <span className="rounded bg-tv-blue/20 px-1.5 py-0.5 text-[10px] font-semibold text-tv-blue">
            {puestas}
          </span>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Smart Money Concepts</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={activo}
            aria-label="Mostrar el indicador SMC"
            onClick={() => setActivo(!activo)}
            className={cn(
              "rounded px-3 py-2 text-xs font-semibold transition-colors",
              activo
                ? "bg-tv-blue text-white"
                : "border border-tv-border text-tv-text-muted hover:text-tv-text",
            )}
          >
            {activo ? "Indicador encendido" : "Mostrar el indicador"}
          </button>

          {titulo("Qué se ve")}
          <div className="grid grid-cols-2 gap-1.5">
            {PARTES.map((p) =>
              interruptor(
                p.etiqueta,
                vista[p.clave] === true,
                () => setVista({ [p.clave]: !vista[p.clave] } as Partial<VistaSMC>),
                p.pista,
              ),
            )}
          </div>

          {titulo("Cómo se ve")}
          <div className="flex flex-col gap-2">
            {eleccion(
              "Historial",
              vista.modo,
              [
                { v: "historico" as const, t: "Todo" },
                { v: "presente" as const, t: "Solo lo último" },
              ],
              (modo) => setVista({ modo }),
            )}
            {eleccion(
              "Colores",
              vista.estilo,
              [
                { v: "color" as const, t: "Color" },
                { v: "mono" as const, t: "Gris" },
              ],
              (estilo) => setVista({ estilo }),
            )}
          </div>

          {titulo("Cálculo")}
          <div className="flex flex-col gap-2">
            {numero("Largo del swing", cfg.largoSwing, (n) => setCfg({ largoSwing: n }), 5, 200, 1,
              "Velas a cada lado para dar por hecho un pivote largo. El original usa 50")}
            {numero("Largo interno", cfg.largoInterno, (n) => setCfg({ largoInterno: n }), 2, 50, 1,
              "Lo mismo para los pivotes cortos. El original usa 5")}
            {numero("Bloques internos a la vista", cfg.maxBloquesInternos,
              (n) => setCfg({ maxBloquesInternos: n }), 1, 20)}
            {numero("Bloques de swing a la vista", cfg.maxBloquesSwing,
              (n) => setCfg({ maxBloquesSwing: n }), 1, 20)}
            {eleccion(
              "Filtro de bloques",
              cfg.filtroBloques,
              [
                { v: "atr" as const, t: "ATR" },
                { v: "rango" as const, t: "Rango medio" },
              ],
              (filtroBloques) => setCfg({ filtroBloques } as Partial<ConfigSMC>),
            )}
            {eleccion(
              "Un bloque muere con",
              cfg.mitigacionBloques,
              [
                { v: "maxmin" as const, t: "La mecha" },
                { v: "cierre" as const, t: "El cierre" },
              ],
              (mitigacionBloques) => setCfg({ mitigacionBloques } as Partial<ConfigSMC>),
            )}
            {numero("Umbral de iguales (en ATR)", cfg.umbralIguales,
              (n) => setCfg({ umbralIguales: n }), 0, 0.5, 0.05,
              "Cuán cerca tienen que estar dos máximos para llamarlos iguales")}
          </div>

          {titulo("Señales BOS + retesteo")}
          <div className="flex flex-col gap-2">
            {eleccion(
              "Estructura",
              cfg.senales.estructura,
              [
                { v: "interna" as const, t: "Interna" },
                { v: "swing" as const, t: "Swing" },
              ],
              (estructura) => setCfg({ senales: { ...cfg.senales, estructura } }),
            )}
            {numero("Velas de espera del retesteo", cfg.senales.expiracion,
              (n) => setCfg({ senales: { ...cfg.senales, expiracion: n } }), 1, 100)}
            {numero("Tolerancia del retesteo (ticks)", cfg.senales.toleranciaTicks,
              (n) => setCfg({ senales: { ...cfg.senales, toleranciaTicks: n } }), 0, 200)}
            {numero("Margen del stop (ticks)", cfg.senales.margenTicks,
              (n) => setCfg({ senales: { ...cfg.senales, margenTicks: n } }), 1, 500)}
            {numero("Tamaño del tick", cfg.senales.tick,
              (n) => setCfg({ senales: { ...cfg.senales, tick: n } }), 0.00000001, 1000, 0.01,
              "El paso mínimo de precio del mercado. En BTCUSDT es 0,01")}
            {numero("Objetivo sin obstáculos (en R)", cfg.senales.objetivoR,
              (n) => setCfg({ senales: { ...cfg.senales, objetivoR: n } }), 0.5, 20, 0.1)}
            {numero("Relación mínima para entrar", cfg.senales.relacionMinima,
              (n) => setCfg({ senales: { ...cfg.senales, relacionMinima: n } }), 0.1, 20, 0.1)}
            {interruptor(
              "Los bloques de swing también acortan el objetivo",
              cfg.senales.usarBloquesSwing,
              () =>
                setCfg({
                  senales: { ...cfg.senales, usarBloquesSwing: !cfg.senales.usarBloquesSwing },
                }),
              "Viene apagado, que es lo que hace el original con sus valores de fábrica",
            )}
          </div>

          <p className="border-t border-tv-border pt-2 text-[10px] leading-relaxed text-tv-text-dim">
            Portado del indicador «Smart Money Concepts» de LuxAlgo, bajo licencia
            CC BY-NC-SA 4.0. Las entradas BOS + retesteo son la modificación de
            Diego sobre ese indicador. El tamaño de las operaciones no viene del
            original: lo agrega el backtest.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
