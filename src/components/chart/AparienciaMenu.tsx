"use client";

import { useState } from "react";
import { Palette, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TEMAS, type Apariencia } from "@/lib/chart/apariencia";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

/** Una fila con su interruptor. */
function Interruptor({
  etiqueta,
  ayuda,
  activo,
  onChange,
}: {
  etiqueta: string;
  ayuda?: string;
  activo: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onChange(!activo)}
      className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-tv-panel-hover"
    >
      <span
        aria-hidden
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors",
          activo ? "bg-tv-blue" : "bg-tv-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all",
            activo ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-tv-text">{etiqueta}</span>
        {ayuda && (
          <span className="block text-[10px] leading-snug text-tv-text-dim">
            {ayuda}
          </span>
        )}
      </span>
    </button>
  );
}

/** Un selector de color con su muestra y el hex escribible. */
function Color({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-tv-panel-hover">
      {/* La muestra la pinta un div: el recuadro nativo de `input[type=color]`
          dibuja su propio marco y un color oscuro termina viéndose claro. */}
      <span className="relative h-6 w-8 shrink-0 cursor-pointer overflow-hidden rounded border border-tv-border">
        <span
          aria-hidden
          className="absolute inset-0"
          style={{ background: valor }}
        />
        <input
          type="color"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          aria-label={etiqueta}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-tv-text">
        {etiqueta}
      </span>
      <span className="font-mono text-[10px] uppercase tabular-nums text-tv-text-dim">
        {valor}
      </span>
    </label>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {titulo}
      </h3>
      {children}
    </div>
  );
}

/** Miniatura de un tema: fondo, una vela verde y una roja. */
function MuestraTema({ id }: { id: string }) {
  const t = TEMAS.find((x) => x.id === id);
  if (!t) return null;
  const { fondo, subida, bajada, cuadricula } = t.colores;
  return (
    <span
      aria-hidden
      className="flex h-7 w-full items-end justify-center gap-1 rounded-sm border border-tv-border px-1 pb-1"
      style={{ background: fondo }}
    >
      <span className="h-3.5 w-1 rounded-[1px]" style={{ background: subida }} />
      <span className="h-5 w-1 rounded-[1px]" style={{ background: subida }} />
      <span className="h-2.5 w-1 rounded-[1px]" style={{ background: bajada }} />
      <span className="h-4 w-1 rounded-[1px]" style={{ background: cuadricula }} />
    </span>
  );
}

/**
 * Todo lo visual del gráfico en un solo sitio: tema, colores de las velas,
 * fondo, cuadrícula y cruz.
 *
 * Es global a propósito. Los indicadores son de cada gráfico porque cada
 * activo se mira distinto, pero el color de las velas es el tema de la app:
 * tenerlo distinto en cada panel se lee como un error, no como una opción.
 */
