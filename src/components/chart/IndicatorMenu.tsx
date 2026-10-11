"use client";

import { useState } from "react";
import { Activity, Check, Trash2 } from "lucide-react";
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
  INDICADORES_CON_PANEL,
  MAX_PANELES_INDICADOR,
  MAX_PLANTILLAS,
  panelesActivos,
  useChartStore,
  type IndicatorConfig,
  type IndicatorKey,
  graficoActivo,
} from "@/lib/store/chart-store";

interface Entry {
  key: IndicatorKey;
  label: (cfg: IndicatorConfig) => string;
  group: string;
}

const ENTRIES: Entry[] = [
  {
    key: "medias",
    group: "Medias móviles",
    // La cantidad sale del store, no del config: la lista es variable.
    label: () => "Medias móviles",
  },
  {
    key: "vwap",
    group: "Medias móviles",
    label: (c) =>
      `VWAP (${
        { session: "Sesión", week: "Semana", month: "Mes", quarter: "Trimestre", year: "Año" }[
          c.vwapAnchor
        ] ?? c.vwapAnchor
      })`,
  },
  {
    key: "dema",
    group: "Medias móviles",
    label: (c) => `DEMA (${c.demaLength})`,
  },
  {
    key: "alligator",
    group: "Medias móviles",
    label: (c) =>
      `Alligator (${c.alligatorMandibula}, ${c.alligatorDientes}, ${c.alligatorLabios})`,
  },
  {
    key: "bb",
    group: "Volatilidad",
    label: (c) => `Bollinger (${c.bbPeriod}, ${c.bbStdDev})`,
  },
  {
    key: "keltner",
    group: "Volatilidad",
    label: (c) => `Canales de Keltner (${c.keltnerLength}, ${c.keltnerMult})`,
  },
  {
    key: "atr",
    group: "Volatilidad",
    label: (c) => `ATR (${c.atrLength})`,
  },
  {
    key: "adr",
    group: "Volatilidad",
    label: (c) => `Rango promedio ADR (${c.adrLength})`,
  },
  {
    key: "supertrend",
    group: "Tendencia",
    label: (c) => `Supertrend (${c.supertrendAtr}, ${c.supertrendFactor})`,
  },
  {
    key: "sar",
    group: "Tendencia",
    label: (c) => `Parabolic SAR (${c.sarStart}, ${c.sarInc}, ${c.sarMax})`,
  },
  {
    key: "aroon",
    group: "Tendencia",
    label: (c) => `Aroon (${c.aroonLength})`,
  },
  { key: "volume", group: "Volumen", label: () => "Volumen" },
  {
    key: "obv",
    group: "Volumen",
    label: () => "OBV (volumen en balance)",
  },
  { key: "rsi", group: "Osciladores", label: (c) => `RSI (${c.rsi})` },
  {
    key: "macd",
    group: "Osciladores",
    label: (c) => `MACD (${c.macdFast}, ${c.macdSlow}, ${c.macdSignal})`,
  },
  {
    key: "stoch",
    group: "Osciladores",
    label: (c) => `Stochastic (${c.stochK}, ${c.stochD}, ${c.stochSmooth})`,
  },
  {
    key: "srsi",
    group: "Osciladores",
    label: (c) =>
      `Stoch RSI (${c.srsiK}, ${c.srsiD}, ${c.srsiRsiLen}, ${c.srsiStochLen})`,
  },
  {
    key: "ao",
    group: "Osciladores",
    label: (c) => `Awesome Oscillator (${c.aoFast}, ${c.aoSlow})`,
  },
  { key: "cipher", group: "VuManChu", label: () => "Cipher B (WaveTrend)" },
  { key: "gli", group: "Macro", label: () => "Global Liquidity (M2)" },
];

