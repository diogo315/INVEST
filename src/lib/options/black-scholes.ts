/**
 * Black-Scholes-Merton para opciones europeas sobre acciones con dividendo
 * continuo, y el motor de estrategias de varias patas.
 *
 * Todo acá es matemática cerrada: no depende de ningún proveedor de datos.
 * Las fórmulas están verificadas contra scipy (ver `scripts/verificar-bs.py`).
 */

export type TipoOpcion = "call" | "put";
export type Lado = "compra" | "venta";

export interface ParamsBS {
  /** Precio del subyacente. */
  S: number;
  /** Strike. */
  K: number;
  /** Tiempo al vencimiento, en AÑOS. */
  T: number;
  /** Tasa libre de riesgo anual, en tanto por uno (0.045 = 4.5 %). */
  r: number;
  /** Dividendo continuo anual, en tanto por uno. */
  q: number;
  /** Volatilidad implícita anual, en tanto por uno (0.30 = 30 %). */
  sigma: number;
  tipo: TipoOpcion;
}

export interface Griegas {
  precio: number;
  /** Cambio del precio de la opción por $1 del subyacente. */
  delta: number;
  /** Cambio del delta por $1 del subyacente. */
  gamma: number;
  /** Pérdida de valor por el paso de UN DÍA calendario. */
  theta: number;
  /** Cambio de precio por subir la volatilidad UN PUNTO (1 %). */
  vega: number;
  /** Cambio de precio por subir la tasa UN PUNTO (1 %). */
  rho: number;
}

/** Densidad normal estándar. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Normal acumulada. erfc por la aproximación de Numerical Recipes (error
 * relativo < 1.2e-7), más que suficiente para precios de opciones.
 */
export function normCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  const cof = [
    -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
    4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6,
    1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9,
    5.059343495e-9, -9.91364156e-10, -2.27365122e-10, 9.6467911e-11,
    2.394038e-12, -6.886027e-12, 8.94487e-13, 3.13092e-13, -1.12708e-13,
    3.81e-16, 7.106e-15,
  ];
  let d = 0;
  let dd = 0;
  for (let j = cof.length - 1; j > 0; j--) {
    const tmp = d;
    d = ty * d - dd + cof[j];
    dd = tmp;
  }
  const ans = t * Math.exp(-z * z + 0.5 * (cof[0] + ty * d) - dd);
  return x >= 0 ? ans : 2 - ans;
}

/** Valor intrínseco (lo que vale la opción si venciera ahora mismo). */
export function intrinseco(S: number, K: number, tipo: TipoOpcion): number {
  return tipo === "call" ? Math.max(0, S - K) : Math.max(0, K - S);
}

function d1d2(p: ParamsBS): { d1: number; d2: number; raizT: number } {
  const raizT = Math.sqrt(p.T);
  const d1 =
    (Math.log(p.S / p.K) + (p.r - p.q + (p.sigma * p.sigma) / 2) * p.T) /
    (p.sigma * raizT);
  return { d1, d2: d1 - p.sigma * raizT, raizT };
}

/** Precio teórico de la opción. */
export function precioBS(p: ParamsBS): number {
  if (!(p.S > 0) || !(p.K > 0)) return 0;
  // Vencida o sin volatilidad: solo queda el intrínseco (descontado).
  if (p.T <= 0) return intrinseco(p.S, p.K, p.tipo);
  if (p.sigma <= 0) {
    const fwd = p.S * Math.exp(-p.q * p.T);
    const kDesc = p.K * Math.exp(-p.r * p.T);
    return p.tipo === "call"
      ? Math.max(0, fwd - kDesc)
      : Math.max(0, kDesc - fwd);
  }
  const { d1, d2 } = d1d2(p);
  const descS = p.S * Math.exp(-p.q * p.T);
  const descK = p.K * Math.exp(-p.r * p.T);
  return p.tipo === "call"
    ? descS * normCdf(d1) - descK * normCdf(d2)
    : descK * normCdf(-d2) - descS * normCdf(-d1);
}

