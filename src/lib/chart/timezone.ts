import { TickMarkType, type Time } from "lightweight-charts";

/**
 * Zona horaria del gráfico: "utc", "local" (la del navegador) o un id IANA
 * ("America/Guayaquil", "Asia/Tokyo", …).
 */
export type ChartTimezone = string;

/** Zona por defecto: UTC−5 (Quito / Bogotá / Lima), sin horario de verano. */
export const ZONA_POR_DEFECTO = "America/Guayaquil";

export interface OpcionZona {
  id: ChartTimezone;
  nombre: string;
  grupo: string;
}

/** Lista que se ofrece en el menú, en el mismo orden. */
export const ZONAS: OpcionZona[] = [
  { id: "utc", nombre: "UTC (exchanges)", grupo: "Referencia" },
  { id: "local", nombre: "Hora del navegador", grupo: "Referencia" },

  { id: "America/Guayaquil", nombre: "Quito · Bogotá · Lima", grupo: "América" },
  { id: "America/Santiago", nombre: "Santiago", grupo: "América" },
  { id: "America/Argentina/Buenos_Aires", nombre: "Buenos Aires", grupo: "América" },
  { id: "America/Sao_Paulo", nombre: "São Paulo", grupo: "América" },
  { id: "America/Mexico_City", nombre: "Ciudad de México", grupo: "América" },
  { id: "America/New_York", nombre: "Nueva York", grupo: "América" },
  { id: "America/Chicago", nombre: "Chicago", grupo: "América" },
  { id: "America/Denver", nombre: "Denver", grupo: "América" },
  { id: "America/Los_Angeles", nombre: "Los Ángeles", grupo: "América" },

  { id: "Europe/London", nombre: "Londres", grupo: "Europa · África" },
  { id: "Europe/Madrid", nombre: "Madrid", grupo: "Europa · África" },
  { id: "Europe/Berlin", nombre: "Berlín · Fráncfort", grupo: "Europa · África" },
  { id: "Europe/Moscow", nombre: "Moscú", grupo: "Europa · África" },
  { id: "Africa/Johannesburg", nombre: "Johannesburgo", grupo: "Europa · África" },

  { id: "Asia/Dubai", nombre: "Dubái", grupo: "Asia · Pacífico" },
  { id: "Asia/Kolkata", nombre: "India", grupo: "Asia · Pacífico" },
  { id: "Asia/Bangkok", nombre: "Bangkok", grupo: "Asia · Pacífico" },
  { id: "Asia/Shanghai", nombre: "Shanghái · Hong Kong", grupo: "Asia · Pacífico" },
  { id: "Asia/Singapore", nombre: "Singapur", grupo: "Asia · Pacífico" },
  { id: "Asia/Tokyo", nombre: "Tokio", grupo: "Asia · Pacífico" },
  { id: "Australia/Sydney", nombre: "Sídney", grupo: "Asia · Pacífico" },
  { id: "Pacific/Auckland", nombre: "Auckland", grupo: "Asia · Pacífico" },
];

const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

interface Partes {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  min: number;
  seg: number;
}

/**
 * Formateadores Intl cacheados: crear un Intl.DateTimeFormat es caro y el
 * formateador del eje se llama cientos de veces por frame.
 */
const cacheFmt = new Map<string, Intl.DateTimeFormat | null>();

function formateador(zona: string): Intl.DateTimeFormat | null {
  if (cacheFmt.has(zona)) return cacheFmt.get(zona) ?? null;
  let f: Intl.DateTimeFormat | null = null;
  try {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zona,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    // Zona desconocida en este navegador → se cae a UTC.
    f = null;
  }
  cacheFmt.set(zona, f);
  return f;
}

/**
 * lightweight-charts SIEMPRE dibuja los timestamps en UTC (usa getUTCHours
 * internamente). Para mostrar otra zona no se tocan los datos —eso rompería
 * el anclaje del VWAP y las divergencias— sino solo los formateadores de las
 * etiquetas del eje y del crosshair.
 */
