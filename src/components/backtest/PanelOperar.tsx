"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { CampoNumero } from "./CampoNumero";
import {
  MULTIPLICADOR,
  PASOS_STRIKE,
  cadenaEn,
  pasoDeStrike,
  vencimientosDesde,
} from "@/lib/backtest/cadena";
import {
  cantidadEfectiva,
  dolaresPorUnidades,
  nivelesPorPct,
  pasoDeCantidad,
  redondearCantidad,
  unidadesPorDolares,
  premioPorUnidad,
  problemaDeNiveles,
  redondearNivel,
  relacionRB,
  riesgoPorUnidad,
} from "@/lib/backtest/niveles";
import type { Operacion } from "@/lib/backtest/tipos";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/** El plan que se está dibujando en el gráfico, antes de ejecutarlo. */
export interface Plan {
  lado: "compra" | "venta";
  entrada: number;
  cantidad: number;
  stopLoss?: number;
  takeProfit?: number;
}

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
  /** Símbolo sin el prefijo del mercado: «BTCUSDT», «AAPL». */
  simbolo: string;
  onOperar: (op: Omit<Operacion, "id">) => void;
  /** El plan, controlado desde arriba porque el gráfico también lo mueve. */
  niveles: EstadoNiveles;
  onNiveles: (parche: Partial<EstadoNiveles>) => void;
}

/** Lo que el usuario está planificando antes de apretar el botón. */
export interface EstadoNiveles {
  usarNiveles: boolean;
  ladoPlan: "compra" | "venta";
  stopLoss: number | null;
  takeProfit: number | null;
  /** null = «la que entre con el efectivo libre». */
  cantidadManual: number | null;
  /**
   * Se escribe el tamaño en dólares en vez de en unidades del activo.
   *
   * Para cripto es la forma natural de pensarlo: uno decide «meto 500
   * dólares», no «compro 0,00563 bitcoin». La cantidad real sale de
   * dividir por el precio, así que lo que se guarda sigue siendo una
   * cantidad y la contabilidad no cambia en nada.
   */
  enDolares: boolean;
}

export const NIVELES_INICIAL: EstadoNiveles = {
  usarNiveles: false,
  ladoPlan: "compra",
  stopLoss: null,
  takeProfit: null,
  cantidadManual: null,
  enDolares: false,
};

type Modo = "activo" | "opciones";

