"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  nombreLibre,
  sanearBacktests,
  type Backtest,
  type Operacion,
  type PanelGrafico,
} from "@/lib/backtest/tipos";
import type { Timeframe } from "@/lib/binance/types";
import { otraTemporalidad } from "@/lib/backtest/multi";
import { ZONA_BACKTEST } from "@/lib/chart/timezone";
import {
  MAX_MEDIAS,
  mediasPorDefecto,
  type MediaMovil,
} from "@/lib/chart/medias";

/** Cuál de las dos gráficas. */
export type Panel = "a" | "b";

/** Velocidades de reproducción, en velas por segundo. */
export const VELOCIDADES = [0.5, 1, 2, 5, 10, 25] as const;

/** Lo que se está configurando antes de crear un backtest. */
export interface Borrador {
  simbolo: string;
  /** Fecha de inicio en formato AAAA-MM-DD, como la escupe el input. */
  desde: string;
  temporalidad: Timeframe;
  capital: number;
  /** Días de historia previa a la fecha de inicio. */
  historia: number;
}

/** Cuánta historia se puede pedir antes del arranque. */
export const HISTORIAS = [
  { dias: 90, etiqueta: "3 meses" },
  { dias: 180, etiqueta: "6 meses" },
  { dias: 365, etiqueta: "1 año" },
  { dias: 730, etiqueta: "2 años" },
  { dias: 1825, etiqueta: "5 años" },
] as const;

export const BORRADOR_INICIAL: Borrador = {
  simbolo: "ALP:AAPL",
  desde: "",
  temporalidad: "1d",
  capital: 10000,
  historia: 365,
};

interface Estado {
  backtests: Backtest[];
  /** El que está abierto en pantalla; null = pantalla de configuración. */
  activoId: string | null;
  borrador: Borrador;
  // Lo de abajo no se guarda: es el estado del reproductor.
  reproduciendo: boolean;
  velocidad: number;

  setBorrador: (parche: Partial<Borrador>) => void;
  crear: () => string | null;
  abrir: (id: string | null) => void;
  borrar: (id: string) => void;
  renombrar: (id: string, nombre: string) => void;
  duplicar: (id: string) => void;

  setTiempo: (t: number) => void;
  setTemporalidad: (tf: Timeframe, panel?: Panel) => void;
  /** Cambia la historia previa del backtest abierto (vuelve a bajar velas). */
  setHistoria: (dias: number) => void;
  /** Reemplaza la lista de medias móviles de una de las dos gráficas. */
  setMedias: (medias: MediaMovil[], panel?: Panel) => void;
  /** Enciende o apaga un indicador en una de las dos gráficas. */
  alternarIndicador: (clave: string, panel?: Panel) => void;
  /** Prende o apaga la segunda gráfica. */
  setSegunda: (on: boolean) => void;
  /** Elige cuál de las dos manda el reproductor. */
  setBase: (panel: Panel) => void;
  /** Cambia la zona horaria con la que se leen las fechas del backtest. */
  setZona: (tz: string) => void;
  /** Prende o apaga el freno automático en el punto de oro del Cipher B. */
  setPararEnOro: (v: boolean) => void;
  reproducir: (v: boolean) => void;
  setVelocidad: (v: number) => void;

  operar: (op: Omit<Operacion, "id">) => void;
  cerrar: (
    opId: string,
    precio: number,
    tiempo: number,
    motivo?: "manual" | "vencimiento",
  ) => void;
  /** Cierra de golpe lo que haya vencido. Devuelve cuántas cerró. */
  liquidarVencidas: (
    tiempo: number,
    intrinseco: (op: Operacion) => number,
  ) => void;
}

const id = () => Math.random().toString(36).slice(2, 10);

/** Aplica un cambio al backtest abierto, sin tocar los demás. */
function enActivo(
  estado: Estado,
  cambio: (bt: Backtest) => Backtest,
): Partial<Estado> {
  if (!estado.activoId) return {};
  return {
    backtests: estado.backtests.map((b) =>
      b.id === estado.activoId ? cambio(b) : b,
    ),
  };
}

/**
 * Aplica un cambio al panel que toque.
 *
 * El panel A vive en los campos de siempre del backtest (`temporalidad`,
 * `indicadores`, `medias`) y no en un objeto aparte: así todo lo que ya
 * estaba guardado sigue abriendo sin convertir nada.
 */
