"use client";

import { X } from "lucide-react";
import {
  costoApertura,
  resultadoA,
  resultadoFinal,
  type Operacion,
  type Resumen,
} from "@/lib/backtest/tipos";
import { cn } from "@/lib/utils";

interface Props {
  operaciones: Operacion[];
  resumen: Resumen;
  capitalInicial: number;
  /** Precio actual del instrumento de cada operación abierta. */
  precioDe: (op: Operacion) => number;
  onCerrar: (op: Operacion) => void;
}

function Dato({
  nombre,
  valor,
  tono,
  pie,
}: {
  nombre: string;
  valor: string;
  tono?: "verde" | "rojo";
  pie?: string;
}) {
  return (
    <div className="min-w-0 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-tv-text-dim">
        {nombre}
      </div>
      <div
        className={cn(
          "truncate font-mono text-sm tabular-nums",
          tono === "verde"
            ? "text-tv-green"
            : tono === "rojo"
              ? "text-tv-red"
              : "text-tv-text",
        )}
      >
        {valor}
      </div>
      {pie && <div className="truncate text-[10px] text-tv-text-dim">{pie}</div>}
    </div>
  );
}

function nombreDe(op: Operacion): string {
  if (op.instrumento === "activo") {
    return op.lado === "compra" ? "Compra" : "Venta en corto";
  }
  const t = op.instrumento === "call" ? "Call" : "Put";
  const v = op.vencimiento
    ? new Date(op.vencimiento * 1000).toISOString().slice(5, 10)
    : "";
  return `${op.lado === "venta" ? "Vendido " : ""}${t} ${op.strike} ${v}`;
}

export function Operaciones({
  operaciones,
  resumen,
  capitalInicial,
  precioDe,
  onCerrar,
}: Props) {
  const r = resumen;
  const tono = r.resultado > 0 ? "verde" : r.resultado < 0 ? "rojo" : undefined;
  // Las abiertas primero: son las que piden una decisión.
  const ordenadas = [...operaciones].sort((a, b) => {
    const aa = a.precioSalida === undefined ? 0 : 1;
    const bb = b.precioSalida === undefined ? 0 : 1;
    return aa - bb || b.tiempoEntrada - a.tiempoEntrada;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-2 divide-x divide-tv-border border-b border-tv-border sm:grid-cols-4">
        <Dato
          nombre="Capital"
          valor={`$${r.capital.toLocaleString("es", { maximumFractionDigits: 0 })}`}
          pie={`de $${capitalInicial.toLocaleString("es")}`}
        />
        <Dato
          nombre="Resultado"
          valor={`${r.resultado >= 0 ? "+" : "−"}${Math.abs(r.pct).toFixed(2)} %`}
          tono={tono}
          pie={`${r.resultado >= 0 ? "+" : "−"}$${Math.abs(r.resultado).toFixed(0)}`}
        />
        <Dato
          nombre="Aciertos"
          valor={
            r.ganadoras + r.perdedoras === 0
              ? "—"
              : `${Math.round((r.ganadoras / (r.ganadoras + r.perdedoras)) * 100)} %`
          }
          pie={`${r.ganadoras} de ${r.ganadoras + r.perdedoras} cerradas`}
        />
        <Dato
          nombre="Caída máxima"
          valor={`${r.maxCaida.toFixed(1)} %`}
          pie={`libre $${r.efectivo.toFixed(0)}`}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {ordenadas.length === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-tv-text-dim">
            Todavía no abriste ninguna operación. Dale play y decidí cuando
            veas algo.
          </p>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-tv-bg text-[9px] uppercase tracking-wider text-tv-text-dim">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Operación</th>
                <th className="px-2 py-1.5 text-right font-medium">Cant.</th>
                <th className="px-2 py-1.5 text-right font-medium">Entrada</th>
                <th className="px-2 py-1.5 text-right font-medium">Ahora</th>
                <th className="px-2 py-1.5 text-right font-medium">Resultado</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((op) => {
                const abierta = op.precioSalida === undefined;
                const precioAhora = abierta
                  ? precioDe(op)
                  : (op.precioSalida as number);
                const res = abierta
                  ? resultadoA(op, precioAhora)
                  : (resultadoFinal(op) as number);
                const base = costoApertura(op);
                const pct = base > 0 ? (res / base) * 100 : 0;
                return (
                  <tr
                    key={op.id}
                    className={cn(
                      "border-b border-tv-border/50",
                      abierta ? "bg-tv-blue/[0.07]" : "",
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <span className="text-tv-text">{nombreDe(op)}</span>
                      <span className="ml-1.5 text-[10px] text-tv-text-dim">
                        {new Date(op.tiempoEntrada * 1000)
                          .toISOString()
                          .slice(0, 10)}
                        {op.motivo === "vencimiento" && " · venció"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-tv-text-muted">
                      {op.cantidad}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-tv-text-muted">
                      {op.precioEntrada.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-tv-text-muted">
                      {precioAhora.toFixed(2)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 text-right tabular-nums",
                        res > 0 ? "text-tv-green" : res < 0 ? "text-tv-red" : "text-tv-text-muted",
                      )}
                    >
                      {res >= 0 ? "+" : "−"}${Math.abs(res).toFixed(0)}
                      <span className="ml-1 text-[10px] opacity-70">
                        {pct >= 0 ? "+" : "−"}
                        {Math.abs(pct).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-1">
                      {abierta && (
                        <button
                          onClick={() => onCerrar(op)}
                          title="Cerrar esta operación al precio de ahora"
                          aria-label={`Cerrar ${nombreDe(op)}`}
                          className="rounded p-1 text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-text"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
