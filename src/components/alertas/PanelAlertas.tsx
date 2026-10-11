"use client";

import { useState } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { pedirPermiso } from "@/lib/alertas/motor";
import {
  CONDICIONES,
  FUENTES,
  MAX_ALERTAS,
  alertaNueva,
  describirAlerta,
  usaNivel,
  type CondicionAlerta,
  type FuenteAlerta,
} from "@/lib/alertas/tipos";
import { graficoActivo, useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

function cuandoTexto(ms: number): string {
  const seg = Math.floor((Date.now() - ms) / 1000);
  if (seg < 60) return "recién";
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  return new Date(ms).toLocaleDateString("es", { day: "numeric", month: "short" });
}

/** Campanita con el contador + el panel de alertas. */
export function PanelAlertas() {
  const [abierto, setAbierto] = useState(false);
  // Hasta cuándo se vio la lista. Se compara contra el último disparo en
  // vez de contra la hora actual: así no hace falta mirar el reloj en
  // medio del render (y el punto rojo no aparece y desaparece solo).
  const [vistoHasta, setVistoHasta] = useState(0);
  const alertas = useChartStore((s) => s.alertas);
  const disparos = useChartStore((s) => s.disparos);
  const activas = alertas.filter((a) => a.activa).length;
  const haySinVer = (disparos[0]?.cuando ?? 0) > vistoHasta;

  return (
    <>
      <button
        onClick={() => {
          setAbierto(true);
          setVistoHasta(disparos[0]?.cuando ?? 0);
        }}
        title="Alertas"
        aria-label="Alertas"
        className="relative flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-tv-text hover:bg-tv-panel-hover"
      >
        <Bell className="h-3.5 w-3.5" />
        <span>Alertas</span>
        {activas > 0 && (
          <span className="ml-0.5 rounded bg-tv-blue/20 px-1.5 py-0.5 text-[10px] font-semibold text-tv-blue">
            {activas}
          </span>
        )}
        {/* Punto rojo: saltó algo que todavía no miró */}
        {haySinVer && (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-tv-red" />
        )}
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg bg-tv-panel">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Alertas</DialogTitle>
          </DialogHeader>
          <Contenido />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Contenido() {
  const alertas = useChartStore((s) => s.alertas);
  const disparos = useChartStore((s) => s.disparos);
  const crear = useChartStore((s) => s.crearAlerta);
  const editar = useChartStore((s) => s.editarAlerta);
  const borrar = useChartStore((s) => s.borrarAlerta);
  const limpiar = useChartStore((s) => s.limpiarDisparos);
  const g = useChartStore(graficoActivo);

  // El formulario arranca con el activo y la temporalidad del gráfico que
  // se está mirando, que es casi siempre lo que uno quiere vigilar.
  const [nueva, setNueva] = useState(() =>
    alertaNueva("", g.symbol, g.timeframe, 0),
  );
  const [permiso, setPermiso] = useState<boolean | null>(null);

  const puedeCrear = alertas.length < MAX_ALERTAS;

  return (
    <div className="flex flex-col gap-3">
      {/* ── alta ───────────────────────────────────────────────────── */}
      <div className="rounded border border-tv-border bg-tv-bg p-2.5">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-dim">
          Nueva alerta — {nueva.simbolo.split(":")[1] ?? nueva.simbolo}
          {nueva.fuente !== "precio" && ` · ${nueva.timeframe}`}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[9rem] flex-1 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              Qué vigilar
            </span>
            <select
              value={nueva.fuente}
              onChange={(e) =>
                setNueva((n) => ({ ...n, fuente: e.target.value as FuenteAlerta }))
              }
              className="rounded border border-tv-border bg-tv-panel px-2 py-1 text-xs text-tv-text"
            >
              {FUENTES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[9rem] flex-1 flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              Condición
            </span>
            <select
              value={nueva.condicion}
              onChange={(e) =>
                setNueva((n) => ({
                  ...n,
                  condicion: e.target.value as CondicionAlerta,
                }))
              }
              className="rounded border border-tv-border bg-tv-panel px-2 py-1 text-xs text-tv-text"
            >
              {CONDICIONES.filter(
                (c) =>
                  usaNivel(nueva.fuente) ||
                  c.id === "cruzaArriba" ||
                  c.id === "cruzaAbajo",
              ).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </label>

          {usaNivel(nueva.fuente) && (
            <label className="flex w-24 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                Nivel
              </span>
              <Input
                type="text"
                inputMode="decimal"
                value={String(nueva.valor)}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, "");
                  setNueva((n) => ({ ...n, valor: Number(v) || 0 }));
                }}
                aria-label="Nivel de la alerta"
                className="h-8 bg-tv-panel tabular-nums"
              />
            </label>
          )}

          {(nueva.fuente === "rsi" || nueva.fuente === "cruceMedias") && (
            <label className="flex w-20 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                {nueva.fuente === "rsi" ? "Longitud" : "Rápida"}
              </span>
              <Input
                type="text"
                inputMode="numeric"
                value={String(nueva.periodo)}
                onChange={(e) =>
                  setNueva((n) => ({
                    ...n,
                    periodo: Number(e.target.value.replace(/\D/g, "")) || 1,
                  }))
                }
                aria-label="Período"
                className="h-8 bg-tv-panel tabular-nums"
              />
            </label>
          )}

          {nueva.fuente === "cruceMedias" && (
            <label className="flex w-20 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                Lenta
              </span>
              <Input
                type="text"
                inputMode="numeric"
                value={String(nueva.periodo2)}
                onChange={(e) =>
                  setNueva((n) => ({
                    ...n,
                    periodo2: Number(e.target.value.replace(/\D/g, "")) || 1,
                  }))
                }
                aria-label="Período de la media lenta"
                className="h-8 bg-tv-panel tabular-nums"
              />
            </label>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-tv-text">
            <input
              type="checkbox"
              checked={nueva.unaVez}
              onChange={(e) => setNueva((n) => ({ ...n, unaVez: e.target.checked }))}
              className="h-3.5 w-3.5 accent-tv-blue"
            />
            Avisar una sola vez
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-tv-text">
            <input
              type="checkbox"
              checked={nueva.sonido}
              onChange={(e) => setNueva((n) => ({ ...n, sonido: e.target.checked }))}
              className="h-3.5 w-3.5 accent-tv-blue"
            />
            Con sonido
          </label>
          <Button
            size="sm"
            disabled={!puedeCrear}
            onClick={async () => {
              setPermiso(await pedirPermiso());
              const { id: _id, creada: _creada, ...resto } = nueva;
              crear(resto);
            }}
            className="ml-auto gap-1 bg-tv-blue hover:bg-tv-blue/90"
          >
            <Plus className="h-3.5 w-3.5" /> Crear
          </Button>
        </div>
        {permiso === false && (
          <p className="mt-2 text-[10px] leading-relaxed text-tv-text-muted">
            El navegador no va a mostrar notificaciones (están bloqueadas para
            este sitio). La alerta igual suena y queda en la lista de abajo
            mientras la app esté abierta.
          </p>
        )}
      </div>

      {/* ── alertas puestas ────────────────────────────────────────── */}
      <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
        {alertas.length === 0 && (
          <p className="py-2 text-xs text-tv-text-muted">
            No hay alertas. Las alertas se revisan cada 15 segundos mientras
            esta pestaña esté abierta.
          </p>
        )}
        {alertas.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2 rounded border border-tv-border bg-tv-bg px-2 py-1.5"
          >
            <button
              type="button"
              onClick={() => editar(a.id, { activa: !a.activa })}
              title={a.activa ? "Pausar" : "Activar"}
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                a.activa ? "bg-tv-green" : "bg-tv-text-dim",
              )}
            />
            <span
              className={cn(
                "flex-1 text-[11px] leading-snug",
                a.activa ? "text-tv-text" : "text-tv-text-muted line-through",
              )}
            >
              {describirAlerta(a)}
              {a.ultimoDisparo && (
                <span className="ml-1 text-tv-text-dim">
                  · saltó {cuandoTexto(a.ultimoDisparo)}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => borrar(a.id)}
              title="Borrar la alerta"
              aria-label="Borrar la alerta"
              className="rounded p-1 text-tv-text-dim hover:bg-tv-panel-hover hover:text-tv-red"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* ── qué saltó ──────────────────────────────────────────────── */}
      {disparos.length > 0 && (
        <div className="border-t border-tv-border pt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-dim">
              Qué saltó
            </span>
            <button
              onClick={limpiar}
              className="text-[10px] text-tv-text-muted hover:text-tv-text"
            >
              Limpiar
            </button>
          </div>
          <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto pr-1">
            {disparos.map((d) => (
              <div key={d.id} className="flex gap-2 text-[11px]">
                <span className="w-16 shrink-0 text-tv-text-dim">
                  {cuandoTexto(d.cuando)}
                </span>
                <span className="text-tv-text">{d.texto}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
