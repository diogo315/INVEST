"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  costoApertura,
  metricas,
  resultado,
  type Lado,
  type TipoPata,
} from "@/lib/options/black-scholes";
import { MULTIPLICADOR_EEUU, useOptionsStore } from "@/lib/store/options-store";
import { Tarjeta, money } from "./ui";
import { cn } from "@/lib/utils";

const VERDE = "#26a69a";
const ROJO = "#ef5350";
const AZUL = "#5b8dff";

const ANCHO = 1000;
const ALTO = 320;
const PAD = { arriba: 14, derecha: 18, abajo: 30, izquierda: 62 };
const PUNTOS = 240;

const nuevoId = () => `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function Estrategias() {
  const s = useOptionsStore();
  const [hover, setHover] = useState<{ x: number; precio: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const r = s.tasaPct / 100;
  const q = s.divPct / 100;

  const activas = useMemo(() => s.patas.filter((p) => p.activa), [s.patas]);

  const rango = useMemo(() => {
    // El barrido cubre el rango pedido alrededor del precio actual, pero
    // siempre deja ver todos los strikes: un spread lejano no puede quedar
    // fuera del dibujo.
    const strikes = activas.filter((p) => p.tipo !== "accion").map((p) => p.strike);
    const minimo = Math.min(s.S * (1 - s.rangoPct / 100), ...strikes);
    const maximo = Math.max(s.S * (1 + s.rangoPct / 100), ...strikes);
    const aire = (maximo - minimo) * 0.08 || s.S * 0.05;
    return { desde: Math.max(0, minimo - aire), hasta: maximo + aire };
  }, [activas, s.S, s.rangoPct]);

  const diasMax = useMemo(
    () =>
      activas.length === 0
        ? 0
        : Math.max(...activas.map((p) => (p.tipo === "accion" ? 0 : p.dias))),
    [activas],
  );

  const curvas = useMemo(() => {
    const paso = (rango.hasta - rango.desde) / PUNTOS;
    const vencimiento: Array<{ S: number; y: number }> = [];
    const hoy: Array<{ S: number; y: number }> = [];
    for (let i = 0; i <= PUNTOS; i++) {
      const S = rango.desde + i * paso;
      vencimiento.push({ S, y: resultado(activas, S, diasMax, r, q) });
      hoy.push({ S, y: resultado(activas, S, 0, r, q) });
    }
    return { vencimiento, hoy };
  }, [activas, rango, diasMax, r, q]);

  const m = useMemo(
    () => metricas(s.patas, rango.desde, rango.hasta, r, q),
    [s.patas, rango, r, q],
  );

  const escala = useMemo(() => {
    const ys = [...curvas.vencimiento, ...curvas.hoy].map((p) => p.y);
    let min = Math.min(0, ...ys);
    let max = Math.max(0, ...ys);
    if (max - min < 1) {
      min -= 1;
      max += 1;
    }
    const aire = (max - min) * 0.1;
    min -= aire;
    max += aire;
    const x = (S: number) =>
      PAD.izquierda +
      ((S - rango.desde) / (rango.hasta - rango.desde)) *
        (ANCHO - PAD.izquierda - PAD.derecha);
    const y = (v: number) =>
      PAD.arriba + ((max - v) / (max - min)) * (ALTO - PAD.arriba - PAD.abajo);
    return { x, y, min, max };
  }, [curvas, rango]);

  const camino = (pts: Array<{ S: number; y: number }>) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${escala.x(p.S)},${escala.y(p.y)}`).join(" ");

  const area = (pts: Array<{ S: number; y: number }>) =>
    `${camino(pts)} L${escala.x(pts[pts.length - 1].S)},${escala.y(0)} L${escala.x(pts[0].S)},${escala.y(0)} Z`;

  const valorEn = (precio: number) => ({
    vencimiento: resultado(activas, precio, diasMax, r, q),
    hoy: resultado(activas, precio, 0, r, q),
  });

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const caja = svg.getBoundingClientRect();
    const xPx = ((e.clientX - caja.left) / caja.width) * ANCHO;
    if (xPx < PAD.izquierda || xPx > ANCHO - PAD.derecha) return setHover(null);
    const precio =
      rango.desde +
      ((xPx - PAD.izquierda) / (ANCHO - PAD.izquierda - PAD.derecha)) *
        (rango.hasta - rango.desde);
    setHover({ x: xPx, precio });
  };

  const agregar = (tipo: TipoPata, lado: Lado) =>
    s.agregarPata({
      id: nuevoId(),
      tipo,
      lado,
      cantidad: 1,
      multiplicador: tipo === "accion" ? 1 : MULTIPLICADOR_EEUU,
      strike: tipo === "accion" ? 0 : Math.round(s.K),
      prima: tipo === "accion" ? s.S : 1,
      dias: s.dias,
      vol: s.volPct / 100,
      activa: true,
    });

  const costo = costoApertura(s.patas);
  const hv = hover ? valorEn(hover.precio) : null;

  const ticksY = useMemo(() => {
    const out: number[] = [];
    const paso = (escala.max - escala.min) / 4;
    for (let i = 0; i <= 4; i++) out.push(escala.min + paso * i);
    return out;
  }, [escala]);

  const ticksX = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i <= 6; i++) {
      out.push(rango.desde + ((rango.hasta - rango.desde) * i) / 6);
    }
    return out;
  }, [rango]);

  return (
    <Tarjeta
      titulo="Estrategias y resultado"
      subtitulo="Armá la posición pata por pata y mirá el resultado en dólares contra el precio del subyacente. La línea llena es al vencimiento; la punteada, hoy."
    >
      {/* ── acciones rápidas ─────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["Comprar call", "call", "compra"],
            ["Vender call", "call", "venta"],
            ["Comprar put", "put", "compra"],
            ["Vender put", "put", "venta"],
            ["Comprar acciones", "accion", "compra"],
          ] as Array<[string, TipoPata, Lado]>
        ).map(([texto, tipo, lado]) => (
          <button
            key={texto}
            onClick={() => agregar(tipo, lado)}
            className="flex items-center gap-1 rounded border border-tv-border px-2 py-1 text-[11px] text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <Plus className="h-3 w-3" />
            {texto}
          </button>
        ))}
        {s.patas.length > 0 && (
          <button
            onClick={s.limpiarPatas}
            className="ml-auto rounded border border-tv-border px-2 py-1 text-[11px] text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-red"
          >
            Vaciar
          </button>
        )}
      </div>

      {/* ── patas ────────────────────────────────────────────────────── */}
      {s.patas.length === 0 ? (
        <p className="rounded border border-dashed border-tv-border px-3 py-6 text-center text-xs text-tv-text-muted">
          Agregá una pata con los botones de arriba.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                <th className="px-1 py-1 text-left">Ver</th>
                <th className="px-1 py-1 text-left">Lado</th>
                <th className="px-1 py-1 text-left">Tipo</th>
                <th className="px-1 py-1 text-right">Cant.</th>
                <th className="px-1 py-1 text-right">Strike</th>
                <th className="px-1 py-1 text-right">Prima</th>
                <th className="px-1 py-1 text-right">Días</th>
                <th className="px-1 py-1 text-right">Vol %</th>
                <th className="px-1 py-1 text-right">Costo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.patas.map((p) => {
                const signo = p.lado === "compra" ? 1 : -1;
                const costoPata = signo * p.prima * p.cantidad * p.multiplicador;
                return (
                  <tr key={p.id} className="border-t border-tv-border">
                    <td className="px-1 py-1">
                      <input
                        type="checkbox"
                        checked={p.activa}
                        onChange={(e) =>
                          s.actualizarPata(p.id, { activa: e.target.checked })
                        }
                        className="accent-tv-blue"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={p.lado}
                        onChange={(e) =>
                          s.actualizarPata(p.id, { lado: e.target.value as Lado })
                        }
                        className={cn(
                          "rounded border border-tv-border bg-tv-bg px-1 py-0.5 outline-none",
                          p.lado === "compra" ? "text-tv-green" : "text-tv-red",
                        )}
                      >
                        <option value="compra">Compra</option>
                        <option value="venta">Venta</option>
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={p.tipo}
                        onChange={(e) =>
                          s.actualizarPata(p.id, {
                            tipo: e.target.value as TipoPata,
                            multiplicador:
                              e.target.value === "accion" ? 1 : MULTIPLICADOR_EEUU,
                          })
                        }
                        className="rounded border border-tv-border bg-tv-bg px-1 py-0.5 text-tv-text outline-none"
                      >
                        <option value="call">Call</option>
                        <option value="put">Put</option>
                        <option value="accion">Acción</option>
                      </select>
                    </td>
                    <NumCelda
                      valor={p.cantidad}
                      paso={1}
                      onChange={(v) => s.actualizarPata(p.id, { cantidad: Math.max(0, v) })}
                    />
                    <NumCelda
                      valor={p.strike}
                      paso={0.5}
                      deshabilitado={p.tipo === "accion"}
                      onChange={(v) => s.actualizarPata(p.id, { strike: v })}
                    />
                    <NumCelda
                      valor={p.prima}
                      paso={0.05}
                      onChange={(v) => s.actualizarPata(p.id, { prima: v })}
                    />
                    <NumCelda
                      valor={p.dias}
                      paso={1}
                      deshabilitado={p.tipo === "accion"}
                      onChange={(v) => s.actualizarPata(p.id, { dias: Math.max(0, v) })}
                    />
                    <NumCelda
                      valor={Number((p.vol * 100).toFixed(2))}
                      paso={0.5}
                      deshabilitado={p.tipo === "accion"}
                      onChange={(v) =>
                        s.actualizarPata(p.id, { vol: Math.max(0, v) / 100 })
                      }
                    />
                    <td
                      className={cn(
                        "px-1 py-1 text-right tabular-nums",
                        costoPata >= 0 ? "text-tv-text" : "text-tv-green",
                      )}
                    >
                      {money(costoPata, 0)}
                    </td>
                    <td className="px-1 py-1 text-right">
                      <button
                        onClick={() => s.quitarPata(p.id)}
                        aria-label="Quitar pata"
                        className="text-tv-text-dim transition-colors hover:text-tv-red"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── métricas ─────────────────────────────────────────────────── */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metrica
          nombre={costo >= 0 ? "Débito (lo que pagás)" : "Crédito (lo que cobrás)"}
          valor={money(Math.abs(costo), 0)}
        />
        <Metrica
          nombre="Ganancia máxima"
          valor={m.maxGanancia === null ? "Ilimitada" : money(m.maxGanancia, 0)}
          color={VERDE}
        />
        <Metrica
          nombre="Pérdida máxima"
          valor={m.maxPerdida === null ? "Ilimitada" : money(Math.abs(m.maxPerdida ?? 0), 0)}
          color={ROJO}
        />
        <Metrica
          nombre="Punto(s) de equilibrio"
          valor={
            m.equilibrios.length === 0
              ? "—"
              : m.equilibrios.map((e) => e.toFixed(2)).join(" · ")
          }
        />
      </div>

      {/* ── diagrama ─────────────────────────────────────────────────── */}
      <div className="relative mt-3">
        <div className="mb-1 flex items-center gap-4 text-[10px] text-tv-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5" style={{ background: VERDE }} />
            Al vencimiento ({diasMax} días)
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-5"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, ${AZUL} 0 4px, transparent 4px 7px)`,
              }}
            />
            Hoy
          </span>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          className="w-full"
          style={{ height: ALTO }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Resultado de la estrategia según el precio del subyacente"
        >
          <defs>
            <clipPath id="arribaCero">
              <rect
                x={PAD.izquierda}
                y={PAD.arriba}
                width={ANCHO - PAD.izquierda - PAD.derecha}
                height={Math.max(0, escala.y(0) - PAD.arriba)}
              />
            </clipPath>
            <clipPath id="abajoCero">
              <rect
                x={PAD.izquierda}
                y={escala.y(0)}
                width={ANCHO - PAD.izquierda - PAD.derecha}
                height={Math.max(0, ALTO - PAD.abajo - escala.y(0))}
              />
            </clipPath>
          </defs>

          {/* grilla */}
          {ticksY.map((v) => (
            <g key={v}>
              <line
                x1={PAD.izquierda}
                x2={ANCHO - PAD.derecha}
                y1={escala.y(v)}
                y2={escala.y(v)}
                stroke="#2a2e39"
                strokeWidth={1}
              />
              <text
                x={PAD.izquierda - 8}
                y={escala.y(v) + 3.5}
                textAnchor="end"
                fontSize={10}
                fill="#787b86"
              >
                {money(v, 0)}
              </text>
            </g>
          ))}
          {ticksX.map((v) => (
            <text
              key={v}
              x={escala.x(v)}
              y={ALTO - PAD.abajo + 16}
              textAnchor="middle"
              fontSize={10}
              fill="#787b86"
            >
              {v.toFixed(0)}
            </text>
          ))}

          {activas.length > 0 && (
            <>
              {/* relleno por signo: polaridad, no identidad */}
              <path
                d={area(curvas.vencimiento)}
                fill={VERDE}
                opacity={0.16}
                clipPath="url(#arribaCero)"
              />
              <path
                d={area(curvas.vencimiento)}
                fill={ROJO}
                opacity={0.16}
                clipPath="url(#abajoCero)"
              />
              {/* línea de hoy */}
              <path
                d={camino(curvas.hoy)}
                fill="none"
                stroke={AZUL}
                strokeWidth={2}
                strokeDasharray="5 4"
              />
              {/* línea al vencimiento, partida en cero */}
              <path
                d={camino(curvas.vencimiento)}
                fill="none"
                stroke={VERDE}
                strokeWidth={2}
                clipPath="url(#arribaCero)"
              />
              <path
                d={camino(curvas.vencimiento)}
                fill="none"
                stroke={ROJO}
                strokeWidth={2}
                clipPath="url(#abajoCero)"
              />
            </>
          )}

          {/* cero */}
          <line
            x1={PAD.izquierda}
            x2={ANCHO - PAD.derecha}
            y1={escala.y(0)}
            y2={escala.y(0)}
            stroke="#50535e"
            strokeWidth={1}
          />

          {/* precio actual */}
          {s.S >= rango.desde && s.S <= rango.hasta && (
            <>
              <line
                x1={escala.x(s.S)}
                x2={escala.x(s.S)}
                y1={PAD.arriba}
                y2={ALTO - PAD.abajo}
                stroke="#787b86"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={escala.x(s.S)}
                y={PAD.arriba + 10}
                textAnchor="middle"
                fontSize={10}
                fill="#d1d4dc"
              >
                {s.simbolo} {s.S.toFixed(2)}
              </text>
            </>
          )}

          {/* equilibrios */}
          {m.equilibrios.map((e) => (
            <g key={e}>
              <circle cx={escala.x(e)} cy={escala.y(0)} r={4} fill="#d1d4dc" />
              <text
                x={escala.x(e)}
                y={escala.y(0) - 8}
                textAnchor="middle"
                fontSize={10}
                fill="#d1d4dc"
              >
                {e.toFixed(2)}
              </text>
            </g>
          ))}

          {/* crosshair */}
          {hover && (
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD.arriba}
              y2={ALTO - PAD.abajo}
              stroke="#d1d4dc"
              strokeWidth={1}
              opacity={0.5}
            />
          )}
        </svg>

        {hover && hv && (
          <div
            className="pointer-events-none absolute top-6 rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-[11px] shadow-lg"
            style={{
              left: `${(hover.x / ANCHO) * 100}%`,
              transform:
                hover.x > ANCHO * 0.6 ? "translateX(-110%)" : "translateX(10px)",
            }}
          >
            <div className="tabular-nums text-tv-text">
              {s.simbolo} {hover.precio.toFixed(2)}
            </div>
            <div
              className="tabular-nums"
              style={{ color: hv.vencimiento >= 0 ? VERDE : ROJO }}
            >
              Al vencimiento {money(hv.vencimiento, 0)}
            </div>
            <div className="tabular-nums" style={{ color: AZUL }}>
              Hoy {money(hv.hoy, 0)}
            </div>
          </div>
        )}
      </div>
    </Tarjeta>
  );
}

function NumCelda({
  valor,
  onChange,
  paso,
  deshabilitado,
}: {
  valor: number;
  onChange: (n: number) => void;
  paso: number;
  deshabilitado?: boolean;
}) {
  return (
    <td className="px-1 py-1 text-right">
      <input
        type="number"
        step={paso}
        disabled={deshabilitado}
        value={Number.isFinite(valor) ? valor : ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-16 rounded border border-tv-border bg-tv-bg px-1 py-0.5 text-right tabular-nums text-tv-text outline-none focus:border-tv-blue disabled:opacity-30"
      />
    </td>
  );
}

function Metrica({
  nombre,
  valor,
  color,
}: {
  nombre: string;
  valor: string;
  color?: string;
}) {
  return (
    <div className="rounded border border-tv-border bg-tv-bg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-tv-text-muted">
        {nombre}
      </div>
      <div className="text-sm font-semibold tabular-nums" style={{ color }}>
        {valor}
      </div>
    </div>
  );
}
