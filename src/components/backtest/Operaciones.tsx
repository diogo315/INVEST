"use client";

import { X } from "lucide-react";
import {
  costoApertura,
  resultadoA,
  resultadoFinal,
  type Operacion,
  type Resumen,
} from "@/lib/backtest/tipos";
import { fechaHoraEn } from "@/lib/chart/timezone";
import { cn } from "@/lib/utils";

interface Props {
  operaciones: Operacion[];
  resumen: Resumen;
  capitalInicial: number;
  /** Precio actual del instrumento de cada operación abierta. */
  precioDe: (op: Operacion) => number;
  /** Zona horaria para los momentos de entrada (no para los vencimientos). */
  zona: string;
  /** Si los números que se muestran ya descuentan los costos. */
  conComisiones: boolean;
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
  // El vencimiento es una FECHA de calendario, no un instante: el tercer
  // viernes es el tercer viernes en cualquier zona. Leerlo en UTC−4 lo
  // correría al jueves. Por eso este se queda en UTC a propósito.
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
  zona,
  conComisiones,
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
    <div className="flex shrink-0 flex-col">
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

      {/* Los costos SIEMPRE a la vista, estén descontados o no. Mirar un
          resultado bruto sin saber cuánto se habría ido en comisiones es
          justamente lo que hace creer que una estrategia de muchas
          operaciones funciona. */}
      {(r.comisiones > 0.005 || Math.abs(r.financiamiento) > 0.005) && (
        <div className="flex items-center gap-3 border-b border-tv-border px-3 py-1.5 text-[10px]">
          <span className="uppercase tracking-wider text-tv-text-dim">
            {conComisiones ? "Ya descontado" : "Sin descontar"}
          </span>
          <span className="tabular-nums text-tv-yellow">
            comisión −${r.comisiones.toFixed(2)}
          </span>
          {Math.abs(r.financiamiento) > 0.005 && (
            <span className="tabular-nums text-tv-yellow">
              financiamiento {r.financiamiento >= 0 ? "−" : "+"}$
              {Math.abs(r.financiamiento).toFixed(2)}
            </span>
          )}
          {!conComisiones && (
            <span className="ml-auto text-tv-text-dim">
              estás viendo el bruto
            </span>
          )}
        </div>
      )}

      {/* `max-h` y no `flex-1`: dentro de un panel que ya hace scroll,
          pelear por el alto disponible deja la tabla en cero píxeles
          cuando lo de arriba crece. Con un tope, crece lo que necesita
          y el panel entero se desplaza. */}
      <div className="max-h-[60vh] shrink-0 overflow-y-auto">
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
                        {fechaHoraEn(op.tiempoEntrada, zona).slice(0, 10)}
                        {op.motivo === "vencimiento" && " · venció"}
                        {op.motivo === "stop" && " · stop"}
                        {op.motivo === "objetivo" && " · objetivo"}
                        {op.motivo === "liquidacion" && (
                          <span className="font-semibold text-tv-red">
                            {" "}
                            · LIQUIDADA
                          </span>
                        )}
                        {(op.apalancamiento ?? 1) > 1 && (
                          <span className="ml-1 text-tv-text-dim">
                            {op.apalancamiento}×
                          </span>
                        )}
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
