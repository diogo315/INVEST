"use client";

import { useMemo } from "react";
import { griegasBS, volImplicita } from "@/lib/options/black-scholes";
import { useOptionsStore } from "@/lib/store/options-store";
import { Campo, CampoTexto, Dato, Segmentado, Tarjeta, money, num } from "./ui";

export function Calculadora() {
  const s = useOptionsStore();

  const params = useMemo(
    () => ({
      S: s.S,
      K: s.K,
      T: s.dias / 365,
      r: s.tasaPct / 100,
      q: s.divPct / 100,
      sigma: s.volPct / 100,
      tipo: s.tipo,
    }),
    [s.S, s.K, s.dias, s.tasaPct, s.divPct, s.volPct, s.tipo],
  );

  const g = useMemo(() => griegasBS(params), [params]);

  const iv = useMemo(
    () => volImplicita(s.precioMercado, { ...params }),
    [s.precioMercado, params],
  );

  const porContrato = g.precio * 100;

  return (
    <Tarjeta
      titulo="Calculadora de opciones"
      subtitulo="Black-Scholes-Merton para opciones europeas sobre acciones con dividendo. Los valores están verificados contra scipy con error menor a 1e-8."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <CampoTexto
          etiqueta="Subyacente"
          valor={s.simbolo}
          onChange={(v) => s.setCampo("simbolo", v)}
        />
        <Campo
          etiqueta="Precio"
          valor={s.S}
          onChange={(v) => s.setCampo("S", v)}
          paso={0.01}
          sufijo="$"
        />
        <Campo
          etiqueta="Strike"
          valor={s.K}
          onChange={(v) => s.setCampo("K", v)}
          paso={0.5}
          sufijo="$"
        />
        <Campo
          etiqueta="Días"
          valor={s.dias}
          onChange={(v) => s.setCampo("dias", Math.max(0, v))}
          min={0}
        />
        <Campo
          etiqueta="Volatilidad"
          valor={s.volPct}
          onChange={(v) => s.setCampo("volPct", Math.max(0, v))}
          paso={0.5}
          sufijo="%"
        />
        <Campo
          etiqueta="Tasa"
          valor={s.tasaPct}
          onChange={(v) => s.setCampo("tasaPct", v)}
          paso={0.25}
          sufijo="%"
        />
        <Campo
          etiqueta="Dividendo"
          valor={s.divPct}
          onChange={(v) => s.setCampo("divPct", Math.max(0, v))}
          paso={0.1}
          sufijo="%"
        />
        <Segmentado
          etiqueta="Tipo"
          valor={s.tipo}
          onChange={(v) => s.setCampo("tipo", v)}
          opciones={[
            { valor: "call", texto: "Call" },
            { valor: "put", texto: "Put" },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Dato
          nombre="Precio teórico"
          valor={`${money(g.precio)} · ${money(porContrato, 0)} el contrato`}
          destacado
          explicacion="Por acción y por contrato de 100"
        />
        <Dato
          nombre="Delta"
          valor={num(g.delta, 4)}
          explicacion={`Si el subyacente sube $1, la opción ${g.delta >= 0 ? "sube" : "baja"} ${money(Math.abs(g.delta))}`}
        />
        <Dato
          nombre="Gamma"
          valor={num(g.gamma, 5)}
          explicacion="Cuánto se mueve el delta por cada $1"
        />
        <Dato
          nombre="Theta"
          valor={money(g.theta)}
          explicacion="Lo que pierde por acción cada día que pasa"
        />
        <Dato
          nombre="Vega"
          valor={money(g.vega)}
          explicacion="Cambio por cada punto que sube la volatilidad"
        />
        <Dato
          nombre="Rho"
          valor={money(g.rho)}
          explicacion="Cambio por cada punto que sube la tasa"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded border border-tv-border bg-tv-bg p-3">
        <Campo
          etiqueta="Precio de mercado"
          valor={s.precioMercado}
          onChange={(v) => s.setCampo("precioMercado", v)}
          paso={0.05}
          sufijo="$"
          ancho="w-36"
        />
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Volatilidad implícita despejada
          </div>
          {iv === null ? (
            <div className="text-sm text-tv-red">
              Ese precio no tiene solución: queda fuera de los límites de no
              arbitraje para este contrato.
            </div>
          ) : (
            <div className="text-sm text-tv-text">
              <span className="text-lg font-semibold tabular-nums">
                {(iv * 100).toFixed(2)}%
              </span>
              <span className="ml-2 text-[11px] text-tv-text-muted">
                {Math.abs(iv * 100 - s.volPct) < 0.01
                  ? "igual a la volatilidad que cargaste"
                  : `${iv * 100 > s.volPct ? "por encima" : "por debajo"} de la que cargaste (${s.volPct}%) — el mercado la está pagando ${iv * 100 > s.volPct ? "más cara" : "más barata"}`}
              </span>
            </div>
          )}
        </div>
        {iv !== null && (
          <button
            onClick={() => s.setCampo("volPct", Number((iv * 100).toFixed(2)))}
            className="rounded border border-tv-border px-3 py-1.5 text-xs text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
          >
            Usar esta volatilidad
          </button>
        )}
      </div>
    </Tarjeta>
  );
}
