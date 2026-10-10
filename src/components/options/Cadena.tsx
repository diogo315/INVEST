"use client";

import { useMemo, useState } from "react";
import { Download, Plus, RefreshCw } from "lucide-react";
import {
  diasHasta,
  traerCadena,
  traerPrecioAccion,
  type Cadena as CadenaDatos,
  type Contrato,
} from "@/lib/options/alpaca";
import { MULTIPLICADOR_EEUU, useOptionsStore } from "@/lib/store/options-store";
import { Tarjeta } from "./ui";
import { cn } from "@/lib/utils";

const ALREDEDOR = 12; // strikes a cada lado del dinero

export function Cadena() {
  const s = useOptionsStore();
  const [ticker, setTicker] = useState(s.simbolo);
  const [cadena, setCadena] = useState<CadenaDatos | null>(null);
  const [vencimiento, setVencimiento] = useState<string>("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<{ codigo: string; mensaje: string } | null>(
    null,
  );
  const [todos, setTodos] = useState(false);

  const traer = async () => {
    const sim = ticker.trim().toUpperCase();
    if (!sim) return;
    setCargando(true);
    setError(null);
    try {
      const [precio, datos] = await Promise.all([
        traerPrecioAccion(sim).catch(() => null),
        traerCadena(sim),
      ]);
      setCadena(datos);
      setVencimiento(datos.vencimientos[0] ?? "");
      s.setCampo("simbolo", sim);
      if (precio !== null) s.setCampo("S", Number(precio.toFixed(2)));
    } catch (e) {
      const err = e as { codigo?: string; message?: string };
      setError({
        codigo: err.codigo ?? "desconocido",
        mensaje: err.message ?? "No se pudo traer la cadena.",
      });
      setCadena(null);
    } finally {
      setCargando(false);
    }
  };

  const filas = useMemo(() => {
    if (!cadena) return [];
    const delVenc = cadena.contratos.filter((c) => c.vencimiento === vencimiento);
    const porStrike = new Map<number, { call?: Contrato; put?: Contrato }>();
    for (const c of delVenc) {
      const fila = porStrike.get(c.strike) ?? {};
      fila[c.tipo] = c;
      porStrike.set(c.strike, fila);
    }
    const ordenadas = [...porStrike.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([strike, par]) => ({ strike, ...par }));
    if (todos || ordenadas.length <= ALREDEDOR * 2 + 1) return ordenadas;

    // Recorte alrededor del dinero: una cadena entera son cientos de filas.
    let centro = 0;
    let mejor = Infinity;
    ordenadas.forEach((f, i) => {
      const d = Math.abs(f.strike - s.S);
      if (d < mejor) {
        mejor = d;
        centro = i;
      }
    });
    return ordenadas.slice(
      Math.max(0, centro - ALREDEDOR),
      centro + ALREDEDOR + 1,
    );
  }, [cadena, vencimiento, s.S, todos]);

  const cargarEnCalculadora = (c: Contrato) => {
    const precio = c.medio ?? c.ultimo ?? 0;
    s.setCampo("K", c.strike);
    s.setCampo("tipo", c.tipo);
    s.setCampo("dias", diasHasta(c.vencimiento));
    if (c.iv !== null) s.setCampo("volPct", Number((c.iv * 100).toFixed(2)));
    if (precio > 0) s.setCampo("precioMercado", Number(precio.toFixed(2)));
  };

  const agregarComoPata = (c: Contrato) => {
    const precio = c.medio ?? c.ultimo ?? 0;
    s.agregarPata({
      id: `p-${c.simbolo}-${Date.now()}`,
      tipo: c.tipo,
      lado: "compra",
      cantidad: 1,
      multiplicador: MULTIPLICADOR_EEUU,
      strike: c.strike,
      prima: Number(precio.toFixed(2)),
      dias: diasHasta(c.vencimiento),
      vol: c.iv ?? s.volPct / 100,
      activa: true,
    });
  };

  return (
    <Tarjeta
      titulo="Cadena de opciones en vivo"
      subtitulo="Datos de Alpaca. El plan gratis entrega el feed «indicative» de opciones y acciones por IEX: sirve para estudiar y simular, no para pasar órdenes."
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Ticker
          </span>
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && traer()}
            className="w-28 rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs font-semibold text-tv-text outline-none focus:border-tv-blue"
          />
        </label>
        <button
          onClick={traer}
          disabled={cargando}
          className="flex items-center gap-1.5 rounded bg-tv-blue/20 px-3 py-1.5 text-xs font-medium text-tv-blue transition-colors hover:bg-tv-blue/30 disabled:opacity-50"
        >
          {cargando ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Traer cadena
        </button>

        {cadena && cadena.vencimientos.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
              Vencimiento
            </span>
            <select
              value={vencimiento}
              onChange={(e) => setVencimiento(e.target.value)}
              className="rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs text-tv-text outline-none focus:border-tv-blue"
            >
              {cadena.vencimientos.map((v) => (
                <option key={v} value={v}>
                  {v} · {diasHasta(v)} días
                </option>
              ))}
            </select>
          </label>
        )}

        {cadena && (
          <label className="flex items-center gap-1.5 pb-2 text-[11px] text-tv-text-muted">
            <input
              type="checkbox"
              checked={todos}
              onChange={(e) => setTodos(e.target.checked)}
              className="accent-tv-blue"
            />
            Ver todos los strikes
          </label>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded border border-tv-red/40 bg-tv-red/10 px-3 py-2 text-xs text-tv-text">
          <div className="font-semibold text-tv-red">
            {error.codigo === "falta_clave"
              ? "Falta configurar la clave de Alpaca"
              : "No se pudo traer la cadena"}
          </div>
          <div className="mt-0.5 text-tv-text-muted">{error.mensaje}</div>
          {error.codigo === "falta_clave" && (
            <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-tv-text-muted">
              <li>Creá tu cuenta en alpaca.markets y generá una API key.</li>
              <li>
                En la carpeta del proyecto, archivo{" "}
                <code className="text-tv-text">.env.local</code>:{" "}
                <code className="text-tv-text">ALPACA_KEY_ID=…</code> y{" "}
                <code className="text-tv-text">ALPACA_SECRET_KEY=…</code>
              </li>
              <li>
                En Vercel → Settings → Environment Variables, las mismas dos.
              </li>
            </ol>
          )}
        </div>
      )}

      {cadena && cadena.truncada && (
        <p className="mt-2 text-[11px] text-tv-yellow">
          Alpaca devolvió el máximo de 1000 contratos: puede faltar parte de la
          cadena. Elegí un vencimiento concreto para traerlo completo.
        </p>
      )}

      {cadena && filas.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-tv-text-muted">
                <th colSpan={6} className="border-b border-tv-border pb-1 text-left text-tv-green">
                  Calls
                </th>
                <th className="border-b border-tv-border pb-1 text-center">Strike</th>
                <th colSpan={6} className="border-b border-tv-border pb-1 text-right text-tv-red">
                  Puts
                </th>
              </tr>
              <tr className="text-[10px] uppercase tracking-wider text-tv-text-dim">
                <th className="px-1 py-1" />
                <th className="px-1 py-1 text-right">Delta</th>
                <th className="px-1 py-1 text-right">IV</th>
                <th className="px-1 py-1 text-right">Últ.</th>
                <th className="px-1 py-1 text-right">Bid</th>
                <th className="px-1 py-1 text-right">Ask</th>
                <th className="px-1 py-1 text-center" />
                <th className="px-1 py-1 text-right">Bid</th>
                <th className="px-1 py-1 text-right">Ask</th>
                <th className="px-1 py-1 text-right">Últ.</th>
                <th className="px-1 py-1 text-right">IV</th>
                <th className="px-1 py-1 text-right">Delta</th>
                <th className="px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const atm =
                  Math.abs(f.strike - s.S) ===
                  Math.min(...filas.map((x) => Math.abs(x.strike - s.S)));
                return (
                  <tr
                    key={f.strike}
                    className={cn(
                      "border-t border-tv-border/50",
                      atm && "bg-tv-blue/10",
                    )}
                  >
                    <LadoBotones contrato={f.call} alCargar={cargarEnCalculadora} alAgregar={agregarComoPata} />
                    <Celda v={f.call?.delta} dec={3} />
                    <Celda v={f.call?.iv} pct />
                    <Celda v={f.call?.ultimo} />
                    <Celda v={f.call?.bid} />
                    <Celda v={f.call?.ask} />
                    <td className="px-2 py-1 text-center font-semibold tabular-nums text-tv-text">
                      {f.strike.toFixed(2)}
                    </td>
                    <Celda v={f.put?.bid} />
                    <Celda v={f.put?.ask} />
                    <Celda v={f.put?.ultimo} />
                    <Celda v={f.put?.iv} pct />
                    <Celda v={f.put?.delta} dec={3} />
                    <LadoBotones contrato={f.put} alCargar={cargarEnCalculadora} alAgregar={agregarComoPata} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-tv-text-dim">
            Flecha: carga el contrato en la calculadora de arriba. Más: lo
            agrega como pata de la estrategia, comprado y al precio medio.
          </p>
        </div>
      )}
    </Tarjeta>
  );
}