function partes(timeSec: number, tz: ChartTimezone): Partes {
  const d = new Date(timeSec * 1000);

  if (tz === "local") {
    return {
      anio: d.getFullYear(),
      mes: d.getMonth(),
      dia: d.getDate(),
      hora: d.getHours(),
      min: d.getMinutes(),
      seg: d.getSeconds(),
    };
  }

  const enUTC: Partes = {
    anio: d.getUTCFullYear(),
    mes: d.getUTCMonth(),
    dia: d.getUTCDate(),
    hora: d.getUTCHours(),
    min: d.getUTCMinutes(),
    seg: d.getUTCSeconds(),
  };

  if (tz === "utc") return enUTC;

  const fmt = formateador(tz);
  if (!fmt) return enUTC;

  const p: Record<string, number> = {};
  for (const parte of fmt.formatToParts(d)) {
    if (parte.type !== "literal") p[parte.type] = Number(parte.value);
  }
  if (Number.isNaN(p.year)) return enUTC;

  return {
    anio: p.year,
    mes: p.month - 1,
    dia: p.day,
    hora: p.hour % 24, // h23 ya devuelve 0–23; el módulo cubre motores viejos.
    min: p.minute,
    seg: p.second,
  };
}

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/** Segundos desde un `Time` de lightweight-charts (acá siempre UTCTimestamp). */
function aSegundos(time: Time): number {
  if (typeof time === "number") return time;
  if (typeof time === "string") return Date.parse(`${time}T00:00:00Z`) / 1000;
  return Date.UTC(time.year, time.month - 1, time.day) / 1000;
}

/** Etiquetas del eje de tiempo. */
export function tickMarkFormatter(tz: ChartTimezone) {
  return (time: Time, tipo: TickMarkType): string => {
    const p = partes(aSegundos(time), tz);
    switch (tipo) {
      case TickMarkType.Year:
        return String(p.anio);
      case TickMarkType.Month:
        return MESES[p.mes];
      case TickMarkType.DayOfMonth:
        return String(p.dia);
      case TickMarkType.TimeWithSeconds:
        return `${dosDigitos(p.hora)}:${dosDigitos(p.min)}:${dosDigitos(p.seg)}`;
      default:
        return `${dosDigitos(p.hora)}:${dosDigitos(p.min)}`;
    }
  };
}

/** Etiqueta del crosshair (la burbuja del eje inferior). */
export function timeFormatter(tz: ChartTimezone) {
  return (time: Time): string => {
    const p = partes(aSegundos(time), tz);
    return `${p.dia} ${MESES[p.mes]} ${p.anio}  ${dosDigitos(p.hora)}:${dosDigitos(p.min)}`;
  };
}

/** Minutos de desfase respecto de UTC en este momento (Quito → −300). */
export function desfaseMinutos(tz: ChartTimezone, ahora = new Date()): number {
  if (tz === "utc") return 0;
  if (tz === "local") return -ahora.getTimezoneOffset();

  const fmt = formateador(tz);
  if (!fmt) return 0;

  // Se reconstruye la hora local de la zona y se compara con la UTC del mismo
  // instante: la diferencia, redondeada al minuto, es el desfase vigente.
  const p = partes(Math.floor(ahora.getTime() / 1000), tz);
  const comoUTC = Date.UTC(p.anio, p.mes, p.dia, p.hora, p.min, p.seg);
  return Math.round((comoUTC - ahora.getTime()) / 60000);
}

/** Etiqueta corta para el botón: "UTC" o "UTC−5". */
export function etiquetaZona(tz: ChartTimezone): string {
  const min = desfaseMinutos(tz);
  if (min === 0) return "UTC";
  const signo = min < 0 ? "−" : "+";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${signo}${h}${m ? `:${dosDigitos(m)}` : ""}`;
}

/** Nombre largo para el tooltip y el menú. */
export function nombreZona(tz: ChartTimezone): string {
  return ZONAS.find((z) => z.id === tz)?.nombre ?? tz;
}
