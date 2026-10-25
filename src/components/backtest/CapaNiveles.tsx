"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const claveDe = (n: { opId: string; cual: Cual }) => `${n.opId}:${n.cual}`;

/**
 * Las líneas de stop, objetivo y entrada, arrastrables con el ratón.
 *
 * Por qué HTML encima del lienzo y no las `priceLine` de la librería:
 * las de la librería se dibujan perfecto pero no se pueden agarrar, y
 * agarrarlas es el pedido.
 *
 * ────────────────────────────────────────────────────────────────────
 * REACT ES EL ÚNICO DUEÑO DE ESTOS NODOS. No se les toca ni el texto ni
 * el estilo desde fuera del render. Suena a purismo y no lo es: la
 * versión anterior escribía `textContent` en los rótulos para
 * actualizarlos durante el arrastre sin re-renderizar, y eso reventaba
 * la aplicación con
 *
 *   Failed to execute 'insertBefore' on 'Node': The node before which
 *   the new node is to be inserted is not a child of this node.
 *
 * El motivo: React lleva su propio modelo de los hijos de cada nodo. El
 * rótulo tenía VARIOS nodos de texto en el JSX; escribir `textContent`
 * los colapsa en uno solo, y en el siguiente render React busca los que
 * cree que están y encuentra otra cosa. La aplicación se muere entera,
 * y encima lejos de la causa.
 *
 * Así que la posición y el texto viven en estado. El bucle de animación
 * solo MIDE —pregunta al gráfico a qué altura cae cada precio— y escribe
 * estado cuando el número cambió. Renderizar cinco nodos a 60 cuadros
 * por segundo es exactamente para lo que sirve React.
 * ────────────────────────────────────────────────────────────────────
 *
 * Por qué un bucle de animación y no una suscripción: la altura de una
 * línea depende del eje de PRECIOS, que se mueve solo (autoescala) al
 * entrar una vela, al cambiar de temporalidad o al arrastrar el eje. No
 * hay un único evento que cubra todo eso; sí hay `requestAnimationFrame`.
 */
export function CapaNiveles({ chart, serie, niveles, onMover }: Props) {
  const capaRef = useRef<HTMLDivElement>(null);
  /** Altura en píxeles de cada nivel; `null` = fuera de la vista. */
  const [alturas, setAlturas] = useState<Record<string, number | null>>({});
  /** El arrastre en curso, con el precio que sigue al ratón. */
  const [arrastre, setArrastre] = useState<{ clave: string; precio: number } | null>(
    null,
  );
  const nivelesRef = useRef<NivelDibujado[]>(niveles);
  const arrastreRef = useRef(arrastre);
  const onMoverRef = useRef(onMover);

  useEffect(() => {
    nivelesRef.current = niveles;
  }, [niveles]);
  useEffect(() => {
    arrastreRef.current = arrastre;
  }, [arrastre]);
  useEffect(() => {
    onMoverRef.current = onMover;
  }, [onMover]);

  /** Mide dónde cae cada nivel y lo guarda en estado si cambió. */
  const medir = useCallback(() => {
    const capa = capaRef.current;
    if (!capa || !serie) return;
    const alto = capa.clientHeight;
    const nuevo: Record<string, number | null> = {};
    for (const n of nivelesRef.current) {
      const k = claveDe(n);
      const precio = arrastreRef.current?.clave === k ? arrastreRef.current.precio : n.precio;
      const y = serie.priceToCoordinate(precio);
      // Fuera del área visible no se dibuja: si no, el nodo se escapa
      // del alto y empuja el resto de la página.
      nuevo[k] =
        y === null || y === undefined || Number(y) < -2 || Number(y) > alto + 2
          ? null
          : Number(y);
    }
    setAlturas((previo) => {
      const kp = Object.keys(previo);
      const kn = Object.keys(nuevo);
      // Solo se escribe estado cuando algo cambió de verdad. Sin esta
      // comparación habría un render por cuadro para siempre.
      if (kp.length === kn.length && kn.every((k) => previo[k] === nuevo[k])) {
        return previo;
      }
      return nuevo;
    });
  }, [serie]);

  useEffect(() => {
    if (!chart || !serie) return;
    let vivo = true;
    const tick = () => {
      if (!vivo) return;
      medir();
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      vivo = false;
      cancelAnimationFrame(id);
    };
  }, [chart, serie, medir]);

  /** Agarrar una línea y moverla. */
  const alAgarrar = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, n: NivelDibujado) => {
      if (!n.arrastrable || !serie) return;
      e.preventDefault();
      e.stopPropagation();
      const capa = capaRef.current;
      if (!capa) return;
      const k = claveDe(n);
      const rect = capa.getBoundingClientRect();
      let ultimo = n.precio;
      const mover = (ev: PointerEvent) => {
        const p = serie.coordinateToPrice(ev.clientY - rect.top);
        if (p === null || p === undefined) return;
        const precio = Number(p);
        if (!Number.isFinite(precio) || precio <= 0) return;
        ultimo = precio;
        setArrastre({ clave: k, precio });
      };
      const soltar = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", soltar);
        setArrastre(null);
        // Se avisa al soltar, no en cada movimiento: así no se guardan
        // cincuenta posiciones intermedias en el almacén.
        onMoverRef.current(n.opId, n.cual, ultimo);
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
        const k = claveDe(n);
        const y = alturas[k];
        if (y === null || y === undefined) return null;
        const color = COLOR[n.cual];
        // El precio que se muestra es el del arrastre si se está
        // arrastrando ESTA línea, y si no el guardado. Una sola fuente:
        // lo que se ve es lo que se va a guardar.
        const precio = arrastre?.clave === k ? arrastre.precio : n.precio;
        const pct = n.entrada > 0 ? ((precio - n.entrada) / n.entrada) * 100 : 0;
        const monto =
          (precio - n.entrada) * n.cantidad * (n.lado === "compra" ? 1 : -1);
        return (
          <div
            key={k}
            data-clave={k}
            style={{ top: `${y}px` }}
            className="absolute left-0 right-0 -translate-y-1/2"
          >
            <div
              className="h-0 border-t border-dashed"
              style={{ borderColor: color }}
            />
            <div
              onPointerDown={(e) => alAgarrar(e, n)}
              className={[
                "absolute left-1 top-0 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px]",
                n.arrastrable
                  ? "pointer-events-auto cursor-ns-resize hover:brightness-125"
                  : "",
              ].join(" ")}
              style={{
                background: "rgba(19,23,34,0.92)",
                color,
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
              <span data-precio>{formatPrice(precio)}</span>
              {n.cual !== "entrada" && (
                <span data-dif className="opacity-80">
                  {`${pct >= 0 ? "+" : ""}${pct.toFixed(2)} % · ${monto >= 0 ? "+" : "−"}$${Math.abs(monto).toFixed(0)}`}
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
