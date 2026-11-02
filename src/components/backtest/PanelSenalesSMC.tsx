"use client";

import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { calcularSMC, type ConfigSMC, type SenalBOS } from "@/lib/smc/motor";
import {
  operacionDeSenal,
  senalesNuevas,
  type ConfigTamano,
  type OperacionDeSenal,
} from "@/lib/smc/operar";
import { pasoDeCantidad } from "@/lib/backtest/niveles";
import { nocionalMaximo, type ConfigFuturos } from "@/lib/backtest/futuros";
import type { Candle } from "@/lib/binance/types";
import type { Operacion } from "@/lib/backtest/tipos";
import { formatPrice } from "@/lib/format";

interface Props {
  /** Velas hasta el reloj: lo que el backtest "vivió" hasta ahora. */
  visibles: Candle[];
  cfg: ConfigSMC;
  capitalInicial: number;
  efectivo: number;
  operaciones: Operacion[];
  esFuturos: boolean;
  futuros: ConfigFuturos;
  conComisiones: boolean;
  onOperar: (op: Omit<Operacion, "id">) => void;
}

/**
 * Las señales del SMC dentro del backtest.
 *
 * Dos formas de usarlas: de a una desde el gráfico (el botón «Operar»
 * sobre la señal) o todas juntas desde acá. La de a una sirve para
 * practicar; la de todas juntas, para saber si la estrategia sirve. Son
 * preguntas distintas y por eso están las dos.
 *
 * Corre sobre las velas HASTA EL RELOJ, no sobre todo el período
 * cargado. Si abriera operaciones más allá del reproductor, la tabla
 * mostraría resultados de un futuro que el backtest todavía no vivió.
 * Para medir el período entero, se adelanta el reloj hasta el final y
 * se aprieta el botón ahí.
 */
export function PanelSenalesSMC({
  visibles,
  cfg,
  capitalInicial,
  efectivo,
  operaciones,
  esFuturos,
  futuros,
  conComisiones,
  onOperar,
}: Props) {
  const [riesgo, setRiesgo] = useState(1);
  const [ultimo, setUltimo] = useState<string | null>(null);

  const r = useMemo(() => calcularSMC(visibles, cfg), [visibles, cfg]);
  const pendientes = useMemo(
    () => senalesNuevas(r.senales, operaciones),
    [r.senales, operaciones],
  );

  const precio = visibles.at(-1)?.close ?? 0;
  const tamano: ConfigTamano = {
    riesgoPorcentaje: riesgo,
    // El tope es lo que el efectivo aguanta hoy, con su apalancamiento y
    // su comisión. Sin esto, «correr todas» abriría operaciones que el
    // capital no puede sostener y el resultado sería de otra cuenta.
    nocionalMaximo: esFuturos
      ? nocionalMaximo(Math.max(0, efectivo), {
          ...futuros,
          comision: conComisiones ? futuros.comision : 0,
        })
      : Math.max(0, efectivo),
    pasoCantidad: pasoDeCantidad(precio || 1),
  };

  const aOperacion = (s: SenalBOS): OperacionDeSenal | null =>
    operacionDeSenal(s, capitalInicial, tamano);

  const mandar = (o: OperacionDeSenal) => {
    onOperar({
      instrumento: "activo",
      lado: o.lado,
      cantidad: o.cantidad,
      precioEntrada: o.precioEntrada,
      tiempoEntrada: o.tiempoEntrada,
      stopLoss: o.stopLoss,
      takeProfit: o.takeProfit,
      ...(esFuturos ? { apalancamiento: futuros.apalancamiento } : {}),
      ...(o.precioSalida !== undefined
        ? {
            precioSalida: o.precioSalida,
            tiempoSalida: o.tiempoSalida,
            motivo: o.motivo,
          }
        : {}),
    });
  };

  const correrTodas = () => {
    let puestas = 0;
    let saltadas = 0;
    for (const s of pendientes) {
      const o = aOperacion(s);
      if (o) {
        mandar(o);
        puestas++;
      } else {
        saltadas++;
      }
    }
    setUltimo(
      puestas === 0
        ? "No se pudo dimensionar ninguna: subí el riesgo o liberá efectivo."
        : `${puestas} ${puestas === 1 ? "operación puesta" : "operaciones puestas"}` +
            (saltadas > 0 ? `, ${saltadas} sin tamaño posible.` : "."),
    );
  };

  const cerradas = pendientes.filter((s) => s.salida !== null).length;
  const abiertas = pendientes.length - cerradas;
  const proxima = pendientes.at(-1);

  return (
    <div className="flex flex-col gap-2 border-b border-tv-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
          Señales SMC
        </span>
        <span className="font-mono text-[11px] tabular-nums text-tv-text">
          {pendientes.length}
        </span>
      </div>

      {pendientes.length === 0 ? (
        <p className="text-[10px] leading-relaxed text-tv-text-dim">
          No hay señales nuevas en lo que lleva corrido el backtest. Adelantá el
          reproductor para que aparezcan.
        </p>
      ) : (
        <>
          <p className="text-[10px] leading-relaxed text-tv-text-muted">
            {cerradas} ya {cerradas === 1 ? "terminó" : "terminaron"} dentro del
            período y {abiertas} {abiertas === 1 ? "sigue" : "siguen"} sin
            resolver.
          </p>
          {proxima && (
            <p className="font-mono text-[10px] tabular-nums text-tv-text-dim">
              Última: {proxima.sesgo === 1 ? "compra" : "venta"} en{" "}
              {formatPrice(proxima.entrada)} · stop {formatPrice(proxima.stop)} ·
              objetivo {formatPrice(proxima.objetivo)} · B/R{" "}
              {proxima.relacion.toFixed(2)}
            </p>
          )}
        </>
      )}

      <label className="flex items-center justify-between gap-2 text-xs">
        <span
          className="text-tv-text-muted"
          title="Cada operación arriesga este porcentaje del capital inicial entre la entrada y el stop. Con el stop más lejos, la cantidad baja."
        >
          Riesgo por operación
        </span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            aria-label="Riesgo por operación"
            value={riesgo}
            min={0.1}
            max={100}
            step={0.1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setRiesgo(Math.min(100, Math.max(0.1, n)));
            }}
            className="w-16 rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 text-right font-mono text-[11px] text-tv-text"
          />
          <span className="text-[10px] text-tv-text-dim">%</span>
        </span>
      </label>
      <p className="text-[10px] leading-relaxed text-tv-text-dim">
        Son ${((capitalInicial * riesgo) / 100).toFixed(2)} por operación, sea
        cual sea la distancia al stop. El indicador original no dice cuánto
        comprar: el tamaño es un agregado.
      </p>

      <button
        type="button"
        onClick={correrTodas}
        disabled={pendientes.length === 0}
        className="flex items-center justify-center gap-1.5 rounded bg-tv-blue px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-tv-blue/85 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Play className="h-3.5 w-3.5" />
        Correr las {pendientes.length}{" "}
        {pendientes.length === 1 ? "señal" : "señales"}
      </button>
      {ultimo && (
        <p className="text-[10px] leading-relaxed text-tv-green">{ultimo}</p>
      )}
      <p className="text-[10px] leading-relaxed text-tv-text-dim">
        Van a la tabla de abajo como operaciones normales, así los aciertos, el
        resultado y la caída máxima salen del mismo cálculo que el resto.
      </p>
    </div>
  );
}
