"use client";

import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  MULTIPLICADOR,
  cadenaEn,
  vencimientosDesde,
} from "@/lib/backtest/cadena";
import type { Operacion } from "@/lib/backtest/tipos";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  /** Precio del subyacente en el momento del backtest. */
  precio: number;
  tiempo: number;
  /** Volatilidad realizada hasta este momento. */
  vol: number;
  /** Efectivo libre: no se deja abrir lo que no se puede pagar. */
  efectivo: number;
  /** Las opciones solo existen sobre acciones y ETFs. */
  permiteOpciones: boolean;
  onOperar: (op: Omit<Operacion, "id">) => void;
}

type Modo = "activo" | "opciones";

/** Decidir y ejecutar: comprar o vender el activo, o abrir un call o put. */
export function PanelOperar({
  precio,
  tiempo,
  vol,
  efectivo,
  permiteOpciones,
  onOperar,
}: Props) {
  const [modo, setModo] = useState<Modo>("activo");
  /**
   * `null` quiere decir «la que entre». Con 1.000 de capital y un papel a
   * 300, una cantidad fija de 10 no se puede comprar nunca y el botón
   * aparece siempre apagado; así arranca en lo máximo que alcanza y solo
   * se queda fija cuando el usuario escribe un número.
   */
  const [cantidadManual, setCantidadManual] = useState<number | null>(null);
  const [contratos, setContratos] = useState(1);
  const [idxVenc, setIdxVenc] = useState(0);

  const vencimientos = useMemo(
    () => vencimientosDesde(tiempo, 6),
    [tiempo],
  );
  const vencimiento = vencimientos[Math.min(idxVenc, vencimientos.length - 1)];
  const cadena = useMemo(
    () => (precio > 0 ? cadenaEn(precio, tiempo, vencimiento, vol, 6) : []),
    [precio, tiempo, vencimiento, vol],
  );

  const maximo = precio > 0 ? Math.max(1, Math.floor(efectivo / precio)) : 1;
  const cantidad = cantidadManual ?? maximo;
  const costoActivo = cantidad * precio;
  const alcanza = costoActivo <= efectivo + 0.01;

  const operarActivo = (lado: "compra" | "venta") =>
    onOperar({
      instrumento: "activo",
      lado,
      cantidad,
      precioEntrada: precio,
      tiempoEntrada: tiempo,
    });

  const operarOpcion = (
    tipo: "call" | "put",
    strike: number,
    prima: number,
    lado: "compra" | "venta",
  ) =>
    onOperar({
      instrumento: tipo,
      lado,
      cantidad: contratos,
      precioEntrada: prima,
      tiempoEntrada: tiempo,
      strike,
      vencimiento,
      volEntrada: vol,
    });

  return (
    <div className="flex flex-col gap-3 border-b border-tv-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-0.5 rounded bg-tv-bg p-0.5">
          <button
            onClick={() => setModo("activo")}
            className={cn(
              "rounded px-2.5 py-1 text-[11px] transition-colors",
              modo === "activo"
                ? "bg-tv-panel-hover text-tv-text"
                : "text-tv-text-muted hover:text-tv-text",
            )}
          >
            Activo
          </button>
          <button
            onClick={() => setModo("opciones")}
            disabled={!permiteOpciones}
            title={
              permiteOpciones
                ? undefined
                : "Solo las acciones y los ETF de EE. UU. tienen opciones"
            }
            className={cn(
              "rounded px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-30",
              modo === "opciones"
                ? "bg-tv-panel-hover text-tv-text"
                : "text-tv-text-muted hover:text-tv-text",
            )}
          >
            Opciones
          </button>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-tv-text-muted">
          libre ${efectivo.toFixed(0)}
        </span>
      </div>

      {modo === "activo" ? (
        <>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                Cantidad
              </span>
              <input
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) =>
                  setCantidadManual(
                    Math.max(1, Math.round(Number(e.target.value) || 1)),
                  )
                }
                className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs tabular-nums text-tv-text"
              />
            </label>
            <div className="flex-1 pb-1.5 text-[11px] text-tv-text-muted">
              <div className="tabular-nums">{formatPrice(costoActivo)}</div>
              <div className="text-[10px] text-tv-text-dim">
                {cantidad} × {formatPrice(precio)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCantidadManual(null)}
              title={`Lo máximo que entra con el efectivo libre: ${maximo}`}
              className="mb-1.5 shrink-0 rounded border border-tv-border px-2 py-1 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            >
              Máx {maximo}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => operarActivo("compra")}
              disabled={!alcanza}
              className="flex flex-1 items-center justify-center gap-1.5 rounded bg-tv-green/90 py-2 text-xs font-medium text-white hover:bg-tv-green disabled:cursor-not-allowed disabled:opacity-30"
            >
              <TrendingUp className="h-3.5 w-3.5" /> Comprar
            </button>
            <button
              onClick={() => operarActivo("venta")}
              disabled={!alcanza}
              className="flex flex-1 items-center justify-center gap-1.5 rounded bg-tv-red/90 py-2 text-xs font-medium text-white hover:bg-tv-red disabled:cursor-not-allowed disabled:opacity-30"
            >
              <TrendingDown className="h-3.5 w-3.5" /> Vender
            </button>
          </div>
          {!alcanza && (
            <p className="text-[10px] text-tv-red">
              No te alcanza el efectivo libre para esa cantidad. Con $
              {efectivo.toFixed(0)} entran {maximo}.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                Contratos
              </span>
              <input
                type="number"
                min={1}
                value={contratos}
                onChange={(e) =>
                  setContratos(Math.max(1, Math.round(Number(e.target.value) || 1)))
                }
                className="w-20 rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs tabular-nums text-tv-text"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                Vencimiento
              </span>
              <select
                value={idxVenc}
                onChange={(e) => setIdxVenc(Number(e.target.value))}
                className="rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs text-tv-text"
              >
                {vencimientos.map((v, i) => (
                  <option key={v} value={i}>
                    {new Date(v * 1000).toISOString().slice(0, 10)} ·{" "}
                    {Math.round((v - tiempo) / 86400)} d
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="overflow-hidden rounded border border-tv-border">
            <div className="grid grid-cols-[1fr_auto_1fr] bg-tv-bg px-2 py-1 text-[9px] uppercase tracking-wider text-tv-text-dim">
              <span>Call</span>
              <span className="px-2 text-center">Strike</span>
              <span className="text-right">Put</span>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {cadena.map((f) => {
                const dentroCall = f.strike < precio;
                const dentroPut = f.strike > precio;
                return (
                  <div
                    key={f.strike}
                    className="grid grid-cols-[1fr_auto_1fr] items-center border-b border-tv-border/50 text-[11px] last:border-b-0"
                  >
                    <button
                      onClick={() =>
                        operarOpcion("call", f.strike, f.call.prima, "compra")
                      }
                      title={`Comprar ${contratos} call ${f.strike} · ${(f.call.prima * contratos * MULTIPLICADOR).toFixed(0)} USD · delta ${f.call.delta.toFixed(2)}`}
                      className={cn(
                        "px-2 py-1.5 text-left tabular-nums hover:bg-tv-green/15",
                        dentroCall ? "text-tv-text" : "text-tv-text-muted",
                      )}
                    >
                      {f.call.prima.toFixed(2)}
                      <span className="ml-1.5 text-[9px] text-tv-text-dim">
                        Δ{f.call.delta.toFixed(2)}
                      </span>
                    </button>
                    <span
                      className={cn(
                        "px-2 py-1.5 text-center font-mono tabular-nums",
                        Math.abs(f.strike - precio) < (cadena[1]?.strike ?? 1) - (cadena[0]?.strike ?? 0)
                          ? "bg-tv-panel-hover font-semibold text-tv-text"
                          : "text-tv-text-muted",
                      )}
                    >
                      {f.strike}
                    </span>
                    <button
                      onClick={() =>
                        operarOpcion("put", f.strike, f.put.prima, "compra")
                      }
                      title={`Comprar ${contratos} put ${f.strike} · ${(f.put.prima * contratos * MULTIPLICADOR).toFixed(0)} USD · delta ${f.put.delta.toFixed(2)}`}
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums hover:bg-tv-red/15",
                        dentroPut ? "text-tv-text" : "text-tv-text-muted",
                      )}
                    >
                      <span className="mr-1.5 text-[9px] text-tv-text-dim">
                        Δ{f.put.delta.toFixed(2)}
                      </span>
                      {f.put.prima.toFixed(2)}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-[10px] leading-relaxed text-tv-text-dim">
            Precios <strong className="text-tv-yellow">modelados</strong> con
            Black-Scholes sobre el precio real del día y una volatilidad del{" "}
            {(vol * 100).toFixed(0)} % sacada de la propia serie. No son
            cotizaciones: no incluyen el diferencial de compra-venta ni el
            salto de volatilidad antes de un reporte.
          </p>
        </>
      )}
    </div>
  );
}
