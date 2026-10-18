"use client";

import { GRAFICOS_DE, useChartStore } from "@/lib/store/chart-store";
import { PriceChart } from "./PriceChart";

/**
 * Reparte los gráficos abiertos en la pantalla.
 *
 * Cada celda es un `PriceChart` completo y autónomo: su activo, su
 * temporalidad y sus indicadores. Al hacer clic en una, pasa a ser la
 * activa y la barra de arriba (buscador, temporalidades, indicadores) le
 * habla a esa.
 */
export function MultiChart() {
  const distribucion = useChartStore((s) => s.distribucion);
  // El recorte se hace acá y NO dentro del selector: un selector que
  // devuelve un array nuevo en cada llamada hace re-renderizar sin fin
  // (React error #185).
  const todos = useChartStore((s) => s.graficos);
  const graficos = todos.slice(0, GRAFICOS_DE[distribucion]);
  const activoId = useChartStore((s) => s.graficoActivoId);
  const activar = useChartStore((s) => s.activarGrafico);

  // Una sola celda: sin grilla ni marco, igual que siempre.
  if (distribucion === "1" || graficos.length === 1) {
    const g = graficos[0];
    return (
      <div className="h-full min-h-0 w-full min-w-0">
        <PriceChart
          key={g.id}
          graficoId={g.id}
          symbol={g.symbol}
          timeframe={g.timeframe}
        />
      </div>
    );
  }

  // `grid-rows-2` con `minmax(0,1fr)` para que las filas se puedan encoger:
  // sin eso el canvas de cada chart impone su alto y la grilla se desborda.
  // Las columnas y filas van con `minmax(0,1fr)` para que se puedan
  // encoger: sin eso el canvas de cada chart impone su tamaño y la grilla
  // se desborda.
  const una = "minmax(0,1fr)";
  const columnas =
    distribucion === "2h" ? una
    : distribucion === "3v" ? `${una} ${una} ${una}`
    : `${una} ${una}`;
  const filas = distribucion === "2v" || distribucion === "3v" ? una : `${una} ${una}`;

  return (
    <div
      className="grid h-full min-h-0 w-full min-w-0 gap-px bg-tv-border"
      style={{ gridTemplateColumns: columnas, gridTemplateRows: filas }}
    >
      {graficos.map((g, i) => (
        <div
          key={g.id}
          // En la vista de 3, el primero ocupa las dos columnas de arriba.
          style={
            distribucion === "3" && i === 0 ? { gridColumn: "span 2" } : undefined
          }
          onMouseDownCapture={() => activar(g.id)}
          data-activo={g.id === activoId ? "si" : "no"}
          className="relative min-h-0 min-w-0 bg-tv-bg"
        >
          <PriceChart
            graficoId={g.id}
            symbol={g.symbol}
            timeframe={g.timeframe}
            compacto
          />
          {/* El marco del gráfico activo va en una capa aparte y por encima:
              un borde en la celda queda tapado por el fondo del chart. */}
          {g.id === activoId && (
            <div className="pointer-events-none absolute inset-0 z-20 border border-tv-blue" />
          )}
        </div>
      ))}
    </div>
  );
}
