"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Play, Square, TriangleAlert } from "lucide-react";
import { getAdapter, parseSymbol } from "@/lib/exchanges";
import { useChartStore } from "@/lib/store/chart-store";
import type { Candle, Timeframe } from "@/lib/binance/types";
import { CONFIG_POR_DEFECTO, type ConfigEstrategia } from "@/lib/estrategia/motor";
import {
  correrVarios,
  resumenGlobal,
  velasNecesarias,
  type Avance,
  type ResultadoActivo,
} from "@/lib/estrategia/corrida";
import { operacionesNecesarias, seSolapan } from "@/lib/estrategia/estadistica";
import { cn } from "@/lib/utils";

const TF_ENTRADA: Timeframe[] = ["5m", "1m"];
const MESES = [3, 6, 12, 24];

const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
const erres = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}R`;

export function VistaEstrategias() {
  const listas = useChartStore((s) => s.listas);
  const [tfEntrada, setTfEntrada] = useState<Timeframe>("5m");
  const [meses, setMeses] = useState(6);
  const [cfg, setCfg] = useState<ConfigEstrategia>(CONFIG_POR_DEFECTO);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [avance, setAvance] = useState<Avance | null>(null);
  const [resultados, setResultados] = useState<ResultadoActivo[] | null>(null);
  const corriendo = useRef(false);
  const [activo, setActivo] = useState(false);

  const todos = useMemo(() => {
    const vistos = new Set<string>();
    const out: Array<{ lista: string; simbolos: string[] }> = [];
    for (const l of listas) {
      const s = l.simbolos.filter((x) => !vistos.has(x));
      s.forEach((x) => vistos.add(x));
      if (s.length) out.push({ lista: l.nombre, simbolos: s });
    }
    return out;
  }, [listas]);

  const marcar = (s: string) =>
    setElegidos((p) => {
      const n = new Set(p);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });

  const traer = useCallback(
    async (simbolo: string, tf: Timeframe, limite: number): Promise<Candle[]> => {
      const { adapter, symbol } = getAdapter(simbolo);
      return adapter.fetchKlines(symbol, tf, limite);
    },
    [],
  );

  const correr = async () => {
    if (corriendo.current) return;
    const lista = [...elegidos];
    if (lista.length === 0) return;
    corriendo.current = true;
    setActivo(true);
    setResultados(null);
    const r = await correrVarios(
      lista, tfEntrada, meses, cfg, traer,
      (a) => setAvance(a),
      () => corriendo.current,
    );
    setResultados(r);
    setAvance(null);
    corriendo.current = false;
    setActivo(false);
  };

  const global = resultados ? resumenGlobal(resultados) : null;
  const ordenados = useMemo(
    () =>
      resultados
        ? [...resultados].sort((a, b) => b.resumen.esperanza - a.resumen.esperanza)
        : [],
    [resultados],
  );
  const mejor = ordenados.find((r) => r.resumen.n >= 2) ?? null;

  const velasPorActivo =
    velasNecesarias("4h", meses) +
    velasNecesarias("15m", meses) +
    velasNecesarias(tfEntrada, meses);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-5">
      <header className="space-y-2">
        <h1 className="text-lg font-semibold text-tv-text">
          Estrategia SMC de tres tiempos
        </h1>
        <p className="max-w-3xl text-xs leading-relaxed text-tv-text-muted">
          4H da el contexto: el precio vuelve a un desequilibrio alcista sin
          mitigar, después de barrer un máximo previo. 15M confirma con un
          cambio de carácter dentro de esa zona y deja un POI. La temporalidad
          fina entra cuando el precio vuelve a ese POI y rompe su último
          máximo. Parciales en el máximo previo de 15M, stop a breakeven, el
          resto a {cfg.rrObjetivo} erres.
        </p>
      </header>

      {/* ── la advertencia que más importa ─────────────────────────── */}
      <div className="flex gap-2.5 rounded border border-tv-yellow/40 bg-tv-yellow/5 p-3 text-[11px] leading-relaxed text-tv-text-muted">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-tv-yellow" />
        <div className="space-y-1.5">
          <p>
            <strong className="text-tv-yellow">Esto mide UNA codificación
            de la estrategia, no «la estrategia».</strong> Marcar el POI o
            decidir qué cuenta como barrido es discrecional: acá está
            congelado en las reglas de abajo, que podés mover.
          </p>
          <p>
            Dentro de cada vela se supone siempre lo peor: si tocó el stop y
            el objetivo, se cobra el stop. El resultado es una cota inferior.
          </p>
          <p>
            Y lo más importante: esta estrategia dispara poco. Con ganadoras
            de {cfg.rrObjetivo}R y perdedoras de 1R hacen falta más de cien
            operaciones para separar el resultado del azar. Por activo, en
            seis meses, no se llega — por eso cada fila lleva su margen de
            error y la tabla marca cuáles diferencias son ruido.
          </p>
        </div>
      </div>

      {/* ── configuración ──────────────────────────────────────────── */}
      <section className="grid gap-4 rounded border border-tv-border bg-tv-panel p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo titulo="Temporalidad de entrada">
          <div className="flex gap-1">
            {TF_ENTRADA.map((t) => (
              <Boton key={t} activo={t === tfEntrada} onClick={() => setTfEntrada(t)}>
                {t}
              </Boton>
            ))}
          </div>
          <Nota>
            {tfEntrada === "1m"
              ? "Fiel a la foto, pero son ~260 peticiones por activo."
              : "Cinco veces menos datos. Buena para la primera pasada."}
          </Nota>
        </Campo>

        <Campo titulo="Ventana">
          <div className="flex gap-1">
            {MESES.map((m) => (
              <Boton key={m} activo={m === meses} onClick={() => setMeses(m)}>
                {m} m
              </Boton>
            ))}
          </div>
          <Nota>~{velasPorActivo.toLocaleString("es")} velas por activo.</Nota>
        </Campo>

        <Campo titulo="Costos (ida y vuelta)">
          <div className="flex items-center gap-2">
            <Numero
              valor={cfg.comision}
              onCambiar={(v) => setCfg({ ...cfg, comision: v })}
              sufijo="% com."
            />
            <Numero
              valor={cfg.spread}
              onCambiar={(v) => setCfg({ ...cfg, spread: v })}
              sufijo="% spread"
            />
          </div>
          <Nota>
            Con stops chicos esto decide el resultado. Ponelo en 0 para ver
            cuánto se come.
          </Nota>
        </Campo>

        <Campo titulo="Reglas discrecionales">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-[11px] text-tv-text-muted">
              <input
                type="checkbox"
                checked={cfg.exigirBarrido}
                onChange={(e) => setCfg({ ...cfg, exigirBarrido: e.target.checked })}
                className="accent-tv-blue"
              />
              Exigir barrido del máximo previo
            </label>
            <div className="flex gap-1">
              {(["vela", "hueco"] as const).map((p) => (
                <Boton key={p} activo={cfg.poi === p} onClick={() => setCfg({ ...cfg, poi: p })}>
                  POI: {p === "vela" ? "order block" : "desequilibrio"}
                </Boton>
              ))}
            </div>
          </div>
        </Campo>
      </section>

      {/* ── activos ────────────────────────────────────────────────── */}
      <section className="space-y-2 rounded border border-tv-border bg-tv-panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-tv-text-muted">
            Activos
          </h2>
          <span className="text-[11px] text-tv-text-dim">
            {elegidos.size} elegidos
          </span>
          <div className="ml-auto flex gap-1">
            <Boton
              activo={false}
              onClick={() => setElegidos(new Set(todos.flatMap((g) => g.simbolos)))}
            >
              Todos
            </Boton>
            <Boton activo={false} onClick={() => setElegidos(new Set())}>
              Ninguno
            </Boton>
          </div>
        </div>
        {todos.map((g) => (
          <div key={g.lista} className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-tv-text-dim">
              {g.lista}
            </p>
            <div className="flex flex-wrap gap-1">
              {g.simbolos.map((s) => (
                <button
                  key={s}
                  onClick={() => marcar(s)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] transition-colors",
                    elegidos.has(s)
                      ? "bg-tv-blue text-white"
                      : "bg-tv-bg text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
                  )}
                >
                  {parseSymbol(s).symbol}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── correr ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={activo ? () => { corriendo.current = false; } : correr}
          disabled={!activo && elegidos.size === 0}
          className={cn(
            "flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            activo ? "bg-tv-red" : "bg-tv-blue",
          )}
        >
          {activo ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {activo ? "Parar" : `Correr sobre ${elegidos.size || "…"}`}
        </button>
        {avance && (
          <span className="font-mono text-[11px] text-tv-text-muted">
            {avance.hecho}/{avance.total} · {parseSymbol(avance.simbolo).symbol} ·{" "}
            {avance.paso === "bajando" ? "bajando velas…" : "calculando…"}
          </span>
        )}
      </div>

      {/* ── resultados ─────────────────────────────────────────────── */}
      {global && (
        <section className="space-y-3">
          <div className="grid gap-3 rounded border border-tv-border bg-tv-panel p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Dato nombre="Operaciones" valor={String(global.n)} />
            <Dato
              nombre="Aciertos"
              valor={pct(global.aciertos)}
              nota={`${pct(global.aciertosIC[0])} a ${pct(global.aciertosIC[1])}`}
            />
            <Dato
              nombre="Por operación"
              valor={erres(global.esperanza)}
              nota={
                Number.isFinite(global.esperanzaIC[0])
                  ? `${erres(global.esperanzaIC[0])} a ${erres(global.esperanzaIC[1])}`
                  : "sin margen calculable"
              }
              tono={global.esperanza > 0 ? "verde" : "rojo"}
            />
            <Dato
              nombre="Caída máxima"
              valor={`${global.caidaMaxima.toFixed(1)}R`}
              nota={`factor ${Number.isFinite(global.factor) ? global.factor.toFixed(2) : "—"}`}
            />
          </div>

          <div
            className={cn(
              "rounded border p-3 text-[11px] leading-relaxed",
              global.concluyente
                ? "border-tv-green/40 bg-tv-green/5 text-tv-text-muted"
                : "border-tv-border bg-tv-bg text-tv-text-muted",
            )}
          >
            {global.concluyente ? (
              <>
                <strong className="text-tv-green">Hay ventaja medible.</strong>{" "}
                Con {global.n} operaciones, el intervalo de la esperanza queda
                entero por encima de cero ({erres(global.esperanzaIC[0])} a{" "}
                {erres(global.esperanzaIC[1])}). Eso no garantiza nada hacia
                adelante, pero sobre estos datos y con estos costos, el
                resultado no se explica por azar.
              </>
            ) : (
              <>
                <strong className="text-tv-text">
                  Con estos datos no se puede concluir que haya ventaja.
                </strong>{" "}
                {global.n} operaciones dan un intervalo de{" "}
                {Number.isFinite(global.esperanzaIC[0])
                  ? `${erres(global.esperanzaIC[0])} a ${erres(global.esperanzaIC[1])}`
                  : "ancho indefinido"}
                , que cruza el cero.{" "}
                {operacionesNecesarias(global)
                  ? `Harían falta alrededor de ${operacionesNecesarias(global)} operaciones para separarlo del azar: alargá la ventana o sumá activos.`
                  : "La esperanza es negativa sobre esta muestra."}
              </>
            )}
          </div>

          <div className="overflow-x-auto rounded border border-tv-border">
            <table className="w-full text-[11px]">
              <thead className="bg-tv-panel text-tv-text-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Activo</th>
                  <th className="px-2 py-1.5 text-right font-medium">Ops.</th>
                  <th className="px-2 py-1.5 text-right font-medium">Aciertos</th>
                  <th className="px-2 py-1.5 text-right font-medium">Por op.</th>
                  <th className="px-2 py-1.5 text-right font-medium">Margen 95 %</th>
                  <th className="px-2 py-1.5 text-right font-medium">Total</th>
                  <th className="px-2 py-1.5 text-left font-medium">Qué se puede decir</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((r) => {
                  const s = r.resumen;
                  const ruido = mejor && r !== mejor && s.n >= 2 && seSolapan(s, mejor.resumen);
                  return (
                    <tr key={r.simbolo} className="border-t border-tv-border/60">
                      <td className="px-2 py-1.5 text-tv-text">
                        {parseSymbol(r.simbolo).symbol}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-tv-text-muted">
                        {s.n}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-tv-text-muted">
                        {s.n ? pct(s.aciertos) : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right tabular-nums",
                          s.n === 0 ? "text-tv-text-dim"
                            : s.esperanza > 0 ? "text-tv-green" : "text-tv-red",
                        )}
                      >
                        {s.n ? erres(s.esperanza) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-tv-text-dim">
                        {s.n >= 2 && Number.isFinite(s.esperanzaIC[0])
                          ? `${erres(s.esperanzaIC[0])} … ${erres(s.esperanzaIC[1])}`
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-tv-text-muted">
                        {s.n ? `${s.erresTotal.toFixed(1)}R` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-tv-text-dim">
                        {r.error
                          ? r.error
                          : s.n === 0
                            ? "Nunca se dio el montaje"
                            : s.concluyente
                              ? "Ventaja medible"
                              : ruido
                                ? "No se distingue del mejor: es ruido"
                                : "Muestra insuficiente para concluir"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] leading-relaxed text-tv-text-dim">
            La columna «margen 95 %» es el rango donde razonablemente está el
            verdadero resultado por operación. Si el margen de dos activos se
            pisa, la diferencia entre ellos no se puede afirmar por más
            distinta que parezca la columna del medio.
          </p>
        </section>
      )}
    </div>
  );
}

function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider text-tv-text-muted">{titulo}</p>
      {children}
    </div>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] leading-relaxed text-tv-text-dim">{children}</p>;
}

function Boton({
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
      onClick={onClick}
      className={cn(
        "rounded px-2 py-1 text-[11px] transition-colors",
        activo
          ? "bg-tv-blue text-white"
          : "bg-tv-bg text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
      )}
    >
      {children}
    </button>
  );
}

function Numero({
  valor,
  onCambiar,
  sufijo,
}: {
  valor: number;
  onCambiar: (v: number) => void;
  sufijo: string;
}) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-tv-text-dim">
      <input
        type="number"
        step={0.01}
        min={0}
        value={valor}
        onChange={(e) => onCambiar(Math.max(0, Number(e.target.value) || 0))}
        className="w-14 rounded border border-tv-border bg-tv-bg px-1 py-0.5 text-[11px] tabular-nums text-tv-text"
      />
      {sufijo}
    </label>
  );
}

function Dato({
  nombre,
  valor,
  nota,
  tono,
}: {
  nombre: string;
  valor: string;
  nota?: string;
  tono?: "verde" | "rojo";
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-tv-text-muted">{nombre}</p>
      <p
        className={cn(
          "font-mono text-lg tabular-nums",
          tono === "verde" ? "text-tv-green" : tono === "rojo" ? "text-tv-red" : "text-tv-text",
        )}
      >
        {valor}
      </p>
      {nota && <p className="text-[10px] tabular-nums text-tv-text-dim">{nota}</p>}
    </div>
  );
}
