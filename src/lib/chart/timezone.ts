import { TickMarkType, type Time } from "lightweight-charts";

export type ChartTimezone = "utc" | "local";

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
 * lightweight-charts SIEMPRE dibuja los timestamps en UTC (usa getUTCHours
 * internamente). Para mostrar hora local no se tocan los datos —eso rompería
 * el anclaje del VWAP y las divergencias— sino solo los formateadores de las
 * etiquetas del eje y del crosshair.
 */
function partes(timeSec: number, tz: ChartTimezone): Partes {
  const d = new Date(timeSec * 1000);
  return tz === "utc"
    ? {
        anio: d.getUTCFullYear(),
        mes: d.getUTCMonth(),
        dia: d.getUTCDate(),
        hora: d.getUTCHours(),
        min: d.getUTCMinutes(),
        seg: d.getUTCSeconds(),
      }
    : {
        anio: d.getFullYear(),
        mes: d.getMonth(),
        dia: d.getDate(),
        hora: d.getHours(),
        min: d.getMinutes(),
        seg: d.getSeconds(),
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

/** Etiqueta corta para el botón: "UTC" o "UTC−5". */
export function etiquetaZona(tz: ChartTimezone): string {
  if (tz === "utc") return "UTC";
  const min = -new Date().getTimezoneOffset();
  const signo = min < 0 ? "−" : "+";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${signo}${h}${m ? `:${dosDigitos(m)}` : ""}`;
}
