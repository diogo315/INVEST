"use client";

import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { griegasBS, intrinseco } from "@/lib/options/black-scholes";
import { MULTIPLICADOR_EEUU, useOptionsStore } from "@/lib/store/options-store";
import { Campo, Dato, Tarjeta, money, num } from "./ui";
import { cn } from "@/lib/utils";

/** Escenarios de un clic, para no tener que escribirlos a mano. */
const ATAJOS: Array<{ texto: string; dS: number; dias: number; dVol: number }> = [
  { texto: "+5 %", dS: 5, dias: 0, dVol: 0 },
  { texto: "+10 %", dS: 10, dias: 0, dVol: 0 },
  { texto: "−5 %", dS: -5, dias: 0, dVol: 0 },
  { texto: "−10 %", dS: -10, dias: 0, dVol: 0 },
  { texto: "Una semana", dS: 0, dias: 7, dVol: 0 },
  { texto: "Al vencimiento", dS: 0, dias: -1, dVol: 0 },
  { texto: "Vol +10 pts", dS: 0, dias: 0, dVol: 10 },
  { texto: "Vol −10 pts", dS: 0, dias: 0, dVol: -10 },
];

/**
 * Simula la operación, no el contrato: cuántos contratos, a qué precio
 * entraste, y cuánta plata ganás o perdés si el subyacente llega a tal
 * precio en tantos días con tal volatilidad.
 *
 * La calculadora de arriba responde "cuánto vale"; esto responde "cuánto
 * gano", que es la pregunta con la que uno abre una posición.
 */
