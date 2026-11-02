/**
 * Qué partes del SMC se ven, y de qué color.
 *
 * Separado del motor a propósito: el motor calcula SIEMPRE todo, y acá
 * se decide qué se dibuja. Si apagar un dibujo cambiara los cálculos,
 * dos backtests con los mismos ajustes de estrategia darían resultados
 * distintos según cómo quedó una casilla.
 *
 * Basado en "Smart Money Concepts (SMC)" © LuxAlgo, CC BY-NC-SA 4.0.
 */

export type ModoSMC = "historico" | "presente";
export type EstiloSMC = "color" | "mono";
export type QueEstructura = "todo" | "soloBOS" | "soloCHOCH";

export interface VistaSMC {
  /** "presente" deja solo el último evento de cada tipo, como el original. */
  modo: ModoSMC;
  estilo: EstiloSMC;
  estructuraInterna: boolean;
  estructuraSwing: boolean;
  queInterna: QueEstructura;
  queSwing: QueEstructura;
  bloquesInternos: boolean;
  bloquesSwing: boolean;
  iguales: boolean;
  fvg: boolean;
  /** Velas que se extiende una brecha más allá de donde se formó. */
  extenderFvg: number;
  extremos: boolean;
  zonas: boolean;
  nivelDiario: boolean;
  nivelSemanal: boolean;
  nivelMensual: boolean;
  /** Las flechas de compra y venta con su stop y su objetivo. */
  senales: boolean;
}

export const VISTA_SMC: VistaSMC = {
  modo: "historico",
  estilo: "color",
  estructuraInterna: true,
  estructuraSwing: true,
  queInterna: "todo",
  queSwing: "todo",
  bloquesInternos: true,
  bloquesSwing: false,
  iguales: true,
  fvg: false,
  extenderFvg: 1,
  extremos: true,
  zonas: false,
  nivelDiario: false,
  nivelSemanal: false,
  nivelMensual: false,
  senales: true,
};

// Los colores del indicador original.
export const VERDE_SMC = "#089981";
export const ROJO_SMC = "#f23645";
export const AZUL_SMC = "#2157f3";
export const GRIS_SMC = "#878b94";
export const MONO_ALCISTA = "#b2b5be";
export const MONO_BAJISTA = "#5d606b";

export function colorAlcista(v: VistaSMC): string {
  return v.estilo === "mono" ? MONO_ALCISTA : VERDE_SMC;
}

export function colorBajista(v: VistaSMC): string {
  return v.estilo === "mono" ? MONO_BAJISTA : ROJO_SMC;
}

/** Si un evento pasa el filtro de "solo BOS" o "solo CHoCH". */
export function entraPorFiltro(que: QueEstructura, tipo: "BOS" | "CHOCH"): boolean {
  if (que === "todo") return true;
  if (que === "soloBOS") return tipo === "BOS";
  return tipo === "CHOCH";
}

/**
 * Deja solo el último de cada grupo, para el modo "presente".
 *
 * El original borra el dibujo anterior cada vez que hace uno nuevo, así
 * que en pantalla queda uno solo. Acá se hace filtrando, que da lo mismo
 * en pantalla y no obliga a llevar la cuenta de qué se borró.
 */
export function soloElUltimo<T>(lista: T[], grupo: (x: T) => string): T[] {
  const ultimo = new Map<string, T>();
  for (const x of lista) ultimo.set(grupo(x), x);
  return [...ultimo.values()];
}
