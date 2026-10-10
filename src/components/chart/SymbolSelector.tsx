"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ALL_EXCHANGES,
  EXCHANGE_BADGE,
  formatSymbol,
  parseSymbol,
} from "@/lib/exchanges";
import {
  NOMBRE_EXCHANGE,
  TIPO_MERCADO,
  descripcionPar,
  nombreDeActivo,
} from "@/lib/exchanges/nombres";
import {
  rankearSimbolos,
  type ActivoBuscable,
  type FiltroTipo,
} from "@/lib/exchanges/buscar";
import { listaActivaDe, useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import type { ExchangeId } from "@/lib/exchanges";

/** Chips de tipo de mercado. */
const TIPOS: Array<{ id: FiltroTipo; etiqueta: string }> = [
  { id: "TODOS", etiqueta: "Todos" },
  { id: "SPOT", etiqueta: "Spot" },
  { id: "PERP", etiqueta: "Perpetuos" },
];

/** Chips de exchange. */
const EXCHANGES: Array<{ id: ExchangeId | "TODOS"; etiqueta: string }> = [
  { id: "TODOS", etiqueta: "Todos" },
  { id: "BIN", etiqueta: "Binance" },
  { id: "BINF", etiqueta: "Futuros" },
  { id: "BG", etiqueta: "Bitget" },
];

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
        activo
          ? "bg-tv-blue text-white"
          : "bg-tv-bg text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
      )}
    >
      {children}
    </button>
  );
}

/** Marca en azul el pedazo que coincide con lo que se escribió. */
function Resaltado({ texto, consulta }: { texto: string; consulta: string }) {
  const q = consulta.trim();
  if (!q) return <>{texto}</>;
  const i = texto.toUpperCase().indexOf(q.toUpperCase());
  if (i === -1) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <span className="text-tv-blue">{texto.slice(i, i + q.length)}</span>
      {texto.slice(i + q.length)}
    </>
  );
}

