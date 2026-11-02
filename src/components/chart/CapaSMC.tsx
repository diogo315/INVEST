"use client";

import { useMemo } from "react";
import {
  ALCISTA,
  calcularSMC,
  nivelAnterior,
  zonasDe,
  type ConfigSMC,
  type PeriodoNivel,
} from "@/lib/smc/motor";
import {
  AZUL_SMC,
  GRIS_SMC,
  colorAlcista,
  colorBajista,
  entraPorFiltro,
  soloElUltimo,
  type VistaSMC,
} from "@/lib/smc/vista";
import type { Candle } from "@/lib/binance/types";
import { formatPrice } from "@/lib/format";

interface Props {
  velas: Candle[];
  cfg: ConfigSMC;
  vista: VistaSMC;
  ancho: number;
  alto: number;
  aX: (t: number) => number | null;
  aY: (p: number) => number | null;
  /** Cambia cuando el gráfico se mueve, para obligar a redibujar. */
  tick: number;
}

/** Margen fuera del área visible antes de dejar de dibujar algo. */
const HOLGURA = 300;

/**
 * El indicador SMC dibujado encima del gráfico.
 *
 * Es un SVG con `pointer-events: none`: el gráfico se sigue moviendo y
 * haciendo zoom con el mouse por debajo. No recibe un solo clic.
 *
 * NO DIBUJA LAS SEÑALES DE ENTRADA. Las dibujaba, con su caja verde de
 * ganancia y su caja roja de riesgo, y era ilegible: una señal que
 * todavía no tocó el stop ni el objetivo se extiende hasta la última
 * vela, así que la caja tapaba media pantalla y las velas quedaban
 * debajo de un rectángulo de color. Las señales siguen calculándose
 * —el panel del backtest las usa— pero acá no se pintan.
 *
 * Todo lo que se ve sale de `calcularSMC` sobre las velas que se le
 * pasan. En el backtest eso son las velas HASTA EL RELOJ, así que el
 * dibujo muestra lo que se sabía en ese momento y no lo que terminó
 * pasando. Pasarle la serie completa mostraría bloques que todavía no
 * existían.
 *
 * Basado en "Smart Money Concepts (SMC)" © LuxAlgo, CC BY-NC-SA 4.0.
 */
