"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, ChevronDown } from "lucide-react";
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
import { useChartStore } from "@/lib/store/chart-store";
import { cn } from "@/lib/utils";
import type { SymbolInfo } from "@/lib/binance/types";
import type { ExchangeId } from "@/lib/exchanges";

interface QualifiedSymbol extends SymbolInfo {
  exchange: ExchangeId;
  exchangeName: string;
  qualified: string;
}

export function SymbolSelector() {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addToWatchlist = useChartStore((s) => s.addToWatchlist);
  const open = useChartStore((s) => s.symbolDialogOpen);
  const setOpen = useChartStore((s) => s.setSymbolDialogOpen);

  const [query, setQuery] = useState("");
  const [allSymbols, setAllSymbols] = useState<QualifiedSymbol[]>([]);
  const [filterEx, setFilterEx] = useState<ExchangeId | "ALL">("ALL");

  useEffect(() => {
    if (!open || allSymbols.length > 0) return;
    let cancelled = false;
    Promise.all(
      ALL_EXCHANGES.map((ex) =>
        ex
          .fetchSymbols()
          .then((rows) =>
            rows.map<QualifiedSymbol>((s) => ({
              ...s,
              exchange: ex.id,
              exchangeName: ex.name,
              qualified: formatSymbol(ex.id, s.symbol),
            })),
          )
          .catch((err) => {
            console.error(`fetchSymbols ${ex.id} failed:`, err);
            return [];
          }),
      ),
    ).then((lists) => {
      if (cancelled) return;
      setAllSymbols(lists.flat());
    });
    return () => {
      cancelled = true;
    };
  }, [open, allSymbols.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    let base = allSymbols;
    if (filterEx !== "ALL") base = base.filter((s) => s.exchange === filterEx);
    if (!q) return base.slice(0, 200);
    return base
      .filter(
        (s) =>
          s.symbol.includes(q) ||
          s.baseAsset.includes(q) ||
          s.quoteAsset.includes(q) ||
          s.qualified.includes(q),
      )
      .slice(0, 200);
  }, [query, allSymbols, filterEx]);

  const displayBase = parseSymbol(symbol).symbol;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="group flex items-center gap-2 rounded px-3 py-1.5 text-sm font-semibold hover:bg-tv-panel-hover">
        <Search className="h-3.5 w-3.5 text-tv-text-muted group-hover:text-tv-text" />
        <span className="tabular-nums">{displayBase}</span>
        <ChevronDown className="h-3.5 w-3.5 text-tv-text-muted" />
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 bg-tv-panel p-0">
        <DialogHeader className="border-b border-tv-border px-4 py-3">
          <DialogTitle className="text-sm font-medium">Buscar símbolo</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-tv-border p-3">
          <Input
            autoFocus
            placeholder="BTC, ETH, SOL…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-tv-bg"
          />
        </div>
        <div className="flex gap-1 border-b border-tv-border px-3 py-2">
          {(["ALL", "BIN", "BINF", "BG"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setFilterEx(id)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                filterEx === id
                  ? "bg-tv-blue text-white"
                  : "bg-tv-bg text-tv-text-muted hover:text-tv-text",
              )}
            >
              {id === "ALL"
                  ? "Todos"
                  : id === "BIN"
                    ? "Binance"
                    : id === "BINF"
                      ? "Futuros"
                      : "Bitget"}
            </button>
          ))}
        </div>
        <ScrollArea className="h-[400px]">
          <div className="flex flex-col">
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-tv-text-muted">
                Sin resultados
              </div>
            )}
            {filtered.map((s) => (
              <button
                key={s.qualified}
                onClick={() => {
                  setSymbol(s.qualified);
                  addToWatchlist(s.qualified);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "flex items-center justify-between border-b border-tv-border px-4 py-2 text-left text-xs hover:bg-tv-panel-hover",
                  s.qualified === symbol && "bg-tv-panel-hover",
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "rounded px-1 py-0.5 text-[9px] font-bold tracking-wide",
                      EXCHANGE_BADGE[s.exchange].className,
                    )}
                  >
                    {EXCHANGE_BADGE[s.exchange].label}
                  </span>
                  <span className="font-semibold text-tv-text">
                    {s.baseAsset}
                  </span>
                  <span className="text-tv-text-muted">/ {s.quoteAsset}</span>
                </div>
                <span className="text-tv-text-muted">{s.symbol}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
