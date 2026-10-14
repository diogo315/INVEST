/**
 * La zona horaria: desfases fijos y la regla de la vela diaria.
 *
 *   node --experimental-strip-types --import ./scripts/alias.mjs \
 *     scripts/verificar-zona.mjs
 *
 * Lo que se cuida acá es una trampa concreta: una vela DIARIA de Binance
 * viene marcada a las 00:00 UTC. Leída en UTC−4 cae el día anterior a las
 * 20:00, y el eje escribe "2" donde la vela es la del 3. Un backtest con
 * las fechas corridas un día no sirve para nada.
 */
import {
  ZONAS,
  ZONA_BACKTEST,
  desfaseMinutos,
  etiquetaZona,
  fechaCortaEn,
  fechaHoraEn,
  nombreZona,
  tickMarkFormatter,
  timeFormatter,
  zonaDelEje,
} from "../src/lib/chart/timezone.ts";
import { TickMarkType } from "lightweight-charts";

let bien = 0;
const malos = [];
const comprobar = (n, c, d = "") => {
  if (c) bien++;
  else {
    malos.push(n);
    console.log(`  MAL ${n}${d ? ` — ${d}` : ""}`);
  }
};

const seg = (...a) => Date.UTC(...a) / 1000;

// ── el defecto del backtesting ──────────────────────────────────────
console.log("UTC−4 por defecto");
{
  comprobar("la zona por defecto del backtest es UTC−4",
    desfaseMinutos(ZONA_BACKTEST) === -240, String(desfaseMinutos(ZONA_BACKTEST)));
  comprobar("y el botón lo dice así", etiquetaZona(ZONA_BACKTEST) === "UTC−4",
    etiquetaZona(ZONA_BACKTEST));
  comprobar("está en la lista del menú", ZONAS.some((z) => z.id === ZONA_BACKTEST));
  comprobar("con un nombre legible", nombreZona(ZONA_BACKTEST) === "UTC−4 fijo",
    nombreZona(ZONA_BACKTEST));

  // Fija de verdad: el mismo desfase en enero y en julio. Es la razón de
  // no usar una ciudad — Nueva York es −4 en verano y −5 en invierno.
  const enero = desfaseMinutos(ZONA_BACKTEST, new Date("2026-01-15T12:00:00Z"));
  const julio = desfaseMinutos(ZONA_BACKTEST, new Date("2026-07-15T12:00:00Z"));
  comprobar("no cambia con el horario de verano", enero === julio && enero === -240,
    `enero ${enero}, julio ${julio}`);
  // Y la prueba de que una ciudad SÍ cambiaría.
  const nyEnero = desfaseMinutos("America/New_York", new Date("2026-01-15T12:00:00Z"));
  const nyJulio = desfaseMinutos("America/New_York", new Date("2026-07-15T12:00:00Z"));
  comprobar("mientras que Nueva York sí cambia (por eso no se usa)",
    nyEnero !== nyJulio, `${nyEnero} vs ${nyJulio}`);
}

console.log("Los otros desfases fijos");
{
  for (const [id, min] of [["Etc/GMT+3", -180], ["Etc/GMT+5", -300], ["Etc/GMT+6", -360]]) {
    comprobar(`${id} son ${min / 60} horas`, desfaseMinutos(id) === min, String(desfaseMinutos(id)));
  }
  comprobar("todos los fijos están agrupados aparte",
    ZONAS.filter((z) => z.grupo === "Desfase fijo").length === 4);
  comprobar("ninguno de los fijos cambia entre enero y julio",
    ZONAS.filter((z) => z.grupo === "Desfase fijo").every((z) =>
      desfaseMinutos(z.id, new Date("2026-01-15T12:00:00Z")) ===
      desfaseMinutos(z.id, new Date("2026-07-15T12:00:00Z"))));
}