export function CapaSMC({
  velas,
  cfg,
  vista,
  ancho,
  alto,
  aX,
  aY,
  tick,
}: Props) {
  void tick;
  const r = useMemo(() => calcularSMC(velas, cfg), [velas, cfg]);
  const mtf = useMemo(() => {
    const out: Array<{ periodo: PeriodoNivel; nivel: ReturnType<typeof nivelAnterior> }> = [];
    if (vista.nivelDiario) out.push({ periodo: "D", nivel: nivelAnterior(velas, "D") });
    if (vista.nivelSemanal) out.push({ periodo: "W", nivel: nivelAnterior(velas, "W") });
    if (vista.nivelMensual) out.push({ periodo: "M", nivel: nivelAnterior(velas, "M") });
    return out;
  }, [velas, vista.nivelDiario, vista.nivelSemanal, vista.nivelMensual]);

  if (ancho <= 0 || velas.length === 0) return null;

  const verde = colorAlcista(vista);
  const rojo = colorBajista(vista);

  const X = (t: number) => {
    const x = aX(t);
    return x === null || !Number.isFinite(x) ? NaN : x;
  };
  const Y = (p: number) => {
    const y = aY(p);
    return y === null || !Number.isFinite(y) ? NaN : y;
  };
  /** ¿Vale la pena dibujar algo que ocupa de x1 a x2? */
  const enPantalla = (x1: number, x2: number) =>
    Number.isFinite(x1) &&
    Number.isFinite(x2) &&
    Math.max(x1, x2) > -HOLGURA &&
    Math.min(x1, x2) < ancho + HOLGURA;

  const borde = ancho - 2;

  // ── estructura ──────────────────────────────────────────────────────
  let estructura = r.estructura.filter((e) =>
    e.interna
      ? vista.estructuraInterna && entraPorFiltro(vista.queInterna, e.tipo)
      : vista.estructuraSwing && entraPorFiltro(vista.queSwing, e.tipo),
  );
  if (vista.modo === "presente") {
    estructura = soloElUltimo(estructura, (e) => `${e.interna}:${e.sesgo}`);
  }

  // ── bloques vivos, los más recientes ────────────────────────────────
  const vivos = r.bloques.filter((b) => b.mitigadoEn === null);
  const bloques = [
    ...(vista.bloquesInternos
      ? vivos.filter((b) => b.interno).slice(-cfg.maxBloquesInternos)
      : []),
    ...(vista.bloquesSwing
      ? vivos.filter((b) => !b.interno).slice(-cfg.maxBloquesSwing)
      : []),
  ];

  const pasoVela =
    velas.length > 1 ? velas[velas.length - 1].time - velas[velas.length - 2].time : 60;

  return (
    <svg
        width={ancho}
        height={alto}
        className="pointer-events-none absolute left-0 top-0"
        data-capa="smc"
        aria-hidden
      >
        {/* ── zonas premium / equilibrio / descuento ─────────────────── */}
        {vista.zonas && r.extremos && (() => {
          const z = zonasDe(r.extremos);
          const x1 = X(r.extremos.pivoteTime);
          if (!Number.isFinite(x1)) return null;
          const caja = (
            clave: string,
            arriba: number,
            abajo: number,
            color: string,
            texto: string,
          ) => {
            const yA = Y(arriba);
            const yB = Y(abajo);
            if (!Number.isFinite(yA) || !Number.isFinite(yB)) return null;
            return (
              <g key={clave}>
                <rect
                  x={Math.max(0, x1)}
                  y={Math.min(yA, yB)}
                  width={Math.max(1, borde - Math.max(0, x1))}
                  height={Math.max(1, Math.abs(yB - yA))}
                  fill={color}
                  fillOpacity={0.12}
                />
                <text
                  x={(Math.max(0, x1) + borde) / 2}
                  y={(yA + yB) / 2 + 3}
                  fill={color}
                  fontSize={10}
                  textAnchor="middle"
                >
                  {texto}
                </text>
              </g>
            );
          };
          return (
            <g>
              {caja("pre", z.premium.alto, z.premium.bajo, rojo, "Premium")}
              {caja("eq", z.equilibrio.alto, z.equilibrio.bajo, GRIS_SMC, "Equilibrio")}
              {caja("des", z.descuento.alto, z.descuento.bajo, verde, "Descuento")}
            </g>
          );
        })()}

        {/* ── brechas de valor justo ─────────────────────────────────── */}
        {vista.fvg &&
          r.fvg
            .filter((g) => g.rellenadaEn === null)
            .map((g) => {
              const x1 = X(g.time);
              const x2 = X(g.time + (vista.extenderFvg + 1) * pasoVela);
              const yA = Y(g.alto);
              const yB = Y(g.bajo);
              if (!enPantalla(x1, x2) || !Number.isFinite(yA) || !Number.isFinite(yB)) {
                return null;
              }
              const color = g.sesgo === ALCISTA ? verde : rojo;
              return (
                <rect
                  key={`fvg-${g.indice}`}
                  x={Math.min(x1, x2)}
                  y={Math.min(yA, yB)}
                  width={Math.max(2, Math.abs(x2 - x1))}
                  height={Math.max(1, Math.abs(yB - yA))}
                  fill={color}
                  fillOpacity={0.28}
                  stroke={color}
                  strokeOpacity={0.5}
                />
              );
            })}

        {/* ── bloques de órdenes ─────────────────────────────────────── */}
        {bloques.map((b) => {
          const x1 = X(b.time);
          const yA = Y(b.alto);
          const yB = Y(b.bajo);
          if (!enPantalla(x1, borde) || !Number.isFinite(yA) || !Number.isFinite(yB)) {
            return null;
          }
          const color = b.sesgo === ALCISTA ? AZUL_SMC : rojo;
          const izq = Math.max(0, Math.min(x1, borde));
          return (
            <rect
              key={`ob-${b.interno ? "i" : "s"}-${b.indice}-${b.creadoEn}`}
              x={izq}
              y={Math.min(yA, yB)}
              width={Math.max(2, borde - izq)}
              height={Math.max(1, Math.abs(yB - yA))}
              fill={color}
              fillOpacity={b.interno ? 0.16 : 0.24}
              stroke={b.interno ? "none" : color}
              strokeOpacity={0.6}
            />
          );
        })}

        {/* ── niveles del período anterior ───────────────────────────── */}
        {mtf.map(({ periodo, nivel }) => {
          if (!nivel) return null;
          const etiqueta = { D: "PDH", W: "PWH", M: "PMH" }[periodo];
          const etiquetaB = { D: "PDL", W: "PWL", M: "PML" }[periodo];
          const linea = (p: number, t: number, texto: string, clave: string) => {
            const y = Y(p);
            const x = X(t);
            if (!Number.isFinite(y)) return null;
            return (
              <g key={clave}>
                <line
                  x1={Math.max(0, Number.isFinite(x) ? x : 0)}
                  y1={y}
                  x2={borde}
                  y2={y}
                  stroke={AZUL_SMC}
                  strokeWidth={1}
                />
                <text x={borde - 4} y={y - 4} fill={AZUL_SMC} fontSize={10} textAnchor="end">
                  {texto} {formatPrice(p)}
                </text>
              </g>
            );
          };
          return (
            <g key={`mtf-${periodo}`}>
              {linea(nivel.alto, nivel.altoTime, etiqueta, `${periodo}h`)}
              {linea(nivel.bajo, nivel.bajoTime, etiquetaB, `${periodo}l`)}
            </g>
          );
        })}

        {/* ── BOS y CHoCH ────────────────────────────────────────────── */}
        {estructura.map((e) => {
          const x1 = X(e.desdeTime);
          const x2 = X(e.time);
          const y = Y(e.nivel);
          if (!enPantalla(x1, x2) || !Number.isFinite(y)) return null;
          const color = e.sesgo === ALCISTA ? verde : rojo;
          return (
            <g key={`est-${e.interna ? "i" : "s"}-${e.indice}-${e.sesgo}`}>
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke={color}
                strokeWidth={e.interna ? 1 : 1.5}
                strokeDasharray={e.interna ? "4 4" : undefined}
              />
              <text
                x={(x1 + x2) / 2}
                y={e.sesgo === ALCISTA ? y - 4 : y + 11}
                fill={color}
                fontSize={e.interna ? 9 : 11}
                textAnchor="middle"
              >
                {e.tipo === "BOS" ? "BOS" : "CHoCH"}
              </text>
            </g>
          );
        })}

        {/* ── máximos y mínimos iguales ──────────────────────────────── */}
        {vista.iguales &&
          r.iguales.map((p) => {
            const x1 = X(p.desdeTime);
            const x2 = X(p.time);
            const yA = Y(p.nivelA);
            const yB = Y(p.nivelB);
            if (!enPantalla(x1, x2) || !Number.isFinite(yA) || !Number.isFinite(yB)) {
              return null;
            }
            const color = p.alto ? rojo : verde;
            return (
              <g key={`eq-${p.indice}-${p.alto ? "h" : "l"}`}>
                <line
                  x1={x1}
                  y1={yA}
                  x2={x2}
                  y2={yB}
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
                <text
                  x={(x1 + x2) / 2}
                  y={p.alto ? Math.min(yA, yB) - 4 : Math.max(yA, yB) + 11}
                  fill={color}
                  fontSize={9}
                  textAnchor="middle"
                >
                  {p.alto ? "EQH" : "EQL"}
                </text>
              </g>
            );
          })}

        {/* ── extremos fuertes y débiles ─────────────────────────────── */}
        {vista.extremos && r.extremos && (() => {
          const e = r.extremos;
          const par = (
            clave: string,
            precio: number,
            t: number,
            texto: string,
            color: string,
            arriba: boolean,
          ) => {
            const y = Y(precio);
            const x = X(t);
            if (!Number.isFinite(y)) return null;
            return (
              <g key={clave}>
                <line
                  x1={Math.max(0, Number.isFinite(x) ? x : 0)}
                  y1={y}
                  x2={borde}
                  y2={y}
                  stroke={color}
                  strokeWidth={1.5}
                />
                <text
                  x={borde - 4}
                  y={arriba ? y - 5 : y + 12}
                  fill={color}
                  fontSize={10}
                  textAnchor="end"
                >
                  {texto}
                </text>
              </g>
            );
          };
          return (
            <g>
              {par(
                "top",
                e.top,
                e.topTime,
                e.topFuerte ? "Máximo fuerte" : "Máximo débil",
                rojo,
                true,
              )}
              {par(
                "bot",
                e.bottom,
                e.bottomTime,
                e.bottomFuerte ? "Mínimo fuerte" : "Mínimo débil",
                verde,
                false,
              )}
            </g>
          );
        })()}
    </svg>
  );
}
