/**
 * Conceptos macro en español, y con qué símbolo se miran.
 *
 * Dos cosas que este archivo hace y que no son obvias:
 *
 * 1. Traduce lo que uno escribe («índice del dólar», «volatilidad»,
 *    «tasas») al papel que hay que abrir. Antes esto era un diccionario
 *    de igualdad exacta: «dolar» encontraba UUP pero «indice del dolar»
 *    no encontraba nada, que es justo lo que uno escribe.
 *
 * 2. Dice CUÁNDO el papel no es lo que el nombre promete. Esto importa
 *    más que lo anterior. VIXY no es el VIX: son futuros del VIX, y con
 *    contango pierden valor solo por pasar el tiempo —UVXY convirtió
 *    10.000 dólares en 2.586 en un año mientras la volatilidad no se
 *    movió tanto—. Alguien que abre VIXY creyendo que mira el VIX saca
 *    conclusiones al revés. Por eso la advertencia viaja con el
 *    concepto y se muestra en el buscador, no en un comentario que
 *    nadie lee.
 *
 * Y hay conceptos SIN símbolo: la inflación, el desempleo, el M2 y el
 * balance de la Fed no tienen ETF que los siga de verdad. En vez de
 * devolver «sin resultados» y dejar a uno pensando que escribió mal, se
 * dicen con todas las letras.
 */

/** Un concepto que se puede escribir en el buscador. */
export interface ConceptoMacro {
  /** Cómo se escribe, sin tildes y en minúsculas. La primera es el nombre. */
  frases: string[];
  /** Símbolos que lo resuelven, el mejor primero. Vacío = no hay. */
  simbolos: string[];
  /** Qué es, en una línea. */
  que: string;
  /**
   * Por qué el símbolo NO es exactamente lo que el concepto dice.
   * `null` cuando el papel sigue de verdad a la cosa.
   */
  advertencia: string | null;
}

export const CONCEPTOS: ConceptoMacro[] = [
  // ── divisas ──────────────────────────────────────────────────────
  {
    frases: ["indice del dolar", "dolar", "dxy", "dollar index", "usd"],
    simbolos: ["UUP", "UDN"],
    que: "El dólar contra una canasta de monedas. UUP sube si el dólar sube; UDN al revés.",
    advertencia:
      "No es el DXY: es un fondo que lo sigue, con comisión anual y error de seguimiento. Sirve para la dirección, no para el nivel exacto.",
  },

  // ── volatilidad ──────────────────────────────────────────────────
  {
    frases: ["volatilidad", "vix", "indice del miedo", "miedo"],
    simbolos: ["VIXY", "VXX", "UVXY"],
    que: "Volatilidad esperada del S&P 500.",
    advertencia:
      "NO es el VIX: son futuros del VIX. Con contango pierden valor solo por pasar el tiempo, aunque la volatilidad no baje. A un año el desvío es enorme. Para leer el nivel del VIX no sirven; para operar un susto de días, sí.",
  },

  // ── tasas y bonos ────────────────────────────────────────────────
  {
    frases: ["tasas", "tasa de interes", "tipos de interes", "tasa fed", "fed"],
    simbolos: ["BIL", "SHY", "TLT"],
    que: "No hay ETF de la tasa. Estos son bonos del Tesoro a distintos plazos.",
    advertencia:
      "El precio del bono se mueve AL REVÉS de la tasa: si la tasa sube, estos bajan. No los leas como si fueran la tasa.",
  },
  {
    frases: ["bonos", "tesoro", "treasuries", "renta fija", "deuda"],
    simbolos: ["TLT", "IEF", "SHY", "BIL"],
    que: "Bonos del Tesoro de EE. UU.: TLT más de 20 años, IEF de 7 a 10, SHY de 1 a 3, BIL letras.",
    advertencia: null,
  },
  {
    frases: ["bono 10 anos", "bonos 10 anos", "tasa 10 anos", "10 anos"],
    simbolos: ["IEF", "TLT"],
    que: "El tramo de 7 a 10 años, que es el que se mira como «el bono a 10 años».",
    advertencia:
      "Es el PRECIO del bono, no su rendimiento. Cuando el titular dice «el 10 años subió», esto baja.",
  },
  {
    frases: ["letras", "tasa corta", "t-bills", "bil"],
    simbolos: ["BIL"],
    que: "Letras del Tesoro a 1–3 meses: lo más parecido a la tasa de la Fed que se puede comprar.",
    advertencia: null,
  },

  // ── crédito ──────────────────────────────────────────────────────
  {
    frases: ["credito", "alto rendimiento", "high yield", "bonos basura"],
    simbolos: ["HYG", "JNK"],
    que: "Deuda de empresas de peor calidad. Se cae antes que las acciones cuando el mercado se asusta.",
    advertencia: null,
  },
  {
    frases: ["grado de inversion", "investment grade", "deuda corporativa"],
    simbolos: ["LQD"],
    que: "Deuda de empresas de buena calidad.",
    advertencia: null,
  },

  // ── acciones de referencia ───────────────────────────────────────
  { frases: ["sp500", "s&p", "s&p 500", "sp 500"], simbolos: ["SPY", "VOO", "IVV"], que: "Las 500 empresas grandes de EE. UU.", advertencia: null },
  { frases: ["nasdaq", "tecnologicas"], simbolos: ["QQQ"], que: "Las 100 mayores del Nasdaq.", advertencia: null },
  { frases: ["dow jones", "dow"], simbolos: ["DIA"], que: "El Dow Jones industrial.", advertencia: null },
  { frases: ["pequenas empresas", "small caps", "russell"], simbolos: ["IWM"], que: "Empresas chicas de EE. UU.", advertencia: null },
  { frases: ["emergentes", "mercados emergentes"], simbolos: ["EEM"], que: "Bolsas de países emergentes.", advertencia: null },
  { frases: ["europa", "desarrollados", "internacional"], simbolos: ["EFA"], que: "Bolsas desarrolladas fuera de EE. UU.", advertencia: null },
  { frases: ["inmobiliario", "bienes raices", "reits"], simbolos: ["VNQ"], que: "Fondos inmobiliarios de EE. UU.", advertencia: null },

  // ── materias primas ──────────────────────────────────────────────
  { frases: ["oro"], simbolos: ["GLD", "IAU", "GDX"], que: "Oro físico (GLD, IAU) y mineras de oro (GDX).", advertencia: null },
  { frases: ["plata"], simbolos: ["SLV"], que: "Plata física.", advertencia: null },
  { frases: ["petroleo", "crudo"], simbolos: ["USO", "BNO", "XLE"], que: "Petróleo (USO y BNO) y petroleras (XLE).", advertencia: "USO tiene futuros adentro: en contango se desvía del precio del barril con el tiempo." },
  { frases: ["gas"], simbolos: ["UNG"], que: "Gas natural.", advertencia: "Mismo problema de futuros que USO, y peor." },
  { frases: ["cobre"], simbolos: ["CPER"], que: "Cobre, que se mira como termómetro de la industria.", advertencia: null },
  { frases: ["agro", "agricultura"], simbolos: ["DBA"], que: "Canasta agrícola.", advertencia: null },
  { frases: ["materias primas", "commodities"], simbolos: ["DBC", "GLD", "SLV", "USO", "CPER", "DBA"], que: "Canasta amplia de materias primas.", advertencia: null },

  // ── lo que todavía NO se puede ver ───────────────────────────────
  //
  // Sin símbolo a propósito. Decir «no hay» es información; devolver
  // «sin resultados» deja a uno pensando que escribió mal el nombre.
  {
    frases: ["inflacion", "cpi", "ipc"],
    simbolos: ["TIP"],
    que: "TIP son bonos indexados a la inflación.",
    advertencia:
      "TIP NO es la inflación: es un bono que se ajusta por ella, y su precio depende también de las tasas. El CPI de verdad llega cuando conectemos FRED.",
  },
  {
    frases: ["desempleo", "empleo", "nomina", "payrolls"],
    simbolos: [],
    que: "Desempleo de EE. UU.",
    advertencia: "No hay ETF que siga esto. Es un dato mensual: llega cuando conectemos FRED.",
  },
  {
    frases: ["m2", "masa monetaria", "liquidez"],
    simbolos: [],
    que: "Dinero en circulación.",
    advertencia: "No hay ETF que siga esto. Llega cuando conectemos FRED.",
  },
  {
    frases: ["balance de la fed", "balance fed", "qe", "quantitative easing"],
    simbolos: [],
    que: "Activos de la Reserva Federal.",
    advertencia: "No hay ETF que siga esto. Llega cuando conectemos FRED.",
  },
  {
    frases: ["curva de bonos", "curva", "10y-2y", "inversion de la curva"],
    simbolos: [],
    que: "Diferencia entre el bono a 10 años y el de 2 años, que se mira para anticipar recesiones.",
    advertencia: "No hay ETF que siga esto desde que cerraron los que lo hacían. Llega con FRED.",
  },
];