/**
 * Precio y griegas. Theta viene por DÍA y vega/rho por PUNTO de porcentaje,
 * que es como las muestran las plataformas (y como se leen en la práctica).
 */
export function griegasBS(p: ParamsBS): Griegas {
  const precio = precioBS(p);
  if (p.T <= 0 || p.sigma <= 0 || !(p.S > 0) || !(p.K > 0)) {
    const dentro = intrinseco(p.S, p.K, p.tipo) > 0;
    return {
      precio,
      delta: dentro ? (p.tipo === "call" ? 1 : -1) : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }
  const { d1, d2, raizT } = d1d2(p);
  const expQ = Math.exp(-p.q * p.T);
  const expR = Math.exp(-p.r * p.T);
  const nd1 = normPdf(d1);

  const gamma = (expQ * nd1) / (p.S * p.sigma * raizT);
  const vegaAnual = p.S * expQ * nd1 * raizT;
  const comun = -(p.S * expQ * nd1 * p.sigma) / (2 * raizT);

  if (p.tipo === "call") {
    const thetaAnual =
      comun - p.r * p.K * expR * normCdf(d2) + p.q * p.S * expQ * normCdf(d1);
    return {
      precio,
      delta: expQ * normCdf(d1),
      gamma,
      theta: thetaAnual / 365,
      vega: vegaAnual / 100,
      rho: (p.K * p.T * expR * normCdf(d2)) / 100,
    };
  }
  const thetaAnual =
    comun + p.r * p.K * expR * normCdf(-d2) - p.q * p.S * expQ * normCdf(-d1);
  return {
    precio,
    delta: expQ * (normCdf(d1) - 1),
    gamma,
    theta: thetaAnual / 365,
    vega: vegaAnual / 100,
    rho: (-p.K * p.T * expR * normCdf(-d2)) / 100,
  };
}

/**
 * Volatilidad implícita a partir del precio de mercado.
 *
 * Newton-Raphson con vega, y bisección de respaldo: cerca del vencimiento o
 * muy fuera del dinero la vega se va a cero y Newton solo se dispara.
 * Devuelve `null` si el precio está fuera de los límites de no arbitraje.
 */
export function volImplicita(
  precioMercado: number,
  p: Omit<ParamsBS, "sigma">,
): number | null {
  if (!(precioMercado > 0) || p.T <= 0) return null;
  const minimo = precioBS({ ...p, sigma: 1e-9 });
  const maximo = precioBS({ ...p, sigma: 5 });
  if (precioMercado < minimo - 1e-8 || precioMercado > maximo + 1e-8) {
    return null;
  }

  let sigma = 0.3;
  for (let i = 0; i < 40; i++) {
    const g = griegasBS({ ...p, sigma });
    const dif = g.precio - precioMercado;
    if (Math.abs(dif) < 1e-8) return sigma;
    const vegaUnitaria = g.vega * 100; // por 1.00 de vol, no por punto
    if (!(vegaUnitaria > 1e-10)) break;
    const paso = dif / vegaUnitaria;
    const siguiente = sigma - paso;
    if (!Number.isFinite(siguiente) || siguiente <= 0 || siguiente > 5) break;
    sigma = siguiente;
  }

  let lo = 1e-6;
  let hi = 5;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const precio = precioBS({ ...p, sigma: mid });
    if (Math.abs(precio - precioMercado) < 1e-8) return mid;
    if (precio > precioMercado) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// ───────────────────────────── estrategias ─────────────────────────────

export type TipoPata = TipoOpcion | "accion";

export interface Pata {
  id: string;
  tipo: TipoPata;
  lado: Lado;
  /** Contratos (opciones) o acciones sueltas. */
  cantidad: number;
  /** Acciones por contrato; en EE. UU. casi siempre 100. */
  multiplicador: number;
  strike: number;
  /** Prima pagada o cobrada por acción (en acciones: precio de entrada). */
  prima: number;
  /** Días al vencimiento al abrir la pata. */
  dias: number;
  /** Volatilidad implícita de esta pata. */
  vol: number;
  activa: boolean;
}

const signo = (lado: Lado) => (lado === "compra" ? 1 : -1);

/** Lo que costó abrir la posición. Positivo = débito, negativo = crédito. */
export function costoApertura(patas: Pata[]): number {
  return patas
    .filter((p) => p.activa)
    .reduce(
      (acc, p) => acc + signo(p.lado) * p.prima * p.cantidad * p.multiplicador,
      0,
    );
}

/**
 * Resultado de la posición a un precio del subyacente, habiendo pasado
 * `diasTranscurridos` días. Con los días consumidos hasta el vencimiento de
 * cada pata, el valor es el intrínseco puro.
 */
export function resultado(
  patas: Pata[],
  S: number,
  diasTranscurridos: number,
  r: number,
  q: number,
): number {
  let valor = 0;
  for (const p of patas) {
    if (!p.activa) continue;
    const unidades = p.cantidad * p.multiplicador;
    if (p.tipo === "accion") {
      valor += signo(p.lado) * (S - p.prima) * unidades;
      continue;
    }
    const diasRestantes = Math.max(0, p.dias - diasTranscurridos);
    const valorPata =
      diasRestantes <= 0
        ? intrinseco(S, p.strike, p.tipo)
        : precioBS({
            S,
            K: p.strike,
            T: diasRestantes / 365,
            r,
            q,
            sigma: p.vol,
            tipo: p.tipo,
          });
    valor += signo(p.lado) * (valorPata - p.prima) * unidades;
  }
  return valor;
}

export interface MetricasEstrategia {
  costo: number;
  maxGanancia: number | null;
  maxPerdida: number | null;
  /** Precios del subyacente donde el resultado al vencimiento cruza cero. */
  equilibrios: number[];
}

/**
 * Métricas al vencimiento, barriendo el rango de precios. `null` en máximos
 * significa ilimitado (el barrido sigue creciendo en el borde).
 */
export function metricas(
  patas: Pata[],
  desde: number,
  hasta: number,
  r: number,
  q: number,
  pasos = 600,
): MetricasEstrategia {
  const activas = patas.filter((p) => p.activa);
  const vacio: MetricasEstrategia = {
    costo: 0,
    maxGanancia: 0,
    maxPerdida: 0,
    equilibrios: [],
  };
  if (activas.length === 0 || !(hasta > desde)) return vacio;

  const diasMax = Math.max(...activas.map((p) => (p.tipo === "accion" ? 0 : p.dias)));
  const paso = (hasta - desde) / pasos;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= pasos; i++) {
    const S = desde + i * paso;
    xs.push(S);
    ys.push(resultado(activas, S, diasMax, r, q));
  }

  const equilibrios: number[] = [];
  for (let i = 1; i < ys.length; i++) {
    const a = ys[i - 1];
    const b = ys[i];
    if (a === 0) equilibrios.push(xs[i - 1]);
    else if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      // interpolación lineal al cruce
      equilibrios.push(xs[i - 1] + (xs[i] - xs[i - 1]) * (-a / (b - a)));
    }
  }

  const maxY = Math.max(...ys);
  const minY = Math.min(...ys);
  const bordeArriba =
    ys[ys.length - 1] > ys[ys.length - 2] || ys[0] > ys[1];
  const bordeAbajo =
    ys[ys.length - 1] < ys[ys.length - 2] || ys[0] < ys[1];

  return {
    costo: costoApertura(activas),
    maxGanancia: bordeArriba && maxY > 0 ? null : maxY,
    maxPerdida: bordeAbajo && minY < 0 ? null : minY,
    equilibrios,
  };
}