function Celda({
  v,
  dec = 2,
  pct,
}: {
  v: number | null | undefined;
  dec?: number;
  pct?: boolean;
}) {
  return (
    <td className="px-1 py-1 text-right tabular-nums text-tv-text">
      {v === null || v === undefined
        ? <span className="text-tv-text-dim">—</span>
        : pct
          ? `${(v * 100).toFixed(1)}%`
          : v.toFixed(dec)}
    </td>
  );
}

function LadoBotones({
  contrato,
  alCargar,
  alAgregar,
}: {
  contrato?: Contrato;
  alCargar: (c: Contrato) => void;
  alAgregar: (c: Contrato) => void;
}) {
  if (!contrato) return <td className="px-1 py-1" />;
  return (
    <td className="whitespace-nowrap px-1 py-1">
      <button
        onClick={() => alCargar(contrato)}
        title="Cargar en la calculadora"
        className="rounded px-1 text-tv-text-dim transition-colors hover:text-tv-blue"
      >
        ↗
      </button>
      <button
        onClick={() => alAgregar(contrato)}
        title="Agregar como pata de la estrategia"
        className="rounded px-1 text-tv-text-dim transition-colors hover:text-tv-green"
      >
        <Plus className="inline h-3 w-3" />
      </button>
    </td>
  );
}
