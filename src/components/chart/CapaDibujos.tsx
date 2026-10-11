"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  COLORES_DIBUJO,
  NIVELES_FIB,
  PUNTOS_DE,
  dibujoBajoElClic,
  guionesDe,
  type Dibujo,
  type PuntoDibujo,
  type TipoDibujo,
} from "@/lib/dibujos/tipos";
import { useChartStore, type DrawingTool } from "@/lib/store/chart-store";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  /** Cuál de los gráficos abiertos es este. */
  graficoId: string;
  simbolo: string;
  /** Ancho y alto del área del gráfico, en píxeles. */
  ancho: number;
  alto: number;
  /** Conversión entre el mercado y la pantalla. */
  aX: (t: number) => number | null;
  aY: (p: number) => number | null;
  aTiempo: (x: number) => number | null;
  aPrecio: (y: number) => number | null;
  /** Se incrementa cuando el gráfico se mueve: obliga a redibujar. */
  tick: number;
}

/** Un punto del dibujo ya pasado a píxeles. */
interface EnPantalla {
  x: number;
  y: number;
}

/** Lo que se está arrastrando. */
type Arrastre =
  | { tipo: "punto"; id: string; indice: number }
  | { tipo: "todo"; id: string; desde: PuntoDibujo }
  | null;

/**
 * Capa de dibujo sobre el gráfico.
 *
 * Es un SVG encima del canvas. Va con `pointer-events: none` salvo donde
 * hace falta: así el gráfico se sigue pudiendo mover y hacer zoom con el
 * mouse, y solo los dibujos (o toda la capa, mientras se está dibujando)
 * capturan los clics.
 *
 * Los puntos viven en fecha y precio, y se convierten a píxeles en cada
 * render: por eso el dibujo acompaña al gráfico cuando se lo mueve.
 */
