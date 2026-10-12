"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  nombreLibre,
  sanearBacktests,
  type Backtest,
  type Operacion,
} from "@/lib/backtest/tipos";
import type { Timeframe } from "@/lib/binance/types";

/** Velocidades de reproducción, en velas por segundo. */
export const VELOCIDADES = [0.5, 1, 2, 5, 10, 25] as const;

/** Lo que se está configurando antes de crear un backtest. */
export interface Borrador {
  simbolo: string;
  /** Fecha de inicio en formato AAAA-MM-DD, como la escupe el input. */
  desde: string;
  temporalidad: Timeframe;
  capital: number;
}

export const BORRADOR_INICIAL: Borrador = {
  simbolo: "ALP:AAPL",
  desde: "",
  temporalidad: "1d",
  capital: 10000,
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
  setTemporalidad: (tf: Timeframe) => void;
  /** Enciende o apaga un indicador en el backtest abierto. */
  alternarIndicador: (clave: string) => void;
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
          operaciones: [],
          indicadores: [],
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
            tiempoActual: orig.desde,
            creado: Math.floor(Date.now() / 1000),
          };
          return { backtests: [copia, ...s.backtests].slice(0, 50), activoId: copia.id };
        }),

      setTiempo: (t) => set((s) => enActivo(s, (b) => ({ ...b, tiempoActual: t }))),

      setTemporalidad: (tf) =>
        // El reloj NO se mueve: cambiar de temporalidad es mirar el mismo
        // momento con otro detalle, no saltar en el tiempo.
        set((s) => enActivo(s, (b) => ({ ...b, temporalidad: tf }))),

      alternarIndicador: (clave) =>
        set((s) =>
          enActivo(s, (b) => {
            const puestos = b.indicadores ?? [];
            return {
              ...b,
              indicadores: puestos.includes(clave)
                ? puestos.filter((c) => c !== clave)
                : [...puestos, clave].slice(0, 8),
            };
          }),
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