/** Decidir y ejecutar: comprar o vender el activo, o abrir un call o put. */
export function PanelOperar({
  precio,
  tiempo,
  vol,
  efectivo,
  permiteOpciones,
  simbolo,
  onOperar,
  niveles,
  onNiveles,
}: Props) {
  const [modo, setModo] = useState<Modo>("activo");
  /**
   * La cantidad vive en `niveles`, arriba: ver el comentario de ahí.
   */
  const [contratos, setContratos] = useState(1);
  const [idxVenc, setIdxVenc] = useState(0);
  /** null = el salto que propone la tabla para este precio. */
  const [pasoManual, setPasoManual] = useState<number | null>(null);
  const [cuantos, setCuantos] = useState(20);
  const listaRef = useRef<HTMLDivElement>(null);

  const vencimientos = useMemo(
    () => vencimientosDesde(tiempo, 6),
    [tiempo],
  );
  const vencimiento = vencimientos[Math.min(idxVenc, vencimientos.length - 1)];
  const pasoAuto = precio > 0 ? pasoDeStrike(precio) : 1;
  const paso = pasoManual ?? pasoAuto;
  const cadena = useMemo(
    () =>
      precio > 0
        ? cadenaEn(precio, tiempo, vencimiento, vol, cuantos, 0.04, paso)
        : [],
    [precio, tiempo, vencimiento, vol, cuantos, paso],
  );

  const maximo = cantidadEfectiva(null, efectivo, precio);
  /** Nombre corto de una unidad: «BTC», «AAPL»… para no decir «cantidad». */
  const unidad = (simbolo || "ud.").replace(/USDT?$/, "") || "ud.";
  const cantidad = cantidadEfectiva(niveles.cantidadManual, efectivo, precio);
  const costoActivo = cantidad * precio;
  const alcanza = costoActivo <= efectivo + 0.01;

  /**
   * Los niveles del plan viven ARRIBA, en la vista, no acá.
   *
   * Es a propósito y vale la pena entender por qué: el gráfico también
   * los modifica (arrastrando las líneas). Con el estado acá abajo, el
   * arrastre tenía que volver por una prop y copiarse a un estado local
   * dentro de un efecto, y eso es un espejo: dos copias del mismo dato
   * que pueden quedar distintas. Con una sola fuente, lo que se arrastra
   * y lo que ejecuta el botón de comprar son literalmente el mismo
   * número, que es lo único que hace creíble a un simulador.
   *
   * Están en PRECIO y no en porcentaje: en porcentaje habría que
   * recalcularlos en cada vela y el nivel elegido se movería solo.
   */
  const { usarNiveles, stopLoss, takeProfit, ladoPlan } = niveles;
  const nivelesActivos = usarNiveles
    ? {
        ...(stopLoss !== null ? { stopLoss } : {}),
        ...(takeProfit !== null ? { takeProfit } : {}),
      }
    : {};
  const problema = usarNiveles
    ? problemaDeNiveles(ladoPlan, precio, nivelesActivos)
    : null;
  const rb = relacionRB(precio, nivelesActivos);
  const riesgo = stopLoss !== null ? riesgoPorUnidad(precio, stopLoss) * cantidad : null;
  const premio = takeProfit !== null ? premioPorUnidad(precio, takeProfit) * cantidad : null;
  const puedeOperar = alcanza && !problema;

  /**
   * Al encender los niveles, o al cambiar de lado, se proponen unos de
   * arranque. Pasa en el MANEJADOR del clic y no en un efecto: es la
   * consecuencia de una acción del usuario, no una sincronización. Si
   * estuviera en un efecto que mirase el precio, cada vela nueva le
   * borraría al usuario el stop que acababa de arrastrar.
   *
   * No es una recomendación: es un punto de partida arrastrable. Un 2 %
   * en diario y un 2 % en 5 minutos son cosas muy distintas.
   */
  const proponer = (on: boolean, lado: "compra" | "venta") => {
    if (!on || precio <= 0) {
      onNiveles({ usarNiveles: on, ladoPlan: lado });
      return;
    }
    const n = nivelesPorPct(lado, precio, 2, 4);
    onNiveles({
      usarNiveles: true,
      ladoPlan: lado,
      stopLoss: redondearNivel(n.stopLoss),
      takeProfit: redondearNivel(n.takeProfit),
    });
  };

  /**
   * La cadena se abre centrada en el dinero.
   *
   * Con 41 filas, dejarla arriba del todo obliga a buscar a mano dónde
   * está el precio cada vez que avanza el backtest.
   */
  useEffect(() => {
    const caja = listaRef.current;
    if (!caja || cadena.length === 0) return;
    const i = cadena.findIndex((f) => f.strike >= precio);
    if (i < 0) return;
    const altoFila = caja.scrollHeight / cadena.length;
    caja.scrollTop = Math.max(0, i * altoFila - caja.clientHeight / 2);
  }, [cadena, precio]);

  const operarActivo = (lado: "compra" | "venta") =>
    onOperar({
      instrumento: "activo",
      lado,
      cantidad,
      precioEntrada: precio,
      tiempoEntrada: tiempo,
      // Los niveles solo viajan si están encendidos Y son del lado que se
      // está ejecutando: si el plan era una compra y se aprieta vender,
      // el stop quedaría debajo de la entrada en una venta, o sea saltaría
      // de inmediato. En ese caso se opera sin niveles y se avisa.
      ...(usarNiveles && lado === ladoPlan && !problema ? nivelesActivos : {}),
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
                {niveles.enDolares ? "Monto en dólares" : "Cantidad"}
              </span>
              <CampoNumero
                aria-label={niveles.enDolares ? "Monto en dólares" : "Cantidad"}
                valor={
                  niveles.enDolares
                    ? Number(costoActivo.toFixed(2))
                    : Number(cantidad.toFixed(8))
                }
                min={0}
                paso={niveles.enDolares ? 1 : pasoDeCantidad(precio)}
                onCambiar={(v) =>
                  onNiveles({
                    cantidadManual:
                      v === null
                        ? null
                        : niveles.enDolares
                          ? unidadesPorDolares(v, precio)
                          : redondearCantidad(v, precio),
                  })
                }
                className="w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs tabular-nums text-tv-text"
              />
            </label>
            <div className="flex-1 pb-1.5 text-[11px] text-tv-text-muted">
              {/* Siempre se enseñan las DOS caras: cuánta plata y cuánto
                  activo. Es lo que evita abrir 1 bitcoin creyendo que se
                  abría uno de mil dólares. */}
              <div className="tabular-nums">
                {niveles.enDolares
                  ? `${Number(cantidad.toFixed(8))} ${unidad}`
                  : formatPrice(costoActivo)}
              </div>
              <div className="text-[10px] text-tv-text-dim">
                {Number(cantidad.toFixed(8))} × {formatPrice(precio)}
              </div>
            </div>
            <div className="mb-1.5 flex shrink-0 flex-col gap-1">
              <div className="flex gap-0.5 rounded bg-tv-bg p-0.5">
                <button
                  type="button"
                  onClick={() => onNiveles({ enDolares: false })}
                  title="Escribir el tamaño en unidades del activo"
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] transition-colors",
                    !niveles.enDolares
                      ? "bg-tv-panel-hover text-tv-text"
                      : "text-tv-text-muted hover:text-tv-text",
                  )}
                >
                  {unidad}
                </button>
                <button
                  type="button"
                  onClick={() => onNiveles({ enDolares: true })}
                  title="Escribir el tamaño en dólares; se convierte al activo solo"
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] transition-colors",
                    niveles.enDolares
                      ? "bg-tv-panel-hover text-tv-text"
                      : "text-tv-text-muted hover:text-tv-text",
                  )}
                >
                  USD
                </button>
              </div>
              <button
                type="button"
                onClick={() => onNiveles({ cantidadManual: null })}
                title={`Lo máximo que entra con el efectivo libre: ${maximo}`}
                className="rounded border border-tv-border px-2 py-0.5 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
              >
                Máx
              </button>
            </div>
          </div>

          {/* ── stop y objetivo ──────────────────────────────────── */}
          <div className="rounded border border-tv-border bg-tv-bg/50">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-tv-text">
                <input
                  type="checkbox"
                  checked={usarNiveles}
                  onChange={(e) => proponer(e.target.checked, ladoPlan)}
                  className="h-3 w-3 accent-tv-blue"
                />
                Stop y objetivo
              </label>
              {usarNiveles && (
                <div className="ml-auto flex gap-0.5 rounded bg-tv-bg p-0.5">
                  {(["compra", "venta"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => proponer(true, l)}
                      title={`Plan para ${l === "compra" ? "una compra (largo)" : "una venta (corto)"}`}
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] transition-colors",
                        ladoPlan === l
                          ? l === "compra"
                            ? "bg-tv-green/80 text-white"
                            : "bg-tv-red/80 text-white"
                          : "text-tv-text-muted hover:text-tv-text",
                      )}
                    >
                      {l === "compra" ? "Largo" : "Corto"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {usarNiveles && (
              <div className="flex flex-col gap-2 border-t border-tv-border px-2 py-2">
                <div className="flex items-end gap-2">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-tv-red">
                      Stop loss
                    </span>
                    <CampoNumero
                      valor={stopLoss}
                      aria-label="Stop loss"
                      onCambiar={(v) => onNiveles({ stopLoss: v })}
                      className="w-full rounded border border-tv-red/40 bg-tv-bg px-2 py-1 text-xs tabular-nums text-tv-text"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-tv-green">
                      Take profit
                    </span>
                    <CampoNumero
                      valor={takeProfit}
                      aria-label="Take profit"
                      onCambiar={(v) => onNiveles({ takeProfit: v })}
                      className="w-full rounded border border-tv-green/40 bg-tv-bg px-2 py-1 text-xs tabular-nums text-tv-text"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <div className="uppercase tracking-wider text-tv-text-dim">Riesgo</div>
                    <div className="tabular-nums text-tv-red">
                      {riesgo === null ? "—" : `−$${riesgo.toFixed(0)}`}
                    </div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wider text-tv-text-dim">Premio</div>
                    <div className="tabular-nums text-tv-green">
                      {premio === null ? "—" : `+$${premio.toFixed(0)}`}
                    </div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wider text-tv-text-dim">
                      Beneficio/riesgo
                    </div>
                    <div
                      className={cn(
                        "tabular-nums",
                        rb === null
                          ? "text-tv-text-dim"
                          : rb >= 2
                            ? "text-tv-green"
                            : rb >= 1
                              ? "text-tv-text"
                              : "text-tv-yellow",
                      )}
                    >
                      {rb === null ? "—" : `${rb.toFixed(2)} : 1`}
                    </div>
                  </div>
                </div>

                {problema ? (
                  /* El plan se invalida solo cuando el reloj avanza y el
                     precio cruza un nivel: lo que era un objetivo arriba
                     queda abajo. No se recalcula solo a propósito —eso
                     borraría lo que el usuario acaba de arrastrar—, pero
                     tampoco se lo deja trabado: un botón y listo. */
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-[10px] leading-relaxed text-tv-red">
                      {problema}
                    </p>
                    <button
                      type="button"
                      onClick={() => proponer(true, ladoPlan)}
                      title="Vuelve a proponer stop y objetivo desde el precio actual"
                      className="shrink-0 rounded border border-tv-border px-2 py-1 text-[10px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
                    >
                      Recalcular
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] leading-relaxed text-tv-text-dim">
                    Arrastrá las líneas en el gráfico para moverlas. Si una
                    vela toca los dos niveles, se resuelve por el{" "}
                    <strong className="text-tv-red">stop</strong>: el OHLC no
                    guarda cuál se tocó primero, y suponer lo contrario infla
                    el resultado.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => operarActivo("compra")}
              disabled={!puedeOperar}
              className="flex flex-1 items-center justify-center gap-1.5 rounded bg-tv-green/90 py-2 text-xs font-medium text-white hover:bg-tv-green disabled:cursor-not-allowed disabled:opacity-30"
            >
              <TrendingUp className="h-3.5 w-3.5" /> Comprar
            </button>
            <button
              onClick={() => operarActivo("venta")}
              disabled={!puedeOperar}
              className="flex flex-1 items-center justify-center gap-1.5 rounded bg-tv-red/90 py-2 text-xs font-medium text-white hover:bg-tv-red disabled:cursor-not-allowed disabled:opacity-30"
            >
              <TrendingDown className="h-3.5 w-3.5" /> Vender
            </button>
          </div>
          {!alcanza && (
            <p className="text-[10px] text-tv-red">
              No te alcanza el efectivo libre para esa cantidad. Con $
              {efectivo.toFixed(0)} entran {Number(maximo.toFixed(8))} {unidad} (
              {formatPrice(dolaresPorUnidades(maximo, precio))}).
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
                {/* En UTC a propósito: un vencimiento es una FECHA de
                    calendario, no un instante. El tercer viernes es el
                    tercer viernes se mire desde donde se mire; leerlo en
                    UTC−4 lo mostraría como el jueves. */}
                {vencimientos.map((v, i) => (
                  <option key={v} value={i}>
                    {new Date(v * 1000).toISOString().slice(0, 10)} ·{" "}
                    {Math.round((v - tiempo) / 86400)} d
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2 text-[10px]">
            <span className="uppercase tracking-wider text-tv-text-muted">
              Salto
            </span>
            <div className="flex gap-0.5 rounded bg-tv-bg p-0.5">
              <button
                type="button"
                onClick={() => setPasoManual(null)}
                title={`El que propone la app para este precio: ${pasoAuto}`}
                className={cn(
                  "rounded px-1.5 py-0.5 transition-colors",
                  pasoManual === null
                    ? "bg-tv-blue text-white"
                    : "text-tv-text-muted hover:text-tv-text",
                )}
              >
                auto
              </button>
              {PASOS_STRIKE.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPasoManual(p)}
                  className={cn(
                    "rounded px-1.5 py-0.5 tabular-nums transition-colors",
                    pasoManual === p
                      ? "bg-tv-blue text-white"
                      : "text-tv-text-muted hover:text-tv-text",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <span className="ml-auto uppercase tracking-wider text-tv-text-muted">
              Filas
            </span>
            <select
              value={cuantos}
              onChange={(e) => setCuantos(Number(e.target.value))}
              aria-label="Cuántos strikes a cada lado"
              className="rounded border border-tv-border bg-tv-bg px-1 py-0.5 text-[10px] text-tv-text"
            >
              {[10, 20, 40].map((n) => (
                <option key={n} value={n}>
                  ±{n}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-hidden rounded border border-tv-border">
            <div className="grid grid-cols-[1fr_auto_1fr] bg-tv-bg px-2 py-1 text-[9px] uppercase tracking-wider text-tv-text-dim">
              <span>Call</span>
              <span className="px-2 text-center">Strike</span>
              <span className="text-right">Put</span>
            </div>
            <div ref={listaRef} className="max-h-72 overflow-y-auto">
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
                        Math.abs(f.strike - precio) < paso
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
            Los strikes reales cambian según el papel y el vencimiento, y no
            se pueden consultar para una fecha pasada: el salto es una
            propuesta y se cambia arriba. Precios{" "}
            <strong className="text-tv-yellow">modelados</strong> con
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