export function CapaDibujos({
  graficoId,
  simbolo,
  ancho,
  alto,
  aX,
  aY,
  aTiempo,
  aPrecio,
  tick,
}: Props) {
  const herramienta = useChartStore((s) => s.tool);
  const setTool = useChartStore((s) => s.setTool);
  const dibujos = useChartStore((s) => s.dibujos[simbolo]);
  // Solo el gráfico donde se seleccionó muestra los tiradores y la
  // barrita: con dos gráficos del mismo activo salían duplicados.
  const seleccionado = useChartStore((s) =>
    s.graficoDeLaSeleccion === graficoId ? s.dibujoSeleccionado : null,
  );
  const seleccionar = useChartStore((s) => s.seleccionarDibujo);
  const agregar = useChartStore((s) => s.agregarDibujo);
  const editar = useChartStore((s) => s.editarDibujo);
  const borrar = useChartStore((s) => s.borrarDibujo);
  const setDialogo = useChartStore((s) => s.setDibujoEnDialogo);

  // `tick` no se usa directamente: está para que el componente se vuelva a
  // renderizar (y a recalcular los píxeles) cada vez que el gráfico se mueve.
  void tick;
  const lista = useMemo(() => dibujos ?? [], [dibujos]);
  const dibujando = herramienta !== "cursor" && herramienta !== "measure";
  const borrando = herramienta === "eraser";

  /**
   * Primer punto ya marcado de un dibujo de dos puntos. Guarda también con
   * QUÉ herramienta se marcó: así, al cambiar de herramienta, lo que estaba
   * a medio dibujar se descarta solo, sin un efecto que limpie estado.
   */
  const [primerPunto, setPrimerPunto] = useState<
    { tool: DrawingTool; punto: PuntoDibujo } | null
  >(null);
  const aMedias = primerPunto?.tool === herramienta ? primerPunto.punto : null;
  /** Dónde está el mouse, para la vista previa mientras se dibuja. */
  const [mouse, setMouse] = useState<EnPantalla | null>(null);
  /**
   * Lo que se está arrastrando. Va en estado y no en una ref porque mover
   * un dibujo ya re-renderiza igual (cambia el store), y así el manejador
   * de movimiento siempre lee el valor de este render.
   */
  const [arrastre, setArrastre] = useState<Arrastre>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Escape mientras se dibuja: cancela y vuelve al cursor.
  useEffect(() => {
    if (!dibujando && !borrando) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPrimerPunto(null);
      setTool("cursor");
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [dibujando, borrando, setTool]);

  // Suprimir / Escape sobre el dibujo seleccionado.
  useEffect(() => {
    if (!seleccionado) return;
    const alTeclear = (e: KeyboardEvent) => {
      const enCampo =
        e.target instanceof HTMLElement &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (enCampo) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const d = lista.find((x) => x.id === seleccionado);
        if (d && !d.bloqueado) borrar(simbolo, seleccionado);
      } else if (e.key === "Escape") {
        seleccionar(null);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [seleccionado, lista, simbolo, borrar, seleccionar]);

  /** Píxeles de cada punto de un dibujo; null si el gráfico no está listo. */
  const puntosDe = (d: Dibujo): EnPantalla[] => {
    const out: EnPantalla[] = [];
    for (const p of d.puntos) {
      // Las horizontales no tienen fecha propia y las verticales no tienen
      // precio: se les da el borde del área para poder dibujarlas enteras.
      const x = d.tipo === "horizontal" ? 0 : (aX(p.time) ?? NaN);
      const y = d.tipo === "vertical" ? 0 : (aY(p.price) ?? NaN);
      out.push({ x, y });
    }
    return out;
  };

  const posicionDelMouse = (e: React.MouseEvent): EnPantalla | null => {
    const caja = svgRef.current?.getBoundingClientRect();
    if (!caja) return null;
    return { x: e.clientX - caja.left, y: e.clientY - caja.top };
  };

  const aMercado = (p: EnPantalla): PuntoDibujo | null => {
    const t = aTiempo(p.x);
    const precio = aPrecio(p.y);
    if (t === null || precio === null) return null;
    return { time: t, price: precio };
  };

  // ── crear ───────────────────────────────────────────────────────────
  function alHacerClic(e: React.MouseEvent) {
    const pos = posicionDelMouse(e);
    if (!pos) return;

    if (borrando) {
      const d = dibujoBajoElClic(lista, puntosDe, pos.x, pos.y, ancho, alto);
      if (d && !d.bloqueado) borrar(simbolo, d.id);
      return;
    }

    if (!dibujando) {
      // Con el cursor: seleccionar lo que haya debajo, o deseleccionar.
      const d = dibujoBajoElClic(lista, puntosDe, pos.x, pos.y, ancho, alto);
      seleccionar(d ? d.id : null, graficoId);
      return;
    }

    const punto = aMercado(pos);
    if (!punto) return;
    const tipo = herramienta as TipoDibujo;

    if (PUNTOS_DE[tipo] === 1) {
      agregar(simbolo, tipo, [punto], graficoId);
      // El texto se abre a editar enseguida: un "Texto" vacío no sirve.
      if (tipo === "texto") setDialogo(simbolo);
      setTool("cursor");
      return;
    }

    if (!aMedias) {
      setPrimerPunto({ tool: herramienta, punto });
      return;
    }
    agregar(simbolo, tipo, [aMedias, punto], graficoId);
    setPrimerPunto(null);
    setTool("cursor");
  }

  // ── mover ───────────────────────────────────────────────────────────
  function alMover(e: React.MouseEvent) {
    const pos = posicionDelMouse(e);
    if (!pos) return;
    if (dibujando) setMouse(pos);

    const arr = arrastre;
    if (!arr) return;
    const punto = aMercado(pos);
    if (!punto) return;
    const d = lista.find((x) => x.id === arr.id);
    if (!d || d.bloqueado) return;

    if (arr.tipo === "punto") {
      const puntos = d.puntos.map((p, i) => (i === arr.indice ? punto : p));
      editar(simbolo, d.id, { puntos });
    } else {
      // Mover entero: se corre por la diferencia contra donde se agarró.
      const dT = punto.time - arr.desde.time;
      const dP = punto.price - arr.desde.price;
      editar(simbolo, d.id, {
        puntos: d.puntos.map((p) => ({ time: p.time + dT, price: p.price + dP })),
      });
      setArrastre({ ...arr, desde: punto });
    }
  }

  function soltar() {
    if (arrastre) setArrastre(null);
  }

  const sel = lista.find((d) => d.id === seleccionado) ?? null;

  return (
    <>
      <svg
        ref={svgRef}
        width={ancho}
        height={alto}
        onClick={alHacerClic}
        onMouseMove={alMover}
        onMouseUp={soltar}
        onMouseLeave={() => {
          soltar();
          setMouse(null);
        }}
        onDoubleClick={() => {
          if (sel) setDialogo(simbolo);
        }}
        className={cn(
          "absolute left-0 top-0 z-10",
          // Mientras se dibuja o se borra, la capa entera recibe los clics;
          // con el cursor normal solo los reciben los dibujos, para no
          // robarle el arrastre y el zoom al gráfico. La excepción es
          // mientras se arrastra un dibujo: ahí la capa TIENE que recibir
          // el movimiento y el soltar, o el dibujo no se mueve.
          dibujando || borrando || arrastre
            ? "pointer-events-auto"
            : "pointer-events-none",
          dibujando && "cursor-crosshair",
          borrando && "cursor-pointer",
        )}
      >
        {lista.map((d) => (
          <FiguraDibujo
            key={d.id}
            d={d}
            pantalla={puntosDe(d)}
            ancho={ancho}
            alto={alto}
            seleccionada={d.id === seleccionado}
            interactiva={!dibujando && !borrando}
            alAgarrar={(e) => {
              e.stopPropagation();
              seleccionar(d.id, graficoId);
              const pos = posicionDelMouse(e);
              const punto = pos ? aMercado(pos) : null;
              if (punto && !d.bloqueado) {
                setArrastre({ tipo: "todo", id: d.id, desde: punto });
              }
            }}
          />
        ))}

        {/* Vista previa: del primer punto al mouse */}
        {aMedias && mouse && (
          <VistaPrevia
            tipo={herramienta as TipoDibujo}
            desde={{ x: aX(aMedias.time) ?? 0, y: aY(aMedias.price) ?? 0 }}
            hasta={mouse}
          />
        )}

        {/* Tiradores del dibujo seleccionado */}
        {sel &&
          !sel.bloqueado &&
          puntosDe(sel).map((p, i) => (
            <rect
              key={i}
              x={(sel.tipo === "horizontal" ? ancho / 2 : p.x) - 4}
              y={(sel.tipo === "vertical" ? alto / 2 : p.y) - 4}
              width={8}
              height={8}
              rx={1}
              className="pointer-events-auto cursor-grab"
              fill="#ffffff"
              stroke={sel.color}
              strokeWidth={2}
              onMouseDown={(e) => {
                e.stopPropagation();
                setArrastre({ tipo: "punto", id: sel.id, indice: i });
              }}
            />
          ))}
      </svg>

      {sel && <BarraDeDibujo simbolo={simbolo} d={sel} pantalla={puntosDe(sel)} ancho={ancho} />}
    </>
  );
}

/** Una figura ya dibujada. */
function FiguraDibujo({
  d,
  pantalla,
  ancho,
  alto,
  seleccionada,
  interactiva,
  alAgarrar,
}: {
  d: Dibujo;
  pantalla: EnPantalla[];
  ancho: number;
  alto: number;
  seleccionada: boolean;
  interactiva: boolean;
  alAgarrar: (e: React.MouseEvent) => void;
}) {
  const a = pantalla[0];
  const b = pantalla[1];
  if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return null;

  const guiones = guionesDe(d.estilo, d.grosor);
  const comun = {
    stroke: d.color,
    strokeWidth: d.grosor,
    strokeDasharray: guiones,
    fill: "none" as const,
  };
  // Una línea fina es imposible de agarrar: por encima va una copia
  // transparente y gruesa que recibe el mouse.
  const agarre = {
    stroke: "transparent",
    strokeWidth: Math.max(12, d.grosor + 10),
    fill: "none" as const,
    className: interactiva
      ? ("pointer-events-auto cursor-move" as const)
      : ("pointer-events-none" as const),
    onMouseDown: alAgarrar,
  };
  const resaltado = seleccionada
    ? { stroke: d.color, strokeWidth: d.grosor + 4, strokeOpacity: 0.25, fill: "none" as const }
    : null;

  if (d.tipo === "horizontal") {
    return (
      <g>
        {resaltado && <line x1={0} y1={a.y} x2={ancho} y2={a.y} {...resaltado} />}
        <line x1={0} y1={a.y} x2={ancho} y2={a.y} {...comun} />
        <line x1={0} y1={a.y} x2={ancho} y2={a.y} {...agarre} />
        <text x={6} y={a.y - 5} fill={d.color} fontSize={11} className="tabular-nums">
          {d.texto || formatPrice(d.puntos[0].price)}
        </text>
      </g>
    );
  }

  if (d.tipo === "vertical") {
    return (
      <g>
        {resaltado && <line x1={a.x} y1={0} x2={a.x} y2={alto} {...resaltado} />}
        <line x1={a.x} y1={0} x2={a.x} y2={alto} {...comun} />
        <line x1={a.x} y1={0} x2={a.x} y2={alto} {...agarre} />
        {d.texto && (
          <text x={a.x + 5} y={14} fill={d.color} fontSize={11}>
            {d.texto}
          </text>
        )}
      </g>
    );
  }

  if (d.tipo === "texto") {
    return (
      <g>
        <text
          x={a.x}
          y={a.y}
          fill={d.color}
          fontSize={d.tamanoTexto}
          dominantBaseline="middle"
          className={interactiva ? "pointer-events-auto cursor-move" : undefined}
          onMouseDown={alAgarrar}
          style={{ userSelect: "none" }}
        >
          {d.texto || "Texto"}
        </text>
        {seleccionada && (
          <rect
            x={a.x - 4}
            y={a.y - d.tamanoTexto * 0.8}
            width={Math.max(24, (d.texto || "Texto").length * d.tamanoTexto * 0.6) + 8}
            height={d.tamanoTexto * 1.6}
            fill="none"
            stroke={d.color}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
      </g>
    );
  }

  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return null;

  if (d.tipo === "tendencia" || d.tipo === "flecha") {
    const marcador = `punta-${d.id}`;
    return (
      <g>
        {d.tipo === "flecha" && (
          <defs>
            <marker
              id={marcador}
              markerWidth={7}
              markerHeight={7}
              refX={6}
              refY={3.5}
              orient="auto"
            >
              <path d="M0,0 L7,3.5 L0,7 z" fill={d.color} />
            </marker>
          </defs>
        )}
        {resaltado && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...resaltado} />}
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          {...comun}
          markerEnd={d.tipo === "flecha" ? `url(#${marcador})` : undefined}
        />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...agarre} />
        {d.texto && (
          <text
            x={(a.x + b.x) / 2}
            y={(a.y + b.y) / 2 - 6}
            fill={d.color}
            fontSize={d.tamanoTexto}
            textAnchor="middle"
          >
            {d.texto}
          </text>
        )}
      </g>
    );
  }

  if (d.tipo === "rectangulo") {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          stroke={d.color}
          strokeWidth={d.grosor}
          strokeDasharray={guiones}
          fill={d.relleno ? d.color : "transparent"}
          fillOpacity={d.relleno ? 0.12 : 0}
          className={interactiva ? "pointer-events-auto cursor-move" : undefined}
          onMouseDown={alAgarrar}
        />
        {seleccionada && (
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill="none"
            stroke={d.color}
            strokeWidth={d.grosor + 3}
            strokeOpacity={0.25}
          />
        )}
        {d.texto && (
          <text x={x + 5} y={y + d.tamanoTexto} fill={d.color} fontSize={d.tamanoTexto}>
            {d.texto}
          </text>
        )}
      </g>
    );
  }

  // Fibonacci: una línea por nivel entre los dos precios.
  const iz = Math.min(a.x, b.x);
  const de = Math.max(a.x, b.x);
  const precioA = 0;
  return (
    <g>
      {NIVELES_FIB.map((n, i) => {
        const y = a.y + (b.y - a.y) * n;
        const ySig =
          i < NIVELES_FIB.length - 1
            ? a.y + (b.y - a.y) * NIVELES_FIB[i + 1]
            : null;
        return (
          <g key={n}>
            {d.relleno && ySig !== null && (
              <rect
                x={iz}
                y={Math.min(y, ySig)}
                width={de - iz}
                height={Math.abs(ySig - y)}
                fill={d.color}
                fillOpacity={i % 2 === 0 ? 0.07 : 0.03}
              />
            )}
            <line
              x1={iz}
              y1={y}
              x2={de}
              y2={y}
              stroke={d.color}
              strokeWidth={d.grosor}
              strokeDasharray={guiones}
            />
            <line
              x1={iz}
              y1={y}
              x2={de}
              y2={y}
              {...agarre}
            />
            <text x={iz + 4} y={y - 3} fill={d.color} fontSize={10} className="tabular-nums">
              {(n * 100).toFixed(1).replace(".0", "")}%
            </text>
          </g>
        );
      })}
      {seleccionada && (
        <rect
          x={iz}
          y={Math.min(a.y, b.y)}
          width={de - iz}
          height={Math.abs(b.y - a.y)}
          fill="none"
          stroke={d.color}
          strokeWidth={1}
          strokeDasharray="4 4"
          strokeOpacity={0.6}
        />
      )}
      {precioA ? null : null}
    </g>
  );
}

/** Lo que se ve mientras se marca el segundo punto. */
function VistaPrevia({
  tipo,
  desde,
  hasta,
}: {
  tipo: TipoDibujo;
  desde: EnPantalla;
  hasta: EnPantalla;
}) {
  const comun = {
    stroke: COLORES_DIBUJO[0],
    strokeWidth: 1.5,
    strokeDasharray: "4 4",
    fill: "none" as const,
  };
  if (tipo === "rectangulo" || tipo === "fibonacci") {
    return (
      <rect
        x={Math.min(desde.x, hasta.x)}
        y={Math.min(desde.y, hasta.y)}
        width={Math.abs(hasta.x - desde.x)}
        height={Math.abs(hasta.y - desde.y)}
        {...comun}
      />
    );
  }
  return <line x1={desde.x} y1={desde.y} x2={hasta.x} y2={hasta.y} {...comun} />;
}

/** Barrita que aparece al seleccionar: color, grosor, estilo y acciones. */
function BarraDeDibujo({
  simbolo,
  d,
  pantalla,
  ancho,
}: {
  simbolo: string;
  d: Dibujo;
  pantalla: EnPantalla[];
  ancho: number;
}) {
  const editar = useChartStore((s) => s.editarDibujo);
  const borrar = useChartStore((s) => s.borrarDibujo);
  const duplicar = useChartStore((s) => s.duplicarDibujo);
  const setDialogo = useChartStore((s) => s.setDibujoEnDialogo);

  const xs = pantalla.map((p) => p.x).filter(Number.isFinite);
  const ys = pantalla.map((p) => p.y).filter(Number.isFinite);
  const x = xs.length ? Math.min(...xs) : 20;
  const y = ys.length ? Math.min(...ys) : 20;

  return (
    <div
      style={{
        left: Math.max(4, Math.min(ancho - 260, x)),
        top: Math.max(4, y - 44),
      }}
      className="pointer-events-auto absolute z-30 flex items-center gap-1 rounded-md border border-tv-border bg-tv-panel/95 px-1.5 py-1 shadow-lg backdrop-blur"
    >
      {COLORES_DIBUJO.map((c) => (
        <button
          key={c}
          onClick={() => editar(simbolo, d.id, { color: c })}
          title={`Color ${c}`}
          aria-label={`Color ${c}`}
          className={cn(
            "h-4 w-4 rounded-full border",
            d.color === c ? "border-white" : "border-transparent",
          )}
          style={{ background: c }}
        />
      ))}
      <div className="mx-0.5 h-4 w-px bg-tv-border" />
      {[1, 2, 3].map((g) => (
        <button
          key={g}
          onClick={() => editar(simbolo, d.id, { grosor: g })}
          title={`Grosor ${g}`}
          aria-label={`Grosor ${g}`}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded",
            d.grosor === g ? "bg-tv-blue/20" : "hover:bg-tv-panel-hover",
          )}
        >
          <span
            className="block w-3 rounded bg-tv-text"
            style={{ height: g }}
          />
        </button>
      ))}
      <div className="mx-0.5 h-4 w-px bg-tv-border" />
      <button
        onClick={() => setDialogo(simbolo)}
        className="rounded px-1.5 py-0.5 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        Editar
      </button>
      <button
        onClick={() => duplicar(simbolo, d.id)}
        title="Duplicar"
        className="rounded px-1.5 py-0.5 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        Duplicar
      </button>
      <button
        onClick={() => borrar(simbolo, d.id)}
        title="Borrar (Supr)"
        aria-label="Borrar el dibujo"
        className="rounded px-1.5 py-0.5 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-red"
      >
        Borrar
      </button>
    </div>
  );
}
