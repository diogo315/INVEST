"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  COLORES_DIBUJO,
  NOMBRES_DIBUJO,
  type EstiloLinea,
} from "@/lib/dibujos/tipos";
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

const ESTILOS: Array<{ id: EstiloLinea; etiqueta: string }> = [
  { id: "solida", etiqueta: "Sólida" },
  { id: "rayada", etiqueta: "Rayada" },
  { id: "punteada", etiqueta: "Punteada" },
];

/**
 * Edición del dibujo seleccionado: color, línea, texto y las coordenadas
 * exactas. Todo se aplica al instante sobre el gráfico — no hay "guardar",
 * porque el resultado se ve detrás del diálogo mientras se toca.
 */
export function DialogoDibujo() {
  const simbolo = useChartStore((s) => s.dibujoEnDialogo);
  const cerrar = useChartStore((s) => s.setDibujoEnDialogo);
  const id = useChartStore((s) => s.dibujoSeleccionado);
  const dibujo = useChartStore((s) =>
    simbolo && id ? (s.dibujos[simbolo] ?? []).find((d) => d.id === id) : undefined,
  );
  const editar = useChartStore((s) => s.editarDibujo);
  const borrar = useChartStore((s) => s.borrarDibujo);

  const abierto = !!simbolo && !!dibujo;
  const aplicar = (patch: Parameters<typeof editar>[2]) => {
    if (simbolo && id) editar(simbolo, id, patch);
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar(null)}>
      <DialogContent className="max-w-sm bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {dibujo ? NOMBRES_DIBUJO[dibujo.tipo] : ""}
          </DialogTitle>
        </DialogHeader>

        {dibujo && simbolo && id && (
          <div className="flex flex-col gap-3">
            {/* ── estilo ─────────────────────────────────────────────── */}
            <div className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-dim">
              Estilo
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {COLORES_DIBUJO.map((c) => (
                  <button
                    key={c}
                    onClick={() => aplicar({ color: c })}
                    aria-label={`Color ${c}`}
                    className={cn(
                      "h-6 w-6 rounded-full border-2",
                      dibujo.color === c ? "border-white" : "border-transparent",
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <input
                type="color"
                value={dibujo.color}
                onChange={(e) => aplicar({ color: e.target.value })}
                aria-label="Color personalizado"
                title="Otro color"
                className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                  Grosor
                </span>
                <select
                  value={dibujo.grosor}
                  onChange={(e) => aplicar({ grosor: Number(e.target.value) })}
                  className="rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs text-tv-text"
                >
                  {[1, 2, 3, 4, 5, 6].map((g) => (
                    <option key={g} value={g}>
                      {g} px
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                  Línea
                </span>
                <select
                  value={dibujo.estilo}
                  onChange={(e) =>
                    aplicar({ estilo: e.target.value as EstiloLinea })
                  }
                  className="rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs text-tv-text"
                >
                  {ESTILOS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {(dibujo.tipo === "rectangulo" || dibujo.tipo === "fibonacci") && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-tv-text">
                <input
                  type="checkbox"
                  checked={dibujo.relleno}
                  onChange={(e) => aplicar({ relleno: e.target.checked })}
                  className="h-3.5 w-3.5 accent-tv-blue"
                />
                Pintar el interior
              </label>
            )}

            {/* ── texto ──────────────────────────────────────────────── */}
            <div className="border-t border-tv-border pt-3 text-[10px] font-semibold uppercase tracking-wider text-tv-text-dim">
              Texto
            </div>
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                  Etiqueta
                </span>
                <Input
                  value={dibujo.texto}
                  onChange={(e) => aplicar({ texto: e.target.value.slice(0, 200) })}
                  placeholder={
                    dibujo.tipo === "texto" ? "Escribí acá" : "Opcional"
                  }
                  aria-label="Texto del dibujo"
                  className="bg-tv-bg"
                />
              </label>
              <label className="flex w-20 flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                  Tamaño
                </span>
                <select
                  value={dibujo.tamanoTexto}
                  onChange={(e) =>
                    aplicar({ tamanoTexto: Number(e.target.value) })
                  }
                  className="rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs text-tv-text"
                >
                  {[10, 12, 14, 16, 20, 24, 32].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* ── coordenadas ────────────────────────────────────────── */}
            <div className="border-t border-tv-border pt-3 text-[10px] font-semibold uppercase tracking-wider text-tv-text-dim">
              Coordenadas
            </div>
            <div className="flex flex-col gap-2">
              {dibujo.puntos.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-12 text-[10px] uppercase tracking-wider text-tv-text-muted">
                    {dibujo.puntos.length > 1 ? `Punto ${i + 1}` : "Punto"}
                  </span>
                  {dibujo.tipo !== "vertical" && (
                    <label className="flex flex-1 items-center gap-1">
                      <span className="text-[10px] text-tv-text-muted">Precio</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={String(p.price)}
                        onChange={(e) => {
                          const v = Number(e.target.value.replace(/[^\d.-]/g, ""));
                          if (!Number.isFinite(v)) return;
                          aplicar({
                            puntos: dibujo.puntos.map((q, j) =>
                              j === i ? { ...q, price: v } : q,
                            ),
                          });
                        }}
                        aria-label={`Precio del punto ${i + 1}`}
                        className="h-7 bg-tv-bg tabular-nums"
                      />
                    </label>
                  )}
                  {dibujo.tipo !== "horizontal" && (
                    <span className="flex-1 text-right text-[11px] tabular-nums text-tv-text-muted">
                      {new Date(p.time * 1000).toLocaleString("es", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* ── acciones ───────────────────────────────────────────── */}
            <div className="mt-1 flex items-center justify-between border-t border-tv-border pt-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-tv-text-muted">
                <input
                  type="checkbox"
                  checked={dibujo.bloqueado}
                  onChange={(e) => aplicar({ bloqueado: e.target.checked })}
                  className="h-3.5 w-3.5 accent-tv-blue"
                />
                Bloquear (no se mueve ni se borra)
              </label>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    borrar(simbolo, id);
                    cerrar(null);
                  }}
                  className="text-tv-text-muted hover:text-tv-red"
                >
                  Borrar
                </Button>
                <Button
                  size="sm"
                  onClick={() => cerrar(null)}
                  className="bg-tv-blue hover:bg-tv-blue/90"
                >
                  Listo
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