export function IndicatorMenu() {
  const indicators = useChartStore((s) => graficoActivo(s).indicators);
  const config = useChartStore((s) => graficoActivo(s).config);
  const toggle = useChartStore((s) => s.toggleIndicator);
  const plantillas = useChartStore((s) => s.plantillas);
  const guardarPlantilla = useChartStore((s) => s.guardarPlantilla);
  const aplicarPlantilla = useChartStore((s) => s.aplicarPlantilla);
  const borrarPlantilla = useChartStore((s) => s.borrarPlantilla);
  // Nombre de la plantilla nueva. Se escribe en el propio menú para no
  // abrir un diálogo encima de otro menú.
  const [nombre, setNombre] = useState("");

  const groups = ENTRIES.reduce<Record<string, Entry[]>>((acc, i) => {
    (acc[i.group] ||= []).push(i);
    return acc;
  }, {});

  const activeCount = Object.values(indicators).filter(Boolean).length;
  const paneles = panelesActivos(indicators);
  const enElTope = paneles >= MAX_PANELES_INDICADOR;
  /** Un indicador con panel propio no se puede prender si ya está en el tope. */
  const bloqueado = (key: IndicatorKey) =>
    enElTope && INDICADORES_CON_PANEL.includes(key) && !indicators[key];
  const puedeGuardar =
    nombre.trim().length > 0 && plantillas.length < MAX_PLANTILLAS;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text hover:bg-tv-panel-hover">
        <Activity className="h-3.5 w-3.5" />
        <span>Indicadores</span>
        {activeCount > 0 && (
          <span className="ml-1 rounded bg-tv-blue/20 px-1.5 py-0.5 text-[10px] font-semibold text-tv-blue">
            {activeCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 bg-tv-panel">
        {Object.entries(groups).map(([group, items], idx) => (
          <DropdownMenuGroup key={group}>
            {idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              {group}
            </DropdownMenuLabel>
            {items.map((i) => (
              <DropdownMenuItem
                key={i.key}
                closeOnClick={false}
                disabled={bloqueado(i.key)}
                onClick={() => toggle(i.key)}
                title={
                  bloqueado(i.key)
                    ? `Máximo ${MAX_PANELES_INDICADOR} paneles de indicadores: apagá uno para poder agregar este`
                    : undefined
                }
                className="flex items-center justify-between text-xs"
              >
                <span>{i.label(config)}</span>
                {indicators[i.key] && <Check className="h-3.5 w-3.5 text-tv-blue" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Plantillas
          </DropdownMenuLabel>
          {plantillas.length === 0 && (
            <div className="px-2 pb-1 text-[10px] leading-relaxed text-tv-text-muted">
              Guardá los indicadores de este gráfico con un nombre y
              aplicalos después a cualquier otro.
            </div>
          )}
          {plantillas.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1 px-1 py-0.5 text-xs text-tv-text"
            >
              <button
                type="button"
                onClick={() => aplicarPlantilla(p.id)}
                title={`Aplicar «${p.nombre}» al gráfico activo`}
                className="flex-1 truncate rounded px-1.5 py-1 text-left hover:bg-tv-panel-hover"
              >
                {p.nombre}
              </button>
              <button
                type="button"
                onClick={() => borrarPlantilla(p.id)}
                title={`Borrar «${p.nombre}»`}
                aria-label={`Borrar la plantilla ${p.nombre}`}
                className="rounded p-1 text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-red"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1 px-1 pb-1 pt-0.5">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value.slice(0, 40))}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && puedeGuardar) {
                  guardarPlantilla(nombre);
                  setNombre("");
                }
              }}
              placeholder="Nombre de la plantilla"
              aria-label="Nombre de la plantilla"
              className="min-w-0 flex-1 rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs text-tv-text outline-none placeholder:text-tv-text-dim focus:border-tv-blue"
            />
            <button
              type="button"
              disabled={!puedeGuardar}
              onClick={() => {
                guardarPlantilla(nombre);
                setNombre("");
              }}
              title="Guardar los indicadores de este gráfico"
              className="rounded bg-tv-blue/20 px-2 py-1 text-[11px] font-medium text-tv-blue hover:bg-tv-blue/30 disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[10px] text-tv-text-muted">
          Paneles: {paneles}/{MAX_PANELES_INDICADOR}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
