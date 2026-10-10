"use client";

import { cn } from "@/lib/utils";

export function Tarjeta({
  titulo,
  subtitulo,
  children,
  className,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-tv-border bg-tv-panel p-4",
        className,
      )}
    >
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-tv-text">{titulo}</h2>
        {subtitulo && (
          <p className="mt-0.5 text-[11px] leading-snug text-tv-text-muted">
            {subtitulo}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

/** Campo numérico compacto, con sufijo opcional ($, %, días…). */
export function Campo({
  etiqueta,
  valor,
  onChange,
  sufijo,
  paso = 1,
  min,
  max,
  ancho = "w-full",
}: {
  etiqueta: string;
  valor: number;
  onChange: (n: number) => void;
  sufijo?: string;
  paso?: number;
  min?: number;
  max?: number;
  ancho?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1", ancho)}>
      <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
        {etiqueta}
      </span>
      <span className="relative flex items-center">
        <input
          type="number"
          inputMode="decimal"
          step={paso}
          min={min}
          max={max}
          value={Number.isFinite(valor) ? valor : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className={cn(
            "w-full rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs tabular-nums text-tv-text",
            "outline-none focus:border-tv-blue",
            sufijo && "pr-7",
          )}
        />
        {sufijo && (
          <span className="pointer-events-none absolute right-2 text-[10px] text-tv-text-dim">
            {sufijo}
          </span>
        )}
      </span>
    </label>
  );
}

export function CampoTexto({
  etiqueta,
  valor,
  onChange,
  ancho = "w-full",
}: {
  etiqueta: string;
  valor: string;
  onChange: (s: string) => void;
  ancho?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1", ancho)}>
      <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
        {etiqueta}
      </span>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="rounded border border-tv-border bg-tv-bg px-2 py-1.5 text-xs font-semibold text-tv-text outline-none focus:border-tv-blue"
      />
    </label>
  );
}

/** Interruptor de dos (o más) opciones. */
export function Segmentado<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta?: string;
  valor: T;
  opciones: Array<{ valor: T; texto: string; color?: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {etiqueta && (
        <span className="text-[10px] uppercase tracking-wider text-tv-text-muted">
          {etiqueta}
        </span>
      )}
      <div className="flex gap-0.5 rounded bg-tv-bg p-0.5">
        {opciones.map((o) => (
          <button
            key={o.valor}
            onClick={() => onChange(o.valor)}
            className={cn(
              "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors",
              valor === o.valor
                ? "bg-tv-panel-hover text-tv-text"
                : "text-tv-text-muted hover:text-tv-text",
            )}
            style={valor === o.valor && o.color ? { color: o.color } : undefined}
          >
            {o.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Una griega: valor grande + qué significa en una línea. */
export function Dato({
  nombre,
  valor,
  explicacion,
  destacado,
}: {
  nombre: string;
  valor: string;
  explicacion?: string;
  destacado?: boolean;
}) {
  return (
    <div className="rounded border border-tv-border bg-tv-bg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-tv-text-muted">
        {nombre}
      </div>
      <div
        className={cn(
          "tabular-nums",
          destacado ? "text-lg font-semibold text-tv-text" : "text-sm text-tv-text",
        )}
      >
        {valor}
      </div>
      {explicacion && (
        <div className="mt-0.5 text-[10px] leading-tight text-tv-text-dim">
          {explicacion}
        </div>
      )}
    </div>
  );
}

export const money = (n: number, dec = 2) =>
  (n < 0 ? "−$" : "$") +
  Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });

export const num = (n: number, dec = 4) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