export function Operacion() {
  const s = useOptionsStore();

  const invertido = Math.abs(s.contratos) * s.entrada * MULTIPLICADOR_EEUU;
  const vendida = s.contratos < 0;

  /** Valor del contrato hoy y en el escenario. */
  const { hoy, escenario, g } = useMemo(() => {
    const base = {
      S: s.S,
      K: s.K,
      r: s.tasaPct / 100,
      q: s.divPct / 100,
      tipo: s.tipo,
    };
    const hoy = griegasBS({ ...base, T: s.dias / 365, sigma: s.volPct / 100 });
    const diasRestantes = Math.max(0, s.dias - s.objetivoDias);
    const paramsEsc = {
      ...base,
      S: s.objetivoS,
      T: diasRestantes / 365,
      sigma: s.objetivoVolPct / 100,
    };
    // Al vencimiento ya no hay valor temporal: vale lo intrínseco y nada más.
    const precio =
      diasRestantes <= 0
        ? intrinseco(s.objetivoS, s.K, s.tipo)
        : griegasBS(paramsEsc).precio;
    return {
      hoy,
      escenario: { precio, diasRestantes },
      g: diasRestantes <= 0 ? null : griegasBS(paramsEsc),
    };
  }, [
    s.S,
    s.K,
    s.dias,
    s.tasaPct,
    s.divPct,
    s.volPct,
    s.tipo,
    s.objetivoS,
    s.objetivoDias,
    s.objetivoVolPct,
  ]);

  /** Resultado en dólares: lo que vale menos lo que costó, por contrato. */
  const resultado =
    (escenario.precio - s.entrada) * s.contratos * MULTIPLICADOR_EEUU;
  const resultadoHoy = (hoy.precio - s.entrada) * s.contratos * MULTIPLICADOR_EEUU;
  const sobreInvertido = invertido === 0 ? 0 : (resultado / invertido) * 100;

  /** A qué precio del subyacente la operación no gana ni pierde. */
  const equilibrio =
    s.tipo === "call" ? s.K + s.entrada : s.K - s.entrada;

  const aplicar = (a: (typeof ATAJOS)[number]) => {
    if (a.dS) s.setCampo("objetivoS", Number((s.S * (1 + a.dS / 100)).toFixed(2)));
    if (a.dias === -1) s.setCampo("objetivoDias", s.dias);
    else if (a.dias) s.setCampo("objetivoDias", Math.min(s.dias, s.objetivoDias + a.dias));
    if (a.dVol)
      s.setCampo("objetivoVolPct", Math.max(1, s.objetivoVolPct + a.dVol));
  };

  const verde = resultado > 0.005;
  const rojo = resultado < -0.005;

  return (
    <Tarjeta
      titulo="Simular la operación"
      subtitulo="Cuántos contratos, a qué precio entrás, y cuánta plata deja la posición si el subyacente llega a tal precio en tantos días. El vencimiento usa solo el valor intrínseco."
    >
      {/* Qué contrato se está simulando, de un vistazo: los campos están
          arriba en la calculadora y desde acá no se ven. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded bg-tv-panel-hover px-2 py-1 font-medium text-tv-text">
          {s.simbolo} · {s.tipo === "call" ? "Call" : "Put"} {s.K}
        </span>
        <span className="text-tv-text-muted">
          vence en {s.dias} día{s.dias === 1 ? "" : "s"} · subyacente en{" "}
          {money(s.S)} · volatilidad {s.volPct}%
        </span>
        <span className="text-tv-text-dim">
          (se cambia arriba, en la calculadora)
        </span>
      </div>

      {/* ── la posición ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Campo
          etiqueta="Contratos"
          valor={s.contratos}
          onChange={(v) => s.setCampo("contratos", Math.round(v) || 1)}
          paso={1}
        />
        <Campo
          etiqueta="Precio de entrada"
          valor={s.entrada}
          onChange={(v) => s.setCampo("entrada", Math.max(0, v))}
          paso={0.05}
          sufijo="$"
        />
        <Dato
          nombre={vendida ? "Prima cobrada" : "Lo que ponés"}
          valor={money(invertido, 0)}
          explicacion={`${Math.abs(s.contratos)} contrato${Math.abs(s.contratos) === 1 ? "" : "s"} × ${money(s.entrada)} × ${MULTIPLICADOR_EEUU}`}
        />
        <Dato
          nombre="Punto de equilibrio"
          valor={money(equilibrio)}
          explicacion={`El subyacente tiene que ${s.tipo === "call" ? "pasar" : "bajar"} de ahí al vencimiento`}
        />
      </div>

      {/* ── el escenario ─────────────────────────────────────────────── */}
      <div className="mt-4 rounded border border-tv-border bg-tv-bg p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-dim">
            ¿Qué pasa si…?
          </span>
          <button
            onClick={s.reiniciarEscenario}
            title="Volver el escenario a como está hoy"
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            <RotateCcw className="h-3 w-3" /> Como hoy
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Campo
            etiqueta={`${s.simbolo} llega a`}
            valor={s.objetivoS}
            onChange={(v) => s.setCampo("objetivoS", Math.max(0.01, v))}
            paso={0.5}
            sufijo="$"
          />
          <Campo
            etiqueta="Días que pasan"
            valor={s.objetivoDias}
            onChange={(v) =>
              s.setCampo("objetivoDias", Math.min(s.dias, Math.max(0, Math.round(v))))
            }
            min={0}
            max={s.dias}
          />
          <Campo
            etiqueta="Volatilidad"
            valor={s.objetivoVolPct}
            onChange={(v) => s.setCampo("objetivoVolPct", Math.max(1, v))}
            paso={1}
            sufijo="%"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {ATAJOS.map((a) => (
            <button
              key={a.texto}
              onClick={() => aplicar(a)}
              className="rounded border border-tv-border px-2 py-1 text-[11px] text-tv-text-muted transition-colors hover:bg-tv-panel-hover hover:text-tv-text"
            >
              {a.texto}
            </button>
          ))}
        </div>
      </div>

      {/* ── el resultado ─────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div
          className={cn(
            "rounded border p-3",
            verde
              ? "border-tv-green/40 bg-tv-green/10"
              : rojo
                ? "border-tv-red/40 bg-tv-red/10"
                : "border-tv-border bg-tv-bg",
          )}
        >
          <div className="text-[10px] uppercase tracking-wider text-tv-text-muted">
            Resultado de la operación
          </div>
          <div
            className={cn(
              "text-2xl font-semibold tabular-nums",
              verde ? "text-tv-green" : rojo ? "text-tv-red" : "text-tv-text",
            )}
          >
            {resultado >= 0 ? "+" : "−"}
            {money(Math.abs(resultado), 0)}
          </div>
          <div className="mt-0.5 text-[11px] text-tv-text-muted">
            {sobreInvertido >= 0 ? "+" : "−"}
            {Math.abs(sobreInvertido).toFixed(1)} % sobre lo que{" "}
            {vendida ? "cobraste" : "pusiste"} · el contrato pasa de{" "}
            {money(s.entrada)} a {money(escenario.precio)}
          </div>
        </div>

        <Dato
          nombre="Si vendés hoy"
          valor={`${resultadoHoy >= 0 ? "+" : "−"}${money(Math.abs(resultadoHoy), 0)}`}
          explicacion={`Vale ${money(hoy.precio)} contra los ${money(s.entrada)} que pagaste`}
        />
        <Dato
          nombre="Le quedan"
          valor={
            escenario.diasRestantes <= 0
              ? "vencida"
              : `${escenario.diasRestantes} día${escenario.diasRestantes === 1 ? "" : "s"}`
          }
          explicacion={
            escenario.diasRestantes <= 0
              ? "Al vencimiento solo queda el valor intrínseco"
              : `De los ${s.dias} días del contrato`
          }
        />
      </div>

      {/* ── las griegas en ese escenario ─────────────────────────────── */}
      {g && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-5">
          {(
            [
              ["Delta", num(g.delta, 4), num(hoy.delta, 4)],
              ["Gamma", num(g.gamma, 5), num(hoy.gamma, 5)],
              ["Theta", money(g.theta), money(hoy.theta)],
              ["Vega", money(g.vega), money(hoy.vega)],
              ["Rho", money(g.rho), money(hoy.rho)],
            ] as const
          ).map(([nombre, enEsc, enHoy]) => (
            <div
              key={nombre}
              className="rounded border border-tv-border bg-tv-bg px-2 py-1.5"
            >
              <div className="text-[9px] uppercase tracking-wider text-tv-text-muted">
                {nombre} en el escenario
              </div>
              <div className="tabular-nums text-tv-text">{enEsc}</div>
              <div className="text-[10px] tabular-nums text-tv-text-dim">
                hoy {enHoy}
              </div>
            </div>
          ))}
        </div>
      )}
    </Tarjeta>
  );
}