export function AparienciaMenu() {
  const [abierto, setAbierto] = useState(false);
  const a = useChartStore((s) => s.apariencia);
  const set = useChartStore((s) => s.setApariencia);
  const usarTema = useChartStore((s) => s.usarTema);
  const reiniciar = useChartStore((s) => s.reiniciarApariencia);

  const campo =
    <K extends keyof Apariencia>(clave: K) =>
    (v: Apariencia[K]) =>
      set({ [clave]: v } as Partial<Apariencia>);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger
        title="Colores, fondo y cuadrícula del gráfico"
        className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text hover:bg-tv-panel-hover"
      >
        <Palette className="h-3.5 w-3.5" />
        <span>Estilo</span>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto border-tv-border bg-tv-panel sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm text-tv-text">
            Apariencia del gráfico
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Seccion titulo="Tema">
            <div className="grid grid-cols-3 gap-1.5 px-2 sm:grid-cols-5">
              {TEMAS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => usarTema(t.id)}
                  className={cn(
                    "flex flex-col gap-1 rounded p-1 text-left transition-colors",
                    a.tema === t.id
                      ? "bg-tv-blue/20 ring-1 ring-tv-blue"
                      : "hover:bg-tv-panel-hover",
                  )}
                >
                  <MuestraTema id={t.id} />
                  <span className="truncate text-[10px] text-tv-text-muted">
                    {t.nombre}
                  </span>
                </button>
              ))}
            </div>
            <p className="px-2 pt-1 text-[10px] leading-relaxed text-tv-text-dim">
              El tema solo cambia los colores: los interruptores de abajo se
              mantienen. Si tocás un color a mano, deja de estar marcado.
            </p>
          </Seccion>

          <Seccion titulo="Velas">
            <Color etiqueta="Sube" valor={a.subida} onChange={campo("subida")} />
            <Color etiqueta="Baja" valor={a.bajada} onChange={campo("bajada")} />
            <Interruptor
              etiqueta="Velas huecas"
              ayuda="Las de subida quedan sin relleno, solo el contorno"
              activo={a.huecas}
              onChange={campo("huecas")}
            />
            <Interruptor
              etiqueta="Borde de la vela"
              activo={a.bordes}
              onChange={campo("bordes")}
            />
            <Interruptor
              etiqueta="Mechas"
              ayuda="El máximo y el mínimo de cada vela"
              activo={a.mechas}
              onChange={campo("mechas")}
            />
          </Seccion>

          <Seccion titulo="Fondo y cuadrícula">
            <Color etiqueta="Fondo" valor={a.fondo} onChange={campo("fondo")} />
            <Color
              etiqueta="Color de la cuadrícula"
              valor={a.cuadricula}
              onChange={campo("cuadricula")}
            />
            <Interruptor
              etiqueta="Líneas verticales"
              activo={a.cuadriculaV}
              onChange={campo("cuadriculaV")}
            />
            <Interruptor
              etiqueta="Líneas horizontales"
              activo={a.cuadriculaH}
              onChange={campo("cuadriculaH")}
            />
            <Color
              etiqueta="Texto de las escalas"
              valor={a.texto}
              onChange={campo("texto")}
            />
            <Color
              etiqueta="Bordes y separadores"
              valor={a.borde}
              onChange={campo("borde")}
            />
          </Seccion>

          <Seccion titulo="Cruz y escalas">
            <div className="flex gap-1 px-2 pb-1">
              {(
                [
                  ["libre", "Libre"],
                  ["iman", "Imán"],
                  ["oculta", "Sin cruz"],
                ] as const
              ).map(([id, texto]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set({ cruz: id })}
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-[11px] transition-colors",
                    a.cruz === id
                      ? "bg-tv-blue text-white"
                      : "bg-tv-bg text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                >
                  {texto}
                </button>
              ))}
            </div>
            <p className="px-2 pb-1 text-[10px] leading-relaxed text-tv-text-dim">
              Con imán, la cruz se pega al precio de la vela más cercana.
            </p>
            <Interruptor
              etiqueta="Cruz punteada"
              activo={a.estiloCruz === "punteada"}
              onChange={(v) => set({ estiloCruz: v ? "punteada" : "solida" })}
            />
            <Interruptor
              etiqueta="Línea del último precio"
              activo={a.lineaPrecio}
              onChange={campo("lineaPrecio")}
            />
            <Interruptor
              etiqueta="Escala logarítmica"
              ayuda="Iguala los porcentajes: útil en históricos largos"
              activo={a.escalaLog}
              onChange={campo("escalaLog")}
            />
          </Seccion>

          <Seccion titulo="Volumen">
            <div className="flex items-center gap-3 px-2 py-1">
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={a.opacidadVolumen}
                onChange={(e) =>
                  set({ opacidadVolumen: Number(e.target.value) })
                }
                aria-label="Opacidad de las barras de volumen"
                className="h-1 flex-1 cursor-pointer accent-tv-blue"
              />
              <span className="w-10 text-right font-mono text-[11px] tabular-nums text-tv-text-muted">
                {a.opacidadVolumen}%
              </span>
            </div>
            <p className="px-2 text-[10px] leading-relaxed text-tv-text-dim">
              Qué tanto tapan las barras a las velas que tienen detrás.
            </p>
          </Seccion>

          <button
            type="button"
            onClick={reiniciar}
            className="mx-2 flex items-center justify-center gap-1.5 rounded border border-tv-border px-2 py-1.5 text-xs text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Volver a los valores de fábrica
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
