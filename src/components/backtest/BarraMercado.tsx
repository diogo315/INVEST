"use client";

import { CampoNumero } from "./CampoNumero";
import {
  APALANCAMIENTOS,
  margenDeMovimiento,
  type ConfigFuturos,
} from "@/lib/backtest/futuros";
import { cn } from "@/lib/utils";

interface Props {
  mercado: "spot" | "futuros";
  futuros: ConfigFuturos;
  conComisiones: boolean;
  onMercado: (m: "spot" | "futuros") => void;
  onFuturos: (parche: Partial<ConfigFuturos>) => void;
  onComisiones: (v: boolean) => void;
}

/**
 * Spot o futuros, el apalancamiento y los costos.
 *
 * El aviso del margen de movimiento no es decorativo: es el único número
 * que convierte «20x» en algo que se entiende. A 20x se aguanta un 4,5 %
 * en contra, y bitcoin hace 4,5 % en un día cualquiera. Verlo al lado
 * del selector es la diferencia entre elegir y apostar.
 */
export function BarraMercado({
  mercado,
  futuros,
  conComisiones,
  onMercado,
  onFuturos,
  onComisiones,
}: Props) {
  const esFut = mercado === "futuros";
  const aguanta = margenDeMovimiento(futuros);
  // Por debajo de este margen, un día normal de bitcoin te liquida.
  const apretado = esFut && aguanta < 5;

  return (
    <div className="flex flex-col gap-2 border-b border-tv-border px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 rounded bg-tv-bg p-0.5">
          {(
            [
              ["spot", "Spot"],
              ["futuros", "Futuros"],
            ] as const
          ).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => onMercado(k)}
              title={
                k === "spot"
                  ? "Sin apalancamiento y sin liquidación: la posición inmoviliza todo su valor"
                  : "Con apalancamiento: inmoviliza menos capital, pero te pueden liquidar"
              }
              className={cn(
                "rounded px-2.5 py-1 text-[11px] transition-colors",
                mercado === k
                  ? "bg-tv-panel-hover text-tv-text"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <label
          className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-tv-text"
          title="Descontar comisión y financiamiento de los resultados. Apagarlo no cambia las operaciones: solo muestra el bruto."
        >
          <input
            type="checkbox"
            checked={conComisiones}
            onChange={(e) => onComisiones(e.target.checked)}
            className="h-3 w-3 accent-tv-blue"
          />
          Con comisiones
        </label>
      </div>

      {esFut && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-tv-text-muted">
              Apalancamiento
            </span>
            <div className="flex flex-wrap gap-0.5 rounded bg-tv-bg p-0.5">
              {APALANCAMIENTOS.map((l) => (
                <button
                  key={l}
                  type="button"
                  // Etiqueta propia: «10×» a secas choca con la velocidad
                  // del reproductor, que también dice «10×».
                  aria-label={`Apalancamiento ${l}x`}
                  onClick={() => onFuturos({ apalancamiento: l })}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
                    futuros.apalancamiento === l
                      ? l >= 20
                        ? "bg-tv-red/80 text-white"
                        : "bg-tv-blue text-white"
                      : "text-tv-text-muted hover:text-tv-text",
                  )}
                >
                  {l}×
                </button>
              ))}
            </div>
          </div>

          <p
            className={cn(
              "text-[10px] leading-relaxed",
              apretado ? "text-tv-red" : "text-tv-text-dim",
            )}
          >
            A {futuros.apalancamiento}× te liquidan con un{" "}
            <strong className="tabular-nums">{aguanta.toFixed(2)} %</strong> en
            contra
            {apretado && ", y bitcoin hace eso en un día cualquiera"}. El
            apalancamiento no multiplica la ganancia de una posición: inmoviliza
            menos capital, así que con el mismo dinero entra más nocional — y
            eso multiplica las dos cosas.
          </p>

          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                Comisión por lado (%)
              </span>
              <CampoNumero
                valor={futuros.comision}
                aria-label="Comisión por lado"
                paso={0.01}
                min={0}
                onCambiar={(v) => v !== null && onFuturos({ comision: v })}
                className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs tabular-nums text-tv-text"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                Financiamiento / 8 h (%)
              </span>
              <CampoNumero
                valor={futuros.financiamiento}
                aria-label="Financiamiento cada 8 horas"
                paso={0.005}
                onCambiar={(v) => v !== null && onFuturos({ financiamiento: v })}
                className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs tabular-nums text-tv-text"
              />
            </label>
          </div>
          <p className="text-[10px] leading-relaxed text-tv-text-dim">
            La comisión se paga sobre el NOCIONAL, no sobre el margen: a 10× una
            vuelta cuesta diez veces lo que costaría sin apalancar. El
            financiamiento lo paga el largo y lo cobra el corto, cada 8 h.
          </p>
        </div>
      )}
    </div>
  );
}