function enPanel(
  bt: Backtest,
  panel: Panel,
  cambio: (p: PanelGrafico) => PanelGrafico,
): Backtest {
  if (panel === "b") {
    if (!bt.panelB) return bt;
    return { ...bt, panelB: cambio(bt.panelB) };
  }
  const nuevo = cambio({
    temporalidad: bt.temporalidad,
    indicadores: bt.indicadores ?? [],
    medias: bt.medias ?? mediasPorDefecto(),
  });
  return {
    ...bt,
    temporalidad: nuevo.temporalidad,
    indicadores: nuevo.indicadores,
    medias: nuevo.medias,
  };
}

export const useBacktestStore = create<Estado>()(
  persist(
    (set, get) => ({
      backtests: [],
      activoId: null,
      borrador: BORRADOR_INICIAL,
      reproduciendo: false,
      velocidad: 2,

      setBorrador: (parche) =>
        set((s) => ({ borrador: { ...s.borrador, ...parche } })),

      crear: () => {
        const { borrador, backtests } = get();
        // Sin fecha no hay backtest: es el dato que lo define.
        const ms = Date.parse(`${borrador.desde}T00:00:00Z`);
        if (!borrador.desde || Number.isNaN(ms)) return null;
        const desde = Math.floor(ms / 1000);
        const nuevo: Backtest = {
          id: id(),
          nombre: nombreLibre(
            backtests.map((b) => b.nombre),
            `${borrador.simbolo.split(":")[1] ?? borrador.simbolo} ${borrador.desde}`,
          ),
          simbolo: borrador.simbolo,
          temporalidad: borrador.temporalidad,
          desde,
          capitalInicial: borrador.capital,
          historiaPrevia: borrador.historia,
          zonaHoraria: ZONA_BACKTEST,
          operaciones: [],
          indicadores: [],
          medias: mediasPorDefecto(),
          tiempoActual: desde,
          creado: Math.floor(Date.now() / 1000),
        };
        set({
          backtests: [nuevo, ...backtests].slice(0, 50),
          activoId: nuevo.id,
          reproduciendo: false,
        });
        return nuevo.id;
      },

      abrir: (activoId) => set({ activoId, reproduciendo: false }),

      borrar: (idBorrar) =>
        set((s) => ({
          backtests: s.backtests.filter((b) => b.id !== idBorrar),
          activoId: s.activoId === idBorrar ? null : s.activoId,
          reproduciendo: false,
        })),

      renombrar: (idRen, nombre) =>
        set((s) => ({
          backtests: s.backtests.map((b) =>
            b.id === idRen
              ? { ...b, nombre: nombre.trim().slice(0, 40) || b.nombre }
              : b,
          ),
        })),

      duplicar: (idDup) =>
        set((s) => {
          const orig = s.backtests.find((b) => b.id === idDup);
          if (!orig) return {};
          // Se copia la configuración, NO las operaciones: la gracia de
          // repetir un backtest es volver a decidir, no releer lo decidido.
          const copia: Backtest = {
            ...orig,
            id: id(),
            nombre: nombreLibre(s.backtests.map((b) => b.nombre), orig.nombre),
            operaciones: [],
            indicadores: [...(orig.indicadores ?? [])],
            medias: (orig.medias ?? mediasPorDefecto()).map((m) => ({ ...m })),
            tiempoActual: orig.desde,
            creado: Math.floor(Date.now() / 1000),
          };
          return { backtests: [copia, ...s.backtests].slice(0, 50), activoId: copia.id };
        }),

      setTiempo: (t) => set((s) => enActivo(s, (b) => ({ ...b, tiempoActual: t }))),

      setTemporalidad: (tf, panel = "a") =>
        // El reloj NO se mueve: cambiar de temporalidad es mirar el mismo
        // momento con otro detalle, no saltar en el tiempo.
        set((s) => enActivo(s, (b) => enPanel(b, panel, (p) => ({ ...p, temporalidad: tf })))),

      setHistoria: (dias) =>
        set((s) =>
          enActivo(s, (b) => ({
            ...b,
            historiaPrevia: Math.min(3650, Math.max(1, Math.round(dias))),
          })),
        ),

      setMedias: (medias, panel = "a") =>
        set((s) =>
          enActivo(s, (b) =>
            enPanel(b, panel, (p) => ({ ...p, medias: medias.slice(0, MAX_MEDIAS) })),
          ),
        ),

      alternarIndicador: (clave, panel = "a") =>
        set((s) =>
          enActivo(s, (b) =>
            enPanel(b, panel, (p) => {
              const puestos = p.indicadores ?? [];
              return {
                ...p,
                indicadores: puestos.includes(clave)
                  ? puestos.filter((c) => c !== clave)
                  : [...puestos, clave].slice(0, 8),
              };
            }),
          ),
        ),

      setSegunda: (on) =>
        set((s) =>
          enActivo(s, (b) => {
            if (!on) {
              // Al apagarla, el reproductor vuelve a la de la izquierda:
              // si quedara mandando una gráfica que no está, el paso del
              // play saldría de una temporalidad invisible.
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { panelB, base, ...resto } = b;
              return resto;
            }
            if (b.panelB) return b;
            return {
              ...b,
              panelB: {
                temporalidad: otraTemporalidad(b.temporalidad),
                indicadores: [...(b.indicadores ?? [])],
                medias: (b.medias ?? mediasPorDefecto()).map((m) => ({ ...m })),
              },
            };
          }),
        ),

      setZona: (tz) => set((s) => enActivo(s, (b) => ({ ...b, zonaHoraria: tz }))),

      setPararEnOro: (v) =>
        set((s) => enActivo(s, (b) => ({ ...b, pararEnOro: v }))),

      setBase: (panel) =>
        set((s) =>
          enActivo(s, (b) =>
            // Mandar desde una gráfica que no existe no es un estado
            // posible: sin segunda, la base es siempre la de la izquierda.
            panel === "b" && !b.panelB ? b : { ...b, base: panel },
          ),
        ),

      reproducir: (reproduciendo) => set({ reproduciendo }),
      setVelocidad: (velocidad) => set({ velocidad }),

      operar: (op) =>
        set((s) =>
          enActivo(s, (b) => ({
            ...b,
            operaciones: [...b.operaciones, { ...op, id: id() }].slice(0, 500),
          })),
        ),

      cerrar: (opId, precio, tiempo, motivo = "manual") =>
        set((s) =>
          enActivo(s, (b) => ({
            ...b,
            operaciones: b.operaciones.map((o) =>
              o.id === opId && o.precioSalida === undefined
                ? { ...o, precioSalida: precio, tiempoSalida: tiempo, motivo }
                : o,
            ),
          })),
        ),

      liquidarVencidas: (tiempo, intrinseco) =>
        set((s) =>
          enActivo(s, (b) => {
            let cambio = false;
            const operaciones = b.operaciones.map((o) => {
              const vencio =
                o.precioSalida === undefined &&
                o.instrumento !== "activo" &&
                o.vencimiento !== undefined &&
                o.vencimiento <= tiempo;
              if (!vencio) return o;
              cambio = true;
              return {
                ...o,
                precioSalida: intrinseco(o),
                tiempoSalida: o.vencimiento,
                motivo: "vencimiento" as const,
              };
            });
            return cambio ? { ...b, operaciones } : b;
          }),
        ),
    }),
    {
      name: "tv-gratis-backtest",
      partialize: (s) => ({
        backtests: s.backtests,
        activoId: s.activoId,
        borrador: s.borrador,
      }),
      merge: (persistido, actual) => {
        const p = (persistido ?? {}) as Partial<Estado>;
        const backtests = sanearBacktests(p.backtests);
        return {
          ...actual,
          ...p,
          backtests,
          activoId: backtests.some((b) => b.id === p.activoId)
            ? (p.activoId as string)
            : null,
          borrador: { ...BORRADOR_INICIAL, ...(p.borrador ?? {}) },
          // El reproductor siempre arranca quieto: nadie quiere volver y
          // encontrarse el backtest corriendo solo.
          reproduciendo: false,
          velocidad: actual.velocidad,
        };
      },
    },
  ),
);

/** El backtest abierto, o null. */
export function backtestActivo(s: Estado): Backtest | null {
  return s.backtests.find((b) => b.id === s.activoId) ?? null;
}