export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useChartStore((s) => s.removeFromWatchlist);
  const lista = useChartStore(listaActivaDe);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  const [query, setQuery] = useState("");
  const [catalogo, setCatalogo] = useState<ActivoBuscable[]>([]);
  // Se pone en true cuando la descarga termina, haya traído algo o no: sin
  // esto un exchange caído deja el cartel de "Cargando…" para siempre.
  const [catalogoListo, setCatalogoListo] = useState(false);
  const [tipo, setTipo] = useState<FiltroTipo>("TODOS");
  const [exchange, setExchange] = useState<ExchangeId | "TODOS">("TODOS");
  // Fila marcada. Vuelve arriba cada vez que cambia la búsqueda o un filtro.
  const [cursor, setCursor] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);

  // El catálogo de los tres exchanges se baja una sola vez por sesión.
  useEffect(() => {
    if (!open || catalogo.length > 0) return;
    let cancelado = false;
    Promise.all(
      ALL_EXCHANGES.map((ex) =>
        ex
          .fetchSymbols()
          .then((filas) =>
            filas.map<ActivoBuscable>((s) => ({
              qualified: formatSymbol(ex.id, s.symbol),
              exchange: ex.id,
              symbol: s.symbol,
              base: s.baseAsset,
              quote: s.quoteAsset,
              nombre: nombreDeActivo(s.baseAsset),
            })),
          )
          .catch((err) => {
            console.error(`fetchSymbols ${ex.id} falló:`, err);
            return [] as ActivoBuscable[];
          }),
      ),
    ).then((listas) => {
      if (cancelado) return;
      setCatalogo(listas.flat());
      setCatalogoListo(true);
    });
    return () => {
      cancelado = true;
    };
  }, [open, catalogo.length]);

  const resultados = useMemo(
    () => rankearSimbolos(catalogo, query, { tipo, exchange }),
    [catalogo, query, tipo, exchange],
  );

  // Si la lista se achicó, el cursor no puede quedar apuntando fuera.
  const marcada = Math.min(cursor, Math.max(0, resultados.length - 1));

  // Mantener visible la fila marcada cuando se navega con las flechas.
  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${marcada}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [marcada]);

  const elegir = (a: ActivoBuscable) => {
    setSymbol(a.qualified);
    addToWatchlist(a.qualified);
    setOpen(false);
    setQuery("");
  };

  const teclado = (e: React.KeyboardEvent) => {
    if (resultados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(Math.min(marcada + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(Math.max(marcada - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const a = resultados[marcada];
      if (a) elegir(a);
    }
  };

  const displayBase = parseSymbol(symbol).symbol;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="group flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold hover:bg-tv-panel-hover">
        <Search className="h-3.5 w-3.5 text-tv-text-muted group-hover:text-tv-text" />
        <span className="tabular-nums">{displayBase}</span>
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-0 bg-tv-panel p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">
            Buscar activo
          </DialogTitle>
        </DialogHeader>

        <div className="relative border-b border-tv-border p-3">
          <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-tv-text-muted" />
          <Input
            autoFocus
            placeholder="Ticker o nombre: BTC, bitcoin, solana…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={teclado}
            aria-label="Buscar activo por ticker o por nombre"
            className="bg-tv-bg pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-tv-border px-3 py-2">
          <span className="mr-0.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
            Mercado
          </span>
          {TIPOS.map((t) => (
            <Chip
              key={t.id}
              activo={tipo === t.id}
              onClick={() => {
                setTipo(t.id);
                setCursor(0);
              }}
            >
              {t.etiqueta}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-tv-border" />
          <span className="mr-0.5 text-[10px] uppercase tracking-wider text-tv-text-dim">
            Exchange
          </span>
          {EXCHANGES.map((x) => (
            <Chip
              key={x.id}
              activo={exchange === x.id}
              onClick={() => {
                setExchange(x.id);
                setCursor(0);
              }}
            >
              {x.etiqueta}
            </Chip>
          ))}
        </div>

        <ScrollArea className="h-[420px]">
          <div ref={listaRef} className="flex flex-col">
            {!catalogoListo && (
              <div className="p-6 text-center text-xs text-tv-text-muted">
                Cargando activos…
              </div>
            )}
            {catalogoListo && resultados.length === 0 && (
              <div className="p-6 text-center text-xs text-tv-text-muted">
                Sin resultados para «{query}»
              </div>
            )}
            {resultados.map((a, i) => {
              const enLista = lista.simbolos.includes(a.qualified);
              return (
                <div
                  key={a.qualified}
                  data-indice={i}
                  onMouseEnter={() => setCursor(i)}
                  className={cn(
                    "group flex items-center gap-3 border-b border-tv-border/60 px-4 py-2 text-xs",
                    i === marcada && "bg-tv-panel-hover",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => elegir(a)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className={cn(
                        "shrink-0 rounded px-1 py-0.5 text-[9px] font-bold tracking-wide",
                        EXCHANGE_BADGE[a.exchange].className,
                      )}
                    >
                      {EXCHANGE_BADGE[a.exchange].label}
                    </span>
                    <span className="w-28 shrink-0 truncate font-semibold text-tv-text">
                      <Resaltado texto={a.symbol} consulta={query} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-tv-text-muted">
                      <Resaltado
                        texto={descripcionPar(a.base, a.quote)}
                        consulta={query}
                      />
                    </span>
                    <span className="hidden shrink-0 text-[10px] text-tv-text-dim sm:inline">
                      {TIPO_MERCADO[a.exchange]}
                    </span>
                    <span className="hidden w-28 shrink-0 truncate text-right text-[10px] text-tv-text-muted md:inline">
                      {NOMBRE_EXCHANGE[a.exchange]}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      enLista
                        ? removeFromWatchlist(a.qualified)
                        : addToWatchlist(a.qualified)
                    }
                    title={
                      enLista
                        ? `Quitar de «${lista.nombre}»`
                        : `Agregar a «${lista.nombre}»`
                    }
                    aria-label={
                      enLista
                        ? `Quitar ${a.symbol} de ${lista.nombre}`
                        : `Agregar ${a.symbol} a ${lista.nombre}`
                    }
                    className={cn(
                      "shrink-0 rounded p-1 transition-colors",
                      enLista
                        ? "text-tv-green hover:bg-tv-bg"
                        : "text-tv-text-dim hover:bg-tv-bg hover:text-tv-text",
                    )}
                  >
                    {enLista ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between border-t border-tv-border px-4 py-2 text-[10px] text-tv-text-dim">
          <span>↑ ↓ para moverte · Enter para abrir · Esc para cerrar</span>
          <span className="tabular-nums">
            {resultados.length} de {catalogo.length} activos
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
