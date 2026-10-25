"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";

/**
 * La red de seguridad del backtesting.
 *
 * Next.js monta esto solo cuando algo revienta dentro de la ruta. Está
 * acá por una razón concreta: a Diego se le murió la pestaña con un
 * «This page couldn't load» y no quedó rastro de qué pasó. Una página en
 * blanco no se puede depurar; un mensaje con el error, sí.
 *
 * Las dos salidas importan tanto como el mensaje:
 *
 * - REINTENTAR, por si fue algo de una vez.
 * - EMPEZAR DE CERO, que borra el backtest abierto y SOLO ese. Si lo que
 *   revienta es el estado guardado de una corrida, recargar no arregla
 *   nada: vuelve a cargar lo mismo y vuelve a reventar. Pero borrarlo
 *   todo tampoco: se perderían las demás corridas. Por eso quita el
 *   activo y deja el resto.
 */
export default function ErrorBacktesting({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  /**
   * ¿Es un trozo de JavaScript que ya no existe?
   *
   * Pasa siempre que se publica una versión nueva con la página abierta:
   * el navegador tiene en memoria los nombres de los archivos del build
   * anterior, que acaban de desaparecer del servidor. Al pedir el
   * siguiente, 404, y la página se muere sin explicar nada. Es, con
   * diferencia, la causa más común de un «no se pudo cargar la página»
   * justo después de desplegar.
   */
  const esTrozoViejo =
    error.name === "ChunkLoadError" ||
    /Loading chunk|Failed to load chunk|dynamically imported module/i.test(
      error.message ?? "",
    );

  useEffect(() => {
    // Queda en la consola completo, con la pila, para poder leerlo si
    // el usuario abre las herramientas de desarrollo.
    console.error("[backtesting] error no controlado:", error);
  }, [error]);

  useEffect(() => {
    if (!esTrozoViejo) return;
    // Se recarga sola, UNA vez. La marca en sessionStorage es lo que
    // impide el bucle: si tras recargar vuelve a fallar, ya no es un
    // despliegue nuevo y hay que enseñar el error en vez de recargar
    // para siempre.
    const marca = "bt-recarga-por-trozo";
    try {
      if (sessionStorage.getItem(marca)) return;
      sessionStorage.setItem(marca, "1");
    } catch {
      return;   // sin sessionStorage no se puede evitar el bucle: mejor no recargar
    }
    location.reload();
  }, [esTrozoViejo]);

  const detalle = [
    error.message,
    error.digest ? `digest: ${error.digest}` : "",
    error.stack?.split("\n").slice(0, 6).join("\n") ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-4 rounded-lg border border-tv-border bg-tv-panel p-5">
        <div className="flex items-center gap-2 text-tv-yellow">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <h2 className="text-sm font-semibold">
            Se rompió algo en el backtesting
          </h2>
        </div>

        <p className="text-xs leading-relaxed text-tv-text-muted">
          {esTrozoViejo ? (
            <>
              Parece que se publicó una versión nueva mientras tenías esta
              página abierta, así que el navegador quedó pidiendo archivos
              que ya no existen. Se recarga sola; si seguís viendo esto,
              recargá a mano con <strong>Ctrl+F5</strong>.
            </>
          ) : (
            <>
              Tus backtests guardados no se tocaron. Abajo está el error tal
              cual: si lo copiás y me lo pasás, se puede arreglar de verdad
              en vez de adivinar.
            </>
          )}
        </p>

        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-tv-border bg-tv-bg p-2 font-mono text-[10px] leading-relaxed text-tv-text-muted">
          {detalle || "(el error no trae mensaje)"}
        </pre>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded bg-tv-blue px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reintentar
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(detalle).then(
                () => setCopiado(true),
                () => setCopiado(false),
              );
            }}
            className="rounded border border-tv-border px-3 py-1.5 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
          >
            {copiado ? "Copiado" : "Copiar el error"}
          </button>
          <button
            onClick={() => {
              // Solo el backtest ABIERTO. Si el estado guardado de esa
              // corrida es lo que revienta, recargar no sirve: vuelve a
              // cargar lo mismo. Y borrar todo sería peor que el problema.
              try {
                const clave = "tv-gratis-backtest";
                const crudo = localStorage.getItem(clave);
                if (crudo) {
                  const g = JSON.parse(crudo);
                  const id = g?.state?.activoId;
                  if (g?.state) {
                    g.state.activoId = null;
                    if (Array.isArray(g.state.backtests) && id) {
                      g.state.backtests = g.state.backtests.filter(
                        (b: { id?: string }) => b?.id !== id,
                      );
                    }
                    localStorage.setItem(clave, JSON.stringify(g));
                  }
                }
              } catch {
                // Si ni siquiera se puede leer lo guardado, se recarga
                // igual: peor que estar roto no se va a poner.
              }
              location.reload();
            }}
            title="Cierra y borra SOLO el backtest que estaba abierto; los demás quedan"
            className="ml-auto flex items-center gap-1.5 rounded border border-tv-red/40 px-3 py-1.5 text-xs text-tv-red hover:bg-tv-red/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Descartar este backtest
          </button>
        </div>
      </div>
    </div>
  );
}