/** Texto comparable: sin tildes, en minúsculas y con espacios normales. */
export function normalizar(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** ¿`frase` aparece en `texto` como palabra entera? */
function contienePalabra(texto: string, frase: string): boolean {
  const i = texto.indexOf(frase);
  if (i === -1) return false;
  const antes = i === 0 ? " " : texto[i - 1];
  const fin = i + frase.length;
  const despues = fin >= texto.length ? " " : texto[fin];
  return !/[a-z0-9]/.test(antes) && !/[a-z0-9]/.test(despues);
}

/**
 * El concepto que corresponde a lo que se escribió, o null.
 *
 * Tres formas de acertar, de más a menos fuerte:
 *   · la consulta ES la frase        → «dolar»
 *   · la consulta CONTIENE la frase  → «indice del dolar», «el vix hoy»
 *   · la frase EMPIEZA por la consulta, con 3 letras o más → «volat»
 *
 * Lo de «palabra entera» no es un detalle: sin eso, «ahorro» contiene
 * «oro» y el buscador te ofrece lingotes.
 */
export function conceptoDe(consulta: string): ConceptoMacro | null {
  const q = normalizar(consulta);
  if (!q) return null;
  let porPrefijo: ConceptoMacro | null = null;
  let largoContenido = 0;
  let porContenido: ConceptoMacro | null = null;
  for (const c of CONCEPTOS) {
    for (const f of c.frases) {
      if (q === f) return c; // exacto gana siempre
      if (contienePalabra(q, f) && f.length > largoContenido) {
        // La frase más larga gana: «bono 10 anos» antes que «bonos».
        largoContenido = f.length;
        porContenido = c;
      }
      if (!porPrefijo && q.length >= 3 && f.startsWith(q)) porPrefijo = c;
    }
  }
  return porContenido ?? porPrefijo;
}

/**
 * Los símbolos que un concepto pone arriba de todo, EN ORDEN.
 *
 * Una lista y no un conjunto: el orden de `simbolos` es la prioridad
 * («UUP, UDN» quiere decir que el alcista va primero), y devolverlo
 * como conjunto lo perdía. El buscador ordenaba después por su criterio
 * genérico —alfabético, el más corto primero— y así «dolar» ofrecía UDN
 * antes que UUP, o sea el fondo que sube cuando el dólar BAJA.
 */
export function atajosDe(consulta: string): string[] {
  return conceptoDe(consulta)?.simbolos ?? [];
}