// ── LA TRAMPA: la vela diaria ───────────────────────────────────────
console.log("La vela diaria es una FECHA, no un instante");
{
  const diaria = seg(2026, 2, 3); // 2026-03-03 00:00 UTC, una vela diaria
  comprobar("leída a lo bruto en UTC−4 se va al día anterior",
    fechaHoraEn(diaria, "Etc/GMT+4") === "2026-03-02 20:00",
    fechaHoraEn(diaria, "Etc/GMT+4"));
  // Por eso el eje de una diaria se escribe en UTC.
  comprobar("`zonaDelEje` manda UTC en 1d", zonaDelEje("Etc/GMT+4", "1d") === "utc");
  comprobar("y en 1w", zonaDelEje("Etc/GMT+4", "1w") === "utc");
  comprobar("pero respeta la zona en 1h", zonaDelEje("Etc/GMT+4", "1h") === "Etc/GMT+4");
  comprobar("y en 5m", zonaDelEje("Etc/GMT+4", "5m") === "Etc/GMT+4");
  comprobar("si la zona es UTC, da igual la temporalidad",
    zonaDelEje("utc", "1h") === "utc" && zonaDelEje("utc", "1d") === "utc");

  const ejeDiario = tickMarkFormatter(zonaDelEje("Etc/GMT+4", "1d"));
  comprobar("con la regla puesta, el eje diario dice 3",
    ejeDiario(diaria, TickMarkType.DayOfMonth) === "3",
    ejeDiario(diaria, TickMarkType.DayOfMonth));
  const ejeBruto = tickMarkFormatter("Etc/GMT+4");
  comprobar("y sin la regla diría 2 (que es el error que se evita)",
    ejeBruto(diaria, TickMarkType.DayOfMonth) === "2",
    ejeBruto(diaria, TickMarkType.DayOfMonth));

  // Un mes entero: ninguna fecha se corre.
  let corridas = 0;
  for (let d = 1; d <= 31; d++) {
    const t = seg(2026, 0, d);
    if (ejeDiario(t, TickMarkType.DayOfMonth) !== String(d)) corridas++;
  }
  comprobar("ningún día de enero se corre", corridas === 0, `${corridas} corridos`);
}

// ── las intradía SÍ usan la zona ────────────────────────────────────
console.log("Las intradía usan la zona elegida");
{
  const apertura = seg(2026, 2, 3, 14, 30); // 09:30 en Nueva York (invierno)
  const eje = tickMarkFormatter(zonaDelEje("Etc/GMT+4", "1h"));
  comprobar("las 14:30 UTC se ven 10:30 en UTC−4",
    eje(apertura, TickMarkType.Time) === "10:30", eje(apertura, TickMarkType.Time));
  comprobar("en UTC se ven 14:30",
    tickMarkFormatter("utc")(apertura, TickMarkType.Time) === "14:30");
  comprobar("la cruz dice la fecha completa",
    timeFormatter("Etc/GMT+4")(apertura) === "3 mar 2026  10:30",
    timeFormatter("Etc/GMT+4")(apertura));
  // Cruzando la medianoche hacia atrás: 02:00 UTC es la noche anterior.
  const madrugada = seg(2026, 2, 3, 2, 0);
  comprobar("las 02:00 UTC son las 22:00 del día anterior en UTC−4",
    fechaHoraEn(madrugada, "Etc/GMT+4") === "2026-03-02 22:00",
    fechaHoraEn(madrugada, "Etc/GMT+4"));
}

// ── los formateadores sueltos ───────────────────────────────────────
console.log("Formateadores");
{
  const t = seg(2026, 2, 3, 18, 0);
  comprobar("fechaHoraEn en UTC", fechaHoraEn(t, "utc") === "2026-03-03 18:00", fechaHoraEn(t, "utc"));
  comprobar("fechaHoraEn en UTC−4", fechaHoraEn(t, "Etc/GMT+4") === "2026-03-03 14:00",
    fechaHoraEn(t, "Etc/GMT+4"));
  comprobar("fechaCortaEn", fechaCortaEn(t, "utc") === "03 mar", fechaCortaEn(t, "utc"));
  comprobar("una zona inventada no rompe: cae en UTC",
    fechaHoraEn(t, "No/Existe") === "2026-03-03 18:00", fechaHoraEn(t, "No/Existe"));
  comprobar("ni la etiqueta", etiquetaZona("No/Existe") === "UTC", etiquetaZona("No/Existe"));
  // Un año entero, media hora a media hora: nunca una hora fuera de 0–23.
  let raras = 0;
  for (let i = 0; i < 365 * 48; i += 7) {
    const p = fechaHoraEn(seg(2026, 0, 1) + i * 1800, "Etc/GMT+4");
    const h = Number(p.slice(11, 13));
    if (!(h >= 0 && h <= 23)) raras++;
  }
  comprobar("ninguna hora fuera de rango en todo el año", raras === 0, String(raras));
}

console.log(`\n${bien} bien, ${malos.length} mal`);
process.exit(malos.length === 0 ? 0 : 1);
