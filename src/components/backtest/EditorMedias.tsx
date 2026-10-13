"use client";

import { Eye, EyeOff, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MAX_MEDIAS,
  TIPOS_MEDIA,
  mediasPorDefecto,
  nuevaMedia,
  tipoValido,
  type MediaMovil,
} from "@/lib/chart/medias";
import { cn } from "@/lib/utils";

interface Props {
  medias: MediaMovil[];
  onCambiar: (medias: MediaMovil[]) => void;
}

/**
 * Editor de las medias móviles del backtest.
 *
 * Son del backtest y no globales a propósito: parte de probar una idea es
 * probarla con una media de 9 y después con una de 21, y cada corrida
 * tiene que recordar con cuál se decidió.
 */
export function EditorMedias({ medias, onCambiar }: Props) {
  const cambiar = (id: string, parche: Partial<MediaMovil>) =>
    onCambiar(medias.map((m) => (m.id === id ? { ...m, ...parche } : m)));

  return (
    <Dialog>
      <DialogTrigger
        title="Tipo, período y color de cada media móvil"
        className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
      >
        <span className="flex gap-0.5">
          {medias.slice(0, 3).map((m) => (
            <span
              key={m.id}
              aria-hidden
              className="h-3 w-0.5 rounded"
              style={{ background: m.visible ? m.color : "#50535e" }}
            />
          ))}
        </span>
        <span>Medias</span>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto border-tv-border bg-tv-panel sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm text-tv-text">
            Medias móviles
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          {medias.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-tv-text-dim">
              No hay ninguna. Agregá la primera abajo.
            </p>
          )}

          {medias.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded border border-tv-border bg-tv-bg px-2 py-1.5"
            >
              <span className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded border border-tv-border">
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{ background: m.color }}
                />
                <input
                  type="color"
                  value={m.color}
                  onChange={(e) => cambiar(m.id, { color: e.target.value })}
                  aria-label={`Color de la media de ${m.periodo}`}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </span>

              <select
                value={m.tipo}
                onChange={(e) => cambiar(m.id, { tipo: tipoValido(e.target.value) })}
                aria-label="Tipo de media"
                className="w-20 rounded border border-tv-border bg-tv-panel px-1.5 py-1 text-[11px] text-tv-text"
              >
                {TIPOS_MEDIA.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-tv-text-dim">
                  Período
                </span>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={m.periodo}
                  onChange={(e) =>
                    cambiar(m.id, {
                      periodo: Math.min(
                        2000,
                        Math.max(1, Math.round(Number(e.target.value) || 1)),
                      ),
                    })
                  }
                  aria-label={`Período de la media ${m.tipo}`}
                  className="w-16 rounded border border-tv-border bg-tv-panel px-1.5 py-1 text-[11px] tabular-nums text-tv-text"
                />
              </label>

              <div className="flex gap-0.5 rounded bg-tv-panel p-0.5">
                {[1, 2].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => cambiar(m.id, { grosor: g })}
                    aria-label={`Grosor ${g}`}
                    aria-pressed={m.grosor === g}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
                      m.grosor === g
                        ? "bg-tv-blue text-white"
                        : "text-tv-text-muted hover:text-tv-text",
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => cambiar(m.id, { visible: !m.visible })}
                title={m.visible ? "Ocultar" : "Mostrar"}
                aria-label={m.visible ? `Ocultar media ${m.periodo}` : `Mostrar media ${m.periodo}`}
                className="ml-auto rounded p-1 text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-text"
              >
                {m.visible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onCambiar(medias.filter((x) => x.id !== m.id))}
                title="Quitar esta media"
                aria-label={`Quitar media de ${m.periodo}`}
                className="rounded p-1 text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-red"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={medias.length >= MAX_MEDIAS}
            onClick={() =>
              onCambiar([
                ...medias,
                nuevaMedia(
                  // Una propuesta razonable: el doble de la última.
                  Math.min(2000, (medias.at(-1)?.periodo ?? 10) * 2),
                  medias.map((m) => m.color),
                ),
              ])
            }
            className="flex items-center gap-1.5 rounded bg-tv-blue px-2.5 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar media
          </button>
          <button
            type="button"
            onClick={() => onCambiar(mediasPorDefecto())}
            className="flex items-center gap-1.5 rounded border border-tv-border px-2.5 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <RotateCcw className="h-3.5 w-3.5" /> 20 · 50 · 200
          </button>
          <span className="ml-auto text-[10px] text-tv-text-dim">
            {medias.length}/{MAX_MEDIAS}
          </span>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-tv-text-dim">
          Se guardan con este backtest: probar la misma idea con una media
          de 9 y con una de 21 son dos corridas distintas, y cada una
          recuerda con cuál decidiste. Para verlas, encendé «Medias móviles»
          en el menú de indicadores.
        </p>
      </DialogContent>
    </Dialog>
  );
}
