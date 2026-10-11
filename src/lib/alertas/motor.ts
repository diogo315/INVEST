/**
 * El valor que vigila cada alerta, calculado sobre las velas del activo.
 *
 * Separado de `tipos.ts` porque acá sí hacen falta los indicadores; la
 * comparación en sí (si cruzó o no) vive allá y se prueba sin navegador.
 */

import type { Candle } from "@/lib/binance/types";
import { ema, rsi, sma } from "@/lib/indicators";
import { supertrend } from "@/lib/indicators/nuevos";
import type { Alerta } from "./tipos";

/**
 * Los dos últimos valores de lo que vigila la alerta: el anterior y el
 * actual. Hacen falta los dos porque un cruce se define contra el valor
 * previo, no contra el nivel a secas.
 */
export function valoresDe(a: Alerta, velas: Candle[]): {
  anterior?: number;
  actual?: number;
} {
  if (velas.length < 2) return {};

  if (a.fuente === "precio") {
    return {
      anterior: velas[velas.length - 2].close,
      actual: velas[velas.length - 1].close,
    };
  }

  if (a.fuente === "rsi") {
    const r = rsi(velas, Math.max(2, a.periodo));
    return { anterior: r.at(-2)?.value, actual: r.at(-1)?.value };
  }

  if (a.fuente === "supertrend") {
    // +1 alcista, −1 bajista: así el "cruce de cero" es el cambio de lado.
    const s = supertrend(velas, 10, 3);
    const lado = (i: number) => {
      const p = s.at(i);
      return p ? (p.alcista ? 1 : -1) : undefined;
    };
    return { anterior: lado(-2), actual: lado(-1) };
  }

  // Cruce de medias: la diferencia entre la rápida y la lenta. Cruzar cero
  // hacia arriba es la rápida pasando por encima.
  const rapida = ema(velas, Math.max(1, a.periodo));
  const lenta = sma(velas, Math.max(1, a.periodo2));
  const porTiempo = new Map(lenta.map((p) => [p.time, p.value]));
  const dif: number[] = [];
  for (const p of rapida) {
    const l = porTiempo.get(p.time);
    if (l !== undefined) dif.push(p.value - l);
  }
  return { anterior: dif.at(-2), actual: dif.at(-1) };
}

/** Cuántas velas hace falta bajar para poder calcular la alerta. */
export function velasNecesarias(a: Alerta): number {
  if (a.fuente === "precio") return 5;
  if (a.fuente === "rsi") return Math.max(50, a.periodo * 5);
  if (a.fuente === "supertrend") return 100;
  return Math.max(100, a.periodo2 * 3);
}

/** Un pitido corto, sin archivo de audio: se genera en el momento. */
export function pitido(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    // Ataque y caída suaves: un cuadrado seco suena a error del sistema.
    vol.gain.setValueAtTime(0, ctx.currentTime);
    vol.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    // Sin audio disponible: la alerta igual queda en la lista.
  }
}

/** Notificación del navegador, si el usuario la permitió. */
export function notificar(titulo: string, cuerpo: string): void {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification(titulo, { body: cuerpo, tag: "tv-gratis-alerta" });
  } catch {
    // Algunos navegadores tiran si la página no está en primer plano.
  }
}

/** Pide permiso para notificar. Se llama al crear la primera alerta. */
export async function pedirPermiso(): Promise<boolean> {
  try {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}
