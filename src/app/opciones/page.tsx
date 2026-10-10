"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CandlestickChart, Zap } from "lucide-react";
import { Calculadora } from "@/components/options/Calculadora";
import { MatrizSimulacion } from "@/components/options/MatrizSimulacion";
import { Estrategias } from "@/components/options/Estrategias";

export default function OpcionesPage() {
  // El estado se guarda en localStorage: si renderizáramos en el servidor con
  // los valores por defecto y después con los guardados, React se queja de
  // hidratación. `useSyncExternalStore` devuelve false en el servidor y true
  // en el cliente sin pasar por un efecto, así que no hay render en cascada.
  const montado = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-tv-bg">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-tv-border bg-tv-panel px-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-tv-blue/20">
            <Zap className="h-4 w-4 text-tv-blue" />
          </div>
          <span className="text-sm font-semibold text-tv-text">
            TradingView <span className="text-tv-text-muted">Gratis</span>
          </span>
          <nav className="ml-3 flex gap-0.5 rounded bg-tv-bg p-0.5">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-tv-text-muted transition-colors hover:text-tv-text"
            >
              <CandlestickChart className="h-3.5 w-3.5" />
              Cripto
            </Link>
            <span className="rounded bg-tv-panel-hover px-2.5 py-1 text-xs font-medium text-tv-text">
              Opciones
            </span>
          </nav>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
          {montado ? (
            <>
              <Calculadora />
              <MatrizSimulacion />
              <Estrategias />
              <section className="rounded-lg border border-dashed border-tv-border p-4">
                <h2 className="text-sm font-semibold text-tv-text">
                  Precios en vivo y cadena de opciones
                </h2>
                <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-tv-text-muted">
                  Todo lo de esta pantalla es cálculo propio y funciona sin
                  conexión a ningún proveedor: cargás los datos del contrato y
                  listo. Para que el strike, la prima y la volatilidad se llenen
                  solos desde el mercado hace falta un proveedor de datos de
                  opciones de EE. UU., que es dato licenciado. Decime por cuál
                  vamos y lo conecto: la clave tiene que vivir en el servidor,
                  así que suma una ruta de API en Vercel.
                </p>
              </section>
            </>
          ) : (
            <p className="text-xs text-tv-text-muted">Cargando…</p>
          )}
        </div>
      </main>
    </div>
  );
}
