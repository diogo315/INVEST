"use client";

import { useMemo } from "react";
import { precioBS } from "@/lib/options/black-scholes";
import { useOptionsStore } from "@/lib/store/options-store";
import { Campo, Tarjeta } from "./ui";

const FILAS = 11;
const COLUMNAS = 7;

/**
 * Escala divergente: verde arriba de cero, rojo abajo, gris en el medio.
 * La intensidad es relativa al mayor movimiento de toda la matriz, así el
 * color dice "mucho o poco" dentro de este escenario y no en abstracto.
 */
function color(pnl: number, max: number): string {
  if (max <= 0) return "transparent";
  const t = Math.min(1, Math.abs(pnl) / max);
  const alpha = 0.08 + t * 0.42;
  return pnl >= 0
    ? `rgba(38, 166, 154, ${alpha})`
    : `rgba(239, 83, 80, ${alpha})`;
}

export function MatrizSimulacion() {
  const s = useOptionsStore();

  const datos = useMemo(() => {
    const base = {
      K: s.K,
      r: s.tasaPct / 100,
      q: s.divPct / 100,
      sigma: s.volPct / 100,
      tipo: s.tipo,
    };
    const precioHoy = precioBS({ ...base, S: s.S, T: s.dias / 365 });

    const precios: number[] = [];
    for (let i = 0; i < FILAS; i++) {
      const pct = -s.rangoPct + (2 * s.rangoPct * i) / (FILAS - 1);
      precios.push(s.S * (1 + pct / 100));
    }
    precios.reverse(); // el precio más alto arriba, como en cualquier chart

    const dias: number[] = [];
    for (let j = 0; j < COLUMNAS; j++) {
      dias.push(Math.round((s.dias * j) / (COLUMNAS - 1)));
    }

    let max = 0;
    const celdas = precios.map((S) =>
      dias.map((transcurridos) => {
        const restantes = Math.max(0, s.dias - transcurridos);
        const precio = precioBS({ ...base, S, T: restantes / 365 });
        const pnl = (precio - precioHoy) * 100; // un contrato de 100
        if (Math.abs(pnl) > max) max = Math.abs(pnl);
        return { precio, pnl };
      }),
    );

    return { precios, dias, celdas, max, precioHoy };
  }, [s.S, s.K, s.dias, s.volPct, s.tasaPct, s.divPct, s.tipo, s.rangoPct]);

  return (
    <Tarjeta
      titulo="Simulador de precio"
      subtitulo={`Qué valdría un contrato de ${s.tipo === "call" ? "call" : "put"} ${s.K} si el subyacente se mueve y pasa el tiempo. El color compara contra lo que vale hoy (${(datos.precioHoy * 100).toFixed(0)} USD el contrato); la volatilidad se mantiene fija en ${s.volPct}%.`}
    >
      <div className="mb-3 flex items-end gap-3">
        <Campo
          etiqueta="Rango del subyacente"
          valor={s.rangoPct}
          onChange={(v) => s.setCampo("rangoPct", Math.max(1, Math.min(90, v)))}
          sufijo="%"
          paso={5}
          ancho="w-36"
        />
        <p className="pb-2 text-[11px] text-tv-text-muted">
          Filas: precio del subyacente. Columnas: días transcurridos desde hoy.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-tv-panel px-2 py-1 text-left text-[10px] uppercase tracking-wider text-tv-text-muted">
                {s.simbolo}
              </th>
              {datos.dias.map((d) => (
                <th
                  key={d}
                  className="px-2 py-1 text-center text-[10px] font-normal uppercase tracking-wider text-tv-text-muted"
                >
                  {d === 0 ? "hoy" : d === s.dias ? "vence" : `+${d}d`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.precios.map((precio, i) => {
              const variacion = (precio / s.S - 1) * 100;
              const esActual = Math.abs(variacion) < 1e-9;
              return (
                <tr key={precio}>
                  <th
                    className={`sticky left-0 whitespace-nowrap bg-tv-panel px-2 py-1 text-right font-normal tabular-nums ${
                      esActual ? "text-tv-text" : "text-tv-text-muted"
                    }`}
                  >
                    {precio.toFixed(2)}
                    <span className="ml-1 text-[10px] text-tv-text-dim">
                      {variacion >= 0 ? "+" : "−"}
                      {Math.abs(variacion).toFixed(0)}%
                    </span>
                  </th>
                  {datos.celdas[i].map((c, j) => (
                    <td
                      key={j}
                      title={`Subyacente ${precio.toFixed(2)} · ${datos.dias[j]} días · contrato ${(c.precio * 100).toFixed(0)} USD · resultado ${c.pnl >= 0 ? "+" : "−"}${Math.abs(c.pnl).toFixed(0)} USD`}
                      className="rounded px-2 py-1 text-center tabular-nums text-tv-text"
                      style={{ backgroundColor: color(c.pnl, datos.max) }}
                    >
                      <div>{c.precio.toFixed(2)}</div>
                      <div className="text-[9px] text-tv-text-muted">
                        {c.pnl >= 0 ? "+" : "−"}
                        {Math.abs(c.pnl).toFixed(0)}
                      </div>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] text-tv-text-dim">
        Número grande: precio por acción. Número chico: resultado en dólares de
        un contrato contra el precio de hoy. Verde a favor, rojo en contra.
      </p>
    </Tarjeta>
  );
}
