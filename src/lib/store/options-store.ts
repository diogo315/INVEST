"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Pata, TipoOpcion } from "@/lib/options/black-scholes";

export interface EstadoOpciones {
  // ── Calculadora ──────────────────────────────────────────────────────
  /** Símbolo del subyacente, solo como etiqueta por ahora. */
  simbolo: string;
  /** Precio del subyacente. */
  S: number;
  K: number;
  /** Días calendario al vencimiento. */
  dias: number;
  /** Volatilidad implícita en PUNTOS de porcentaje (30 = 30 %). */
  volPct: number;
  /** Tasa libre de riesgo en puntos de porcentaje. */
  tasaPct: number;
  /** Dividendo anual en puntos de porcentaje. */
  divPct: number;
  tipo: TipoOpcion;
  /** Precio de mercado para despejar la volatilidad implícita. */
  precioMercado: number;

  // ── Matriz de simulación ─────────────────────────────────────────────
  /** Rango del subyacente a simular, en % alrededor del precio actual. */
  rangoPct: number;

  // ── Estrategia ───────────────────────────────────────────────────────
  patas: Pata[];

  setCampo: <K extends keyof EstadoOpciones>(
    campo: K,
    valor: EstadoOpciones[K],
  ) => void;
  agregarPata: (p: Pata) => void;
  actualizarPata: (id: string, patch: Partial<Pata>) => void;
  quitarPata: (id: string) => void;
  limpiarPatas: () => void;
}

export const MULTIPLICADOR_EEUU = 100;

const PATAS_EJEMPLO: Pata[] = [
  {
    id: "ej-1",
    tipo: "call",
    lado: "compra",
    cantidad: 1,
    multiplicador: MULTIPLICADOR_EEUU,
    strike: 260,
    prima: 6.4,
    dias: 30,
    vol: 0.28,
    activa: true,
  },
  {
    id: "ej-2",
    tipo: "call",
    lado: "venta",
    cantidad: 1,
    multiplicador: MULTIPLICADOR_EEUU,
    strike: 275,
    prima: 2.1,
    dias: 30,
    vol: 0.26,
    activa: true,
  },
];

export const useOptionsStore = create<EstadoOpciones>()(
  persist(
    (set) => ({
      simbolo: "AAPL",
      S: 250.5,
      K: 255,
      dias: 30,
      volPct: 28,
      tasaPct: 4.25,
      divPct: 0.6,
      tipo: "call",
      precioMercado: 7.5,
      rangoPct: 20,
      patas: PATAS_EJEMPLO,

      setCampo: (campo, valor) => set({ [campo]: valor } as Partial<EstadoOpciones>),
      agregarPata: (p) => set((s) => ({ patas: [...s.patas, p] })),
      actualizarPata: (id, patch) =>
        set((s) => ({
          patas: s.patas.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      quitarPata: (id) => set((s) => ({ patas: s.patas.filter((p) => p.id !== id) })),
      limpiarPatas: () => set({ patas: [] }),
    }),
    { name: "tv-gratis-opciones" },
  ),
);
