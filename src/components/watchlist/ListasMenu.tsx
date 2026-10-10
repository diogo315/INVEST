"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MAX_LISTAS,
  listaActivaDe,
  useChartStore,
} from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";

type Modo = "nueva" | "renombrar" | "borrar" | null;

/**
 * Selector de listas guardadas: cambia de lista y deja crear, renombrar,
 * duplicar y borrar. El nombre se pide en un diálogo propio en vez de un
 * `prompt()` del navegador, que en Chrome bloquea toda la página.
 */
export function ListasMenu() {
  const listas = useChartStore((s) => s.listas);
  const lista = useChartStore(listaActivaDe);
  const seleccionarLista = useChartStore((s) => s.seleccionarLista);
  const crearLista = useChartStore((s) => s.crearLista);
  const renombrarLista = useChartStore((s) => s.renombrarLista);
  const duplicarLista = useChartStore((s) => s.duplicarLista);
  const eliminarLista = useChartStore((s) => s.eliminarLista);

  const [modo, setModo] = useState<Modo>(null);
  const [texto, setTexto] = useState("");

  const abrir = (m: Exclude<Modo, null>) => {
    setTexto(m === "renombrar" ? lista.nombre : "");
    setModo(m);
  };

  const confirmar = () => {
    const nombre = texto.trim();
    if (modo === "nueva" && nombre) crearLista(nombre);
    if (modo === "renombrar" && nombre) renombrarLista(lista.id, nombre);
    if (modo === "borrar") eliminarLista(lista.id);
    setModo(null);
  };

  const topeListas = listas.length >= MAX_LISTAS;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex min-w-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-tv-text hover:bg-tv-panel-hover"
          title="Cambiar de lista"
          aria-label={`Lista actual: ${lista.nombre}. Cambiar de lista`}
        >
          <span className="truncate">{lista.nombre}</span>
          <span className="shrink-0 text-tv-text-dim">
            {lista.simbolos.length}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-tv-text-muted" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 bg-tv-panel">
          {/* La etiqueta de un grupo tiene que ir dentro del grupo: suelta,
              Base UI tira "MenuGroupRootContext is missing". */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              Mis listas
            </DropdownMenuLabel>
            {listas.map((l) => (
              <DropdownMenuItem
                key={l.id}
                onClick={() => seleccionarLista(l.id)}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">{l.nombre}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="tabular-nums text-[10px] text-tv-text-muted">
                    {l.simbolos.length}
                  </span>
                  {l.id === lista.id && (
                    <Check className="h-3.5 w-3.5 text-tv-blue" />
                  )}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => abrir("nueva")}
            disabled={topeListas}
            className={cn("gap-2 text-xs", topeListas && "opacity-50")}
          >
            <Plus className="h-3.5 w-3.5" /> Nueva lista
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => abrir("renombrar")}
            className="gap-2 text-xs"
          >
            <Pencil className="h-3.5 w-3.5" /> Renombrar
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => duplicarLista(lista.id)}
            disabled={topeListas}
            className={cn("gap-2 text-xs", topeListas && "opacity-50")}
          >
            <Copy className="h-3.5 w-3.5" /> Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => abrir("borrar")}
            className="gap-2 text-xs text-tv-red"
          >
            <Trash2 className="h-3.5 w-3.5" /> Borrar lista
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={modo !== null} onOpenChange={(v) => !v && setModo(null)}>
        <DialogContent className="gap-0 bg-tv-panel p-0 sm:max-w-sm">
          <DialogHeader className="border-b border-tv-border px-4 py-3">
            <DialogTitle className="text-sm font-medium">
              {modo === "nueva"
                ? "Nueva lista"
                : modo === "renombrar"
                  ? "Renombrar lista"
                  : "Borrar lista"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {modo === "borrar" ? (
              <p className="text-xs text-tv-text-muted">
                {listas.length <= 1 ? (
                  <>
                    «{lista.nombre}» es la única lista: se va a vaciar en vez de
                    borrarse.
                  </>
                ) : (
                  <>
                    Se borra «{lista.nombre}» con sus {lista.simbolos.length}{" "}
                    activos. Esto no se puede deshacer.
                  </>
                )}
              </p>
            ) : (
              <Input
                autoFocus
                value={texto}
                maxLength={40}
                placeholder="Nombre de la lista"
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmar();
                }}
                aria-label="Nombre de la lista"
                className="bg-tv-bg"
              />
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-tv-border px-4 py-3">
            <button
              type="button"
              onClick={() => setModo(null)}
              className="rounded px-3 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={modo !== "borrar" && texto.trim().length === 0}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium text-white",
                modo === "borrar"
                  ? "bg-tv-red hover:opacity-90"
                  : "bg-tv-blue hover:opacity-90",
                modo !== "borrar" &&
                  texto.trim().length === 0 &&
                  "cursor-not-allowed opacity-50",
              )}
            >
              {modo === "borrar"
                ? listas.length <= 1
                  ? "Vaciar"
                  : "Borrar"
                : "Guardar"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
