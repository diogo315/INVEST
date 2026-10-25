"use client";

import { useCallback, useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { relacionRB } from "@/lib/backtest/niveles";
import type { LadoOperacion } from "@/lib/backtest/tipos";
import { formatPrice } from "@/lib/format";

/** Cuál de los tres niveles de una operación. */
export type Cual = "entrada" | "stop" | "objetivo";

export interface NivelDibujado {
  /** Identifica la operación (o "plan" para la que todavía no existe). */
  opId: string;
  cual: Cual;
  precio: number;
  lado: LadoOperacion;
  /** Unidades, para poder decir cuántos dólares hay en juego. */
  cantidad: number;
  entrada: number;
  /** Se puede arrastrar: la entrada de una operación ya abierta, no. */
  arrastrable: boolean;
  /** Texto corto a la izquierda de la línea. */
  etiqueta: string;
}

interface Props {
  chart: IChartApi | null;
  serie: ISeriesApi<"Candlestick"> | null;
  niveles: NivelDibujado[];
  /** Mientras se arrastra no se avisa; se avisa al soltar. */
  onMover: (opId: string, cual: Cual, precio: number) => void;
}

const COLOR: Record<Cual, string> = {
  entrada: "#2962ff",
  stop: "#ef5350",
  objetivo: "#26a69a",
};

/**
 * Las líneas de stop, objetivo y entrada, arrastrables con el ratón.
 *
 * Por qué HTML encima del lienzo y no las `priceLine` de la librería: las
 * de la librería se dibujan perfecto pero no se pueden agarrar. Acá hace
 * falta moverlas, que es justamente lo que pidió Diego, así que son nodos
 * de verdad con su propio `pointerdown`.
 *
 * Por qué un bucle de animación y no una suscripción: la posición de una
 * línea depende del eje de PRECIOS, y ese eje se mueve solo (autoescala)
 * cuando entra una vela nueva, cuando se cambia de temporalidad o cuando
 * el usuario arrastra el eje. No hay un único evento que cubra todo eso;
 * sí hay un `requestAnimationFrame`, que cuesta tres llamadas por cuadro
 * y nunca se queda desfasado. Se compara contra la posición anterior y
 * solo se escribe en el DOM cuando cambió, así que no hay repintado.
 */
export function CapaNiveles({ chart, serie, niveles, onMover }: Props) {
  const capaRef = useRef<HTMLDivElement>(null);
  /** Lo último que se pintó, para no escribir el DOM sin necesidad. */
  const ultimaY = useRef<Map<string, number>>(new Map());
  /**
   * El arrastre en curso. Va en una ref y no en estado: redibujar React
   * sesenta veces por segundo mientras se mueve el ratón haría saltar la
   * línea, y además el gráfico entero se recalcularía.
   */
  const arrastre = useRef<{ clave: string; precio: number } | null>(null);
  const nivelesRef = useRef<NivelDibujado[]>(niveles);
  const onMoverRef = useRef(onMover);

  useEffect(() => {
    nivelesRef.current = niveles;
  }, [niveles]);
  useEffect(() => {
    onMoverRef.current = onMover;
  }, [onMover]);

  const clave = (n: NivelDibujado) => `${n.opId}:${n.cual}`;

  /** Coloca cada nodo donde le toca según el eje de precios. */
  const colocar = useCallback(() => {
    const capa = capaRef.current;
    if (!capa || !serie) return;
    const alto = capa.clientHeight;
    for (const nodo of Array.from(capa.children) as HTMLElement[]) {
      const k = nodo.dataset.clave ?? "";
      const n = nivelesRef.current.find((x) => clave(x) === k);
      if (!n) continue;
      const activo = arrastre.current?.clave === k;
      const precio = activo ? arrastre.current!.precio : n.precio;
      const y = serie.priceToCoordinate(precio);
      if (y === null || y === undefined) {
        nodo.style.display = "none";
        continue;
      }
      const yy = Number(y);
      // Fuera del área visible no se dibuja: si no, el nodo se escapa del
      // alto y empuja el resto de la página.
      if (yy < -2 || yy > alto + 2) {
        nodo.style.display = "none";
        ultimaY.current.delete(k);
        continue;
      }
      if (ultimaY.current.get(k) === yy && nodo.style.display !== "none") continue;
      ultimaY.current.set(k, yy);
      nodo.style.display = "";
      nodo.style.top = `${yy}px`;
      // El texto del precio se reescribe solo mientras se arrastra: fuera
      // del arrastre lo pone React y no hace falta tocarlo.
      if (activo) {
        const txt = nodo.querySelector("[data-precio]") as HTMLElement | null;
        if (txt) txt.textContent = formatPrice(precio);
        const dif = nodo.querySelector("[data-dif]") as HTMLElement | null;
        if (dif && n.entrada > 0) {
          const pct = ((precio - n.entrada) / n.entrada) * 100;
          const monto = (precio - n.entrada) * n.cantidad * (n.lado === "compra" ? 1 : -1);
          dif.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)} % · ${monto >= 0 ? "+" : "−"}$${Math.abs(monto).toFixed(0)}`;
        }
      }
    }
  }, [serie]);

  // El bucle. Se apaga al desmontar; si no, seguiría llamando a un
  // gráfico ya destruido y lanzaría en cada cuadro.
  useEffect(() => {
    if (!chart || !serie) return;
    let vivo = true;
    const cache = ultimaY.current;
    const tick = () => {
      if (!vivo) return;
      colocar();
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      vivo = false;
      cancelAnimationFrame(id);
      cache.clear();
    };
  }, [chart, serie, colocar]);

  /** Agarrar una línea y moverla. */
  const alAgarrar = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, n: NivelDibujado) => {
      if (!n.arrastrable || !serie) return;
      e.preventDefault();
      e.stopPropagation();
      const capa = capaRef.current;
      if (!capa) return;
      const k = clave(n);
      const rect = capa.getBoundingClientRect();
      const mover = (ev: PointerEvent) => {
        const y = ev.clientY - rect.top;
        const p = serie.coordinateToPrice(y);
        if (p === null || p === undefined) return;
        const precio = Number(p);
        if (!Number.isFinite(precio) || precio <= 0) return;
        arrastre.current = { clave: k, precio };
      };
      const soltar = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", soltar);
        const fin = arrastre.current;
        arrastre.current = null;
        // Solo se avisa al soltar: mientras se arrastra el nodo se mueve
        // solo, sin pasar por React ni por el almacén. Así el arrastre va
        // suave y no se guardan cincuenta posiciones intermedias.
        if (fin && fin.clave === k) onMoverRef.current(n.opId, n.cual, fin.precio);
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", soltar);
    },
    [serie],
  );

  if (!chart || !serie) return null;

  return (
    <div
      ref={capaRef}
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      {niveles.map((n) => {
        const k = clave(n);
        const color = COLOR[n.cual];
        const pct = n.entrada > 0 ? ((n.precio - n.entrada) / n.entrada) * 100 : 0;
        const monto =
          (n.precio - n.entrada) * n.cantidad * (n.lado === "compra" ? 1 : -1);
        return (
          <div
            key={k}
            data-clave={k}
            style={{ display: "none", top: 0 }}
            className="absolute left-0 right-0 -translate-y-1/2"
          >
            <div
              className="h-0 border-t border-dashed"
              style={{ borderColor: color }}
            />
            <div
              onPointerDown={(e) => alAgarrar(e, n)}
              className={[
                "absolute left-1 top-0 -translate-y-1/2 flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] ring-1",
                n.arrastrable
                  ? "pointer-events-auto cursor-ns-resize hover:brightness-125"
                  : "",
              ].join(" ")}
              style={{
                background: "rgba(19,23,34,0.92)",
                color,
                borderColor: color,
                boxShadow: `inset 0 0 0 1px ${color}80`,
              }}
              title={
                n.arrastrable
                  ? "Arrastrá para mover este nivel"
                  : "El precio de entrada no se mueve"
              }
            >
              <span className="font-sans uppercase tracking-wider opacity-80">
                {n.etiqueta}
              </span>
              <span data-precio>{formatPrice(n.precio)}</span>
              {n.cual !== "entrada" && (
                <span data-dif className="opacity-80">
                  {pct >= 0 ? "+" : ""}
                  {pct.toFixed(2)} % · {monto >= 0 ? "+" : "−"}$
                  {Math.abs(monto).toFixed(0)}
                </span>
              )}
              {n.arrastrable && (
                <span aria-hidden className="opacity-50">
                  ⇅
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Texto de la relación beneficio/riesgo, o null si no se puede calcular. */
export function textoRB(
  entrada: number,
  stopLoss?: number,
  takeProfit?: number,
): string | null {
  const r = relacionRB(entrada, { stopLoss, takeProfit });
  return r === null ? null : `${r.toFixed(2)}`;
}
