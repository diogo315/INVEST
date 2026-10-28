"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { Columns2, Square } from "lucide-react";
import { BarraPanel } from "./BarraPanel";
import { NIVELES_INICIAL, PanelOperar, type EstadoNiveles } from "./PanelOperar";
import { BarraMercado } from "./BarraMercado";
import { Operaciones } from "./Operaciones";
import { useVelas } from "./useVelas";
import type { Cual, NivelDibujado } from "./CapaNiveles";
import {
  cantidadEfectiva,
  redondearNivel,
  toqueEnVela,
} from "@/lib/backtest/niveles";
import {
  precioLiquidacion,
  sanearFuturos,
  tocaLiquidacion,
} from "@/lib/backtest/futuros";
import {
  indiceHasta,
  precioContrato,
  volRealizada,
} from "@/lib/backtest/cadena";
import {
  curvaDeCapital,
  precioDe as precioDeOp,
  resumir,
  type Operacion,
} from "@/lib/backtest/tipos";
import {
  HISTORIAS,
  VELOCIDADES,
  backtestActivo,
  useBacktestStore,
} from "@/lib/store/backtest-store";
import { velasDelPanel } from "@/lib/backtest/multi";
import { senalesCipher, tiemposDe } from "@/lib/backtest/senales";
import { CONFIG_BT } from "@/lib/backtest/indicadores";
import { DEFAULT_CONFIG } from "@/lib/store/chart-store";
import { TimezoneSelector } from "@/components/chart/TimezoneSelector";
import { ZONA_BACKTEST, fechaHoraEn, zonaDelEje } from "@/lib/chart/timezone";
import { parseSymbol } from "@/lib/exchanges";
import { TIMEFRAME_SECONDS, type Timeframe } from "@/lib/binance/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/** El backtest corriendo: gráfico, reloj, panel de operar y resultados. */
export function VistaBacktest() {
  const bt = useBacktestStore(backtestActivo);
  const abrir = useBacktestStore((s) => s.abrir);
  const setTiempo = useBacktestStore((s) => s.setTiempo);
  const setTemporalidad = useBacktestStore((s) => s.setTemporalidad);
  const reproduciendo = useBacktestStore((s) => s.reproduciendo);
  const reproducir = useBacktestStore((s) => s.reproducir);
  const velocidad = useBacktestStore((s) => s.velocidad);
  const setVelocidad = useBacktestStore((s) => s.setVelocidad);
  const operar = useBacktestStore((s) => s.operar);
  const cerrarOp = useBacktestStore((s) => s.cerrar);
  const liquidarVencidas = useBacktestStore((s) => s.liquidarVencidas);
  const alternarIndicador = useBacktestStore((s) => s.alternarIndicador);
  const setHistoria = useBacktestStore((s) => s.setHistoria);
  const setMedias = useBacktestStore((s) => s.setMedias);
  const setSegunda = useBacktestStore((s) => s.setSegunda);
  const setBase = useBacktestStore((s) => s.setBase);
  const setZona = useBacktestStore((s) => s.setZona);
  const setPararEnOro = useBacktestStore((s) => s.setPararEnOro);
  const setNiveles = useBacktestStore((s) => s.setNiveles);
  const setConfigBT = useBacktestStore((s) => s.setConfigBT);
  const conComisiones = useBacktestStore((s) => s.conComisiones);
  const setConComisiones = useBacktestStore((s) => s.setConComisiones);
  const setMercado = useBacktestStore((s) => s.setMercado);
  const setFuturos = useBacktestStore((s) => s.setFuturos);
  const panelLateral = useBacktestStore((s) => s.panelLateral);
  const setPanelLateral = useBacktestStore((s) => s.setPanelLateral);
  const liquidarPorNivel = useBacktestStore((s) => s.liquidarPorNivel);

  /**
   * El plan de entrada: una sola fuente para el panel Y para el gráfico.
   *
   * Vive acá y no dentro del panel porque las líneas del gráfico también
   * lo mueven. Con una copia en cada sitio, lo que se arrastra y lo que
   * ejecuta el botón podrían no coincidir.
   */
  const [niveles, setNivelesPlan] = useState<EstadoNiveles>(NIVELES_INICIAL);
  const parcharNiveles = useCallback(
    (parche: Partial<EstadoNiveles>) =>
      setNivelesPlan((n) => ({ ...n, ...parche })),
    [],
  );

  const simbolo = bt?.simbolo ?? "";
  const desde = bt?.desde ?? 0;
  const historia = bt?.historiaPrevia ?? 365;
  const zona = bt?.zonaHoraria ?? ZONA_BACKTEST;
  const pararEnOro = bt?.pararEnOro === true;
  /**
   * Los ajustes con los que se calculan los indicadores: los de fábrica
   * con lo que ESTE backtest haya cambiado encima.
   */
  /** Spot o futuros, y con qué apalancamiento y costos. */
  const esFuturos = bt?.mercado === "futuros";
  const cfgFut = useMemo(
    () => sanearFuturos(esFuturos ? bt?.futuros : { ...bt?.futuros, apalancamiento: 1 }),
    [esFuturos, bt?.futuros],
  );
  const configBT = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...(bt?.config ?? {}) }),
    [bt?.config],
  );

  // ── las dos gráficas ────────────────────────────────────────────────
  //
  // El panel A son los campos de siempre del backtest; el B, un objeto
  // aparte que puede no estar. `base` dice cuál manda el reproductor, y
  // nunca puede ser "b" sin panel B.
  const panelB = bt?.panelB ?? null;
  const base: "a" | "b" = panelB && bt?.base === "b" ? "b" : "a";
  const tfA = (bt?.temporalidad ?? "1d") as Timeframe;
  const tfB = (panelB?.temporalidad ?? "1d") as Timeframe;

  // El reloj se lee acá arriba porque la ventana de velas se ancla a él:
  // en temporalidades cortas el período entero no entra en una petición
  // y hay que pedir el tramo donde está parado el reproductor.
  const tiempo = bt?.tiempoActual ?? 0;

  const a = useVelas(simbolo, tfA, desde, historia, tiempo);
  const b = useVelas(simbolo, panelB ? tfB : null, desde, historia, tiempo);

  const tfBase = base === "a" ? tfA : tfB;
  const velas = base === "a" ? a.velas : b.velas;
  /**
   * El reloj marca el momento de una vela de la BASE, así que se lee con
   * la misma regla que su eje: en diario y semanal, la fecha de calendario
   * en UTC; en intradía, la zona elegida.
   */
  const zonaReloj = zonaDelEje(zona, tfBase);
  const error = a.error ?? b.error;

  // ── el momento actual ───────────────────────────────────────────────
  const idx = useMemo(() => indiceHasta(velas, tiempo), [velas, tiempo]);
  const segBase = TIMEFRAME_SECONDS[tfBase];
  /**
   * Lo que puede mostrar cada gráfica sin enseñar el futuro.
   *
   * Para la base es exactamente lo de siempre (hasta la vela del reloj,
   * inclusive). Para la otra depende de su temporalidad: ver `multi.ts`,
   * que es donde está explicado y probado.
   */
  const fuente = useMemo(() => ({ velas, segundos: segBase }), [velas, segBase]);
  const visibles = useMemo(
    () => velasDelPanel(a.velas, TIMEFRAME_SECONDS[tfA], tiempo, fuente),
    [a.velas, tfA, tiempo, fuente],
  );
  const visiblesB = useMemo(
    () => (panelB ? velasDelPanel(b.velas, TIMEFRAME_SECONDS[tfB], tiempo, fuente) : []),
    [panelB, b.velas, tfB, tiempo, fuente],
  );
  const visiblesBase = base === "a" ? visibles : visiblesB;
  const precio = visiblesBase.at(-1)?.close ?? 0;
  const vol = useMemo(
    () => volRealizada(velas, tiempo, 20, segBase),
    [velas, tiempo, segBase],
  );
  const ultimo = velas.length - 1;
  /**
   * Primera vela del backtest. Todo lo anterior es historia previa: se ve
   * y alimenta a los indicadores, pero el reproductor no entra ahí porque
   * no hay nada que decidir antes de empezar.
   */
  const idxInicio = useMemo(() => indiceHasta(velas, desde), [velas, desde]);
  const alFinal = idx >= ultimo;

  /** Precio del instrumento de una operación, ahora mismo. */
  const precioAhora = useCallback(
    (op: Operacion) => precioDeOp(op, precio, tiempo, vol),
    [precio, tiempo, vol],
  );

  /**
   * Vencimientos de las opciones que siguen abiertas, sin repetir.
   *
   * Solo las abiertas: una vencida ya no es información, es historia, y
   * dejar su línea en el gráfico sería ruido.
   */
  const vencimientos = useMemo(() => {
    if (!bt) return [];
    const vistos = new Map<number, string>();
    for (const o of bt.operaciones) {
      if (o.precioSalida !== undefined || o.instrumento === "activo") continue;
      if (o.vencimiento === undefined) continue;
      const dias = Math.max(0, Math.round((o.vencimiento - tiempo) / 86400));
      vistos.set(
        o.vencimiento,
        `vence ${new Date(o.vencimiento * 1000).toISOString().slice(5, 10)} · ${dias} d`,
      );
    }
    return [...vistos].map(([time, etiqueta]) => ({ time, etiqueta }));
  }, [bt, tiempo]);

  const resumen = useMemo(() => {
    if (!bt) return null;
    const curva = curvaDeCapital(bt, visiblesBase, () => vol, cfgFut, conComisiones);
    return {
      r: resumir(
        bt,
        { valorar: precioAhora, ahora: tiempo, cfg: cfgFut, conComisiones },
        curva.map((p) => p.value),
      ),
      curva,
    };
  }, [bt, visiblesBase, vol, precioAhora, tiempo, cfgFut, conComisiones]);

  // ── liquidar lo vencido al avanzar ──────────────────────────────────
  // Una opción vencida deja de existir: si no se liquidara, seguiría
  // figurando como abierta y el capital sería mentira.
  useEffect(() => {
    if (!bt || velas.length === 0) return;
    const hayVencidas = bt.operaciones.some(
      (o) =>
        o.precioSalida === undefined &&
        o.instrumento !== "activo" &&
        o.vencimiento !== undefined &&
        o.vencimiento <= tiempo,
    );
    if (!hayVencidas) return;
    liquidarVencidas(tiempo, (o) => {
      const i = indiceHasta(velas, o.vencimiento ?? tiempo);
      const s = velas[i]?.close ?? precio;
      return precioContrato(
        s,
        o.strike ?? s,
        o.instrumento === "put" ? "put" : "call",
        o.vencimiento ?? tiempo,
        o.vencimiento ?? tiempo,
        vol,
      ).prima;
    });
  }, [bt, tiempo, velas, vol, precio, liquidarVencidas]);

  // ── stops y objetivos ───────────────────────────────────────────────
  //
  // Hasta qué vela ya se revisaron los niveles. Es lo que hace que los
  // niveles valgan HACIA ADELANTE: si se arrastra un stop a un precio por
  // el que la vela de hace tres días ya pasó, la operación NO se cierra
  // retroactivamente. Un nivel puesto hoy rige desde hoy, igual que una
  // orden que se manda hoy al mercado.
  const revisadoHasta = useRef(tiempo);
  useEffect(() => {
    // Al retroceder el reproductor se vuelve a abrir el tramo: lo que se
    // revise de nuevo al avanzar tiene que dar lo mismo, no quedar mudo.
    if (tiempo < revisadoHasta.current) revisadoHasta.current = tiempo;
  }, [tiempo]);

  useEffect(() => {
    if (!bt || visiblesBase.length === 0) return;
    const desdeRevision = revisadoHasta.current;
    if (tiempo <= desdeRevision) return;
    // Hay algo que revisar si alguna operación abierta tiene niveles, o
    // si estamos en futuros (donde toda posición puede liquidarse).
    const hayNiveles = bt.operaciones.some(
      (o) =>
        o.precioSalida === undefined &&
        o.instrumento === "activo" &&
        (esFuturos || o.stopLoss !== undefined || o.takeProfit !== undefined),
    );
    revisadoHasta.current = tiempo;
    if (!hayNiveles) return;
    liquidarPorNivel((o) => {
      if (o.instrumento !== "activo") return null;
      // Nunca antes de la entrada NI antes del último punto revisado: las
      // dos condiciones hacen falta, y por eso se toma la mayor.
      const desde = Math.max(o.tiempoEntrada, desdeRevision);
      const tramo = visiblesBase.filter((k) => k.time <= tiempo && k.time > desde);

      // La LIQUIDACIÓN se mira primero y gana a cualquier nivel: si el
      // precio llegó ahí, el bróker ya cerró la posición y el stop que
      // venía después nunca se ejecutó. Resolverlo al revés inventaría
      // una salida mejor de la que hubo.
      const liq = esFuturos ? precioLiquidacion(o.lado, o.precioEntrada, {
        ...cfgFut, apalancamiento: o.apalancamiento ?? 1,
      }) : null;

      for (const k of tramo) {
        if (liq !== null && tocaLiquidacion(o.lado, k, liq)) {
          return { precio: liq, time: k.time, motivo: "liquidacion" as const };
        }
        if (o.stopLoss !== undefined || o.takeProfit !== undefined) {
          const t = toqueEnVela(o.lado, k, {
            stopLoss: o.stopLoss,
            takeProfit: o.takeProfit,
          });
          if (t) return { precio: t.precio, time: t.time, motivo: t.motivo };
        }
      }
      return null;
    });
  }, [bt, tiempo, visiblesBase, liquidarPorNivel, esFuturos, cfgFut]);

  /** Lo que se dibuja y se puede arrastrar en la gráfica base. */
  const nivelesDibujados = useMemo<NivelDibujado[]>(() => {
    const out: NivelDibujado[] = [];
    const plan =
      niveles.usarNiveles && precio > 0
        ? {
            lado: niveles.ladoPlan,
            entrada: precio,
            cantidad: cantidadEfectiva(
              niveles.cantidadManual,
              resumen?.r.efectivo ?? bt?.capitalInicial ?? 0,
              precio,
            ),
            stopLoss: niveles.stopLoss ?? undefined,
            takeProfit: niveles.takeProfit ?? undefined,
          }
        : null;
    if (plan && plan.entrada > 0) {
      out.push({
        opId: "plan", cual: "entrada", precio: plan.entrada, lado: plan.lado,
        cantidad: plan.cantidad, entrada: plan.entrada, arrastrable: false,
        etiqueta: plan.lado === "compra" ? "Entrada largo" : "Entrada corto",
      });
      if (plan.stopLoss !== undefined) {
        out.push({
          opId: "plan", cual: "stop", precio: plan.stopLoss, lado: plan.lado,
          cantidad: plan.cantidad, entrada: plan.entrada, arrastrable: true,
          etiqueta: "Stop",
        });
      }
      if (plan.takeProfit !== undefined) {
        out.push({
          opId: "plan", cual: "objetivo", precio: plan.takeProfit, lado: plan.lado,
          cantidad: plan.cantidad, entrada: plan.entrada, arrastrable: true,
          etiqueta: "Objetivo",
        });
      }
    }
    for (const o of bt?.operaciones ?? []) {
      if (o.precioSalida !== undefined || o.instrumento !== "activo") continue;
      if (o.stopLoss === undefined && o.takeProfit === undefined) continue;
      out.push({
        opId: o.id, cual: "entrada", precio: o.precioEntrada, lado: o.lado,
        cantidad: o.cantidad, entrada: o.precioEntrada, arrastrable: false,
        etiqueta: o.lado === "compra" ? "Largo" : "Corto",
      });
      if (o.stopLoss !== undefined) {
        out.push({
          opId: o.id, cual: "stop", precio: o.stopLoss, lado: o.lado,
          cantidad: o.cantidad, entrada: o.precioEntrada, arrastrable: true,
          etiqueta: "Stop",
        });
      }
      if (o.takeProfit !== undefined) {
        out.push({
          opId: o.id, cual: "objetivo", precio: o.takeProfit, lado: o.lado,
          cantidad: o.cantidad, entrada: o.precioEntrada, arrastrable: true,
          etiqueta: "Objetivo",
        });
      }
    }
    return out;
  }, [niveles, precio, bt?.operaciones, bt?.capitalInicial, resumen?.r.efectivo]);

  const moverNivel = useCallback(
    (opId: string, cual: Cual, precio: number) => {
      if (cual === "entrada") return;
      const p = redondearNivel(precio);
      if (p <= 0) return;
      // El plan todavía no es una operación: vuelve al panel, que es
      // quien lo tiene. Una operación abierta se guarda directamente.
      if (opId === "plan") {
        parcharNiveles(cual === "stop" ? { stopLoss: p } : { takeProfit: p });
      } else {
        setNiveles(opId, cual === "stop" ? { stopLoss: p } : { takeProfit: p });
      }
    },
    [setNiveles, parcharNiveles],
  );

  // ── el freno en el punto de oro ─────────────────────────────────────
  //
  // Se calcula sobre la serie COMPLETA de la base, no sobre lo vivido, y
  // eso no es mirar el futuro: la onda y el RSI son causales, así que la
  // señal de una vela sale igual se calcule con los datos que vinieron
  // después o sin ellos. Está comprobado en `verificar-senales.mjs`, y
  // hacerlo una sola vez evita recalcular una wavetrend de miles de velas
  // en cada clic del reproductor.
  const orosBase = useMemo(() => {
    if (!pararEnOro || velas.length === 0) return new Set<number>();
    return tiemposDe(senalesCipher(velas, CONFIG_BT), "oro");
  }, [pararEnOro, velas]);
  /** ¿La vela donde está parado el reloj es un punto de oro? */
  const enOro = orosBase.has(tiempo);

  // ── reproducción ────────────────────────────────────────────────────
  const avanzar = useCallback(
    (n: number) => {
      if (velas.length === 0) return;
      let destino = Math.min(ultimo, Math.max(idxInicio, idx + n));
      // Yendo hacia adelante se frena en el PRIMER oro del tramo, no en el
      // final: con «diez velas adelante» la señal quedaría atrás y el
      // freno no serviría de nada.
      if (n > 0 && orosBase.size > 0) {
        for (let i = idx + 1; i <= destino; i++) {
          if (orosBase.has(velas[i].time)) {
            destino = i;
            break;
          }
        }
      }
      if (destino === idx) {
        if (n > 0) reproducir(false);
        return;
      }
      setTiempo(velas[destino].time);
      if (destino >= ultimo || orosBase.has(velas[destino].time)) reproducir(false);
    },
    [velas, idx, ultimo, idxInicio, setTiempo, reproducir, orosBase],
  );

  // El temporizador lee la última versión de `avanzar` por una ref: si
  // dependiera de ella, se reiniciaría en cada vela y el ritmo saldría
  // irregular.
  const avanzarRef = useRef(avanzar);
  useEffect(() => {
    avanzarRef.current = avanzar;
  }, [avanzar]);

  useEffect(() => {
    if (!reproduciendo) return;
    const id = setInterval(() => avanzarRef.current(1), 1000 / velocidad);
    return () => clearInterval(id);
  }, [reproduciendo, velocidad]);

  if (!bt) return null;

  const { symbol, exchange } = parseSymbol(bt.simbolo);
  const permiteOpciones = exchange === "ALP";
  const r = resumen?.r;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── cabecera ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-tv-border bg-tv-panel px-3 py-2">
        <button
          onClick={() => abrir(null)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Backtests
        </button>
        <span className="text-sm font-semibold text-tv-text">{symbol}</span>
        <span className="text-xs text-tv-text-muted">{bt.nombre}</span>
        {/* Los controles de cada gráfica (temporalidad, indicadores,
            medias) viven ARRIBA DE SU GRÁFICA, no acá: con dos paneles,
            dos juegos de controles en la misma cabecera no dejarían ver
            cuál es cuál. */}
        <button
          onClick={() => setSegunda(!panelB)}
          title={
            panelB
              ? "Volver a una sola gráfica"
              : "Agregar una segunda gráfica con otra temporalidad"
          }
          aria-pressed={!!panelB}
          className={cn(
            "ml-2 flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors",
            panelB
              ? "bg-tv-panel-hover text-tv-text"
              : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
          )}
        >
          {panelB ? (
            <Square className="h-3.5 w-3.5" />
          ) : (
            <Columns2 className="h-3.5 w-3.5" />
          )}
          {panelB ? "Una gráfica" : "Dos gráficas"}
        </button>
        <label className="flex items-center gap-1.5 text-[11px] text-tv-text-muted">
          <span className="hidden sm:inline">Historia previa</span>
          <select
            value={historia}
            onChange={(e) => setHistoria(Number(e.target.value))}
            title="Velas anteriores al arranque, para que los indicadores lleguen calculados"
            className="rounded border border-tv-border bg-tv-bg px-1.5 py-0.5 text-[11px] text-tv-text"
          >
            {HISTORIAS.map((h) => (
              <option key={h.dias} value={h.dias}>
                {h.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <TimezoneSelector
          valor={zona}
          onCambiar={setZona}
          titulo="Zona horaria de este backtest"
        />
        <span className="ml-auto font-mono text-xs tabular-nums text-tv-text">
          {fechaHoraEn(tiempo, zonaReloj)}
          {precio > 0 && (
            <span className="ml-3 text-tv-text-muted">{formatPrice(precio)}</span>
          )}
        </span>
      </div>

      {/* ── cuerpo ───────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Las gráficas, lado a lado. La curva de capital va SOLO en la
            base: sus puntos están en las fechas de las velas de la base, y
            en la otra temporalidad no caerían donde corresponde. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
          <BarraPanel
            panel="a"
            temporalidad={bt.temporalidad}
            indicadores={bt.indicadores ?? []}
            medias={bt.medias ?? []}
            esBase={base === "a"}
            hayDos={!!panelB}
            cargando={a.cargando}
            desde={desde}
            visibles={visibles}
            operaciones={bt.operaciones}
            curva={base === "a" ? (resumen?.curva ?? []) : []}
            vencimientos={vencimientos}
            zona={zona}
            onTemporalidad={setTemporalidad}
            onAlternar={alternarIndicador}
            onMedias={setMedias}
            onBase={setBase}
            config={configBT}
            onConfig={setConfigBT}
            // LA MISMA clave en las dos gráficas: lo que se dibuja en una
            // aparece en la otra. Son el mismo mercado en dos
            // temporalidades, y una zona marcada en 4h sigue siendo esa
            // zona en 15m. Tenerlas separadas obligaba a dibujar dos
            // veces lo mismo y a mantener dos versiones de la misma idea.
            claveDibujos={`bt:${bt.id}`}
            niveles={base === "a" ? nivelesDibujados : undefined}
            onMoverNivel={base === "a" ? moverNivel : undefined}
          />
          {panelB && (
            <div className="border-t border-tv-border lg:border-l lg:border-t-0" />
          )}
          {panelB && (
            <BarraPanel
              panel="b"
              temporalidad={panelB.temporalidad}
              indicadores={panelB.indicadores ?? []}
              medias={panelB.medias ?? []}
              esBase={base === "b"}
              hayDos
              cargando={b.cargando}
              desde={desde}
              visibles={visiblesB}
              operaciones={bt.operaciones}
              curva={base === "b" ? (resumen?.curva ?? []) : []}
              vencimientos={vencimientos}
              zona={zona}
              onTemporalidad={setTemporalidad}
              onAlternar={alternarIndicador}
              onMedias={setMedias}
              onBase={setBase}
              config={configBT}
              onConfig={setConfigBT}
              claveDibujos={`bt:${bt.id}`}
              niveles={base === "b" ? nivelesDibujados : undefined}
              onMoverNivel={base === "b" ? moverNivel : undefined}
            />
          )}
        </div>

        {/* El panel de la derecha se pliega para dejar las gráficas
            anchas. Plegado no desaparece del todo: deja una tira con el
            resultado y el efectivo libre, que es lo que uno mira de
            reojo mientras avanza el reproductor. Desplegarlo solo para
            leer dos números sería cambiar un problema por otro. */}
        {panelLateral ? (
          /* `overflow-y-auto` y `min-h-0`: sin esto, con futuros
             desplegado la barra de mercado y el panel de operar empujan
             la tabla de operaciones fuera de la vista y NO HAY FORMA DE
             LLEGAR A ELLA. Que es peor que un problema de estética:
             cerrar una posición es lo único que libera capital, y la
             única manera de cerrarla es esa tabla. */
          <aside className="flex min-h-0 w-full shrink-0 flex-col overflow-y-auto border-t border-tv-border bg-tv-panel lg:w-96 lg:border-l lg:border-t-0">
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-tv-border bg-tv-panel px-2 py-1">
              <span className="text-[10px] uppercase tracking-wider text-tv-text-dim">
                Operar
              </span>
              <button
                onClick={() => setPanelLateral(false)}
                title="Plegar el panel para ver las gráficas más anchas"
                aria-label="Plegar el panel"
                aria-expanded
                className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <BarraMercado
              mercado={esFuturos ? "futuros" : "spot"}
              futuros={cfgFut}
              conComisiones={conComisiones}
              onMercado={setMercado}
              onFuturos={setFuturos}
              onComisiones={setConComisiones}
            />
            <PanelOperar
              precio={precio}
              tiempo={tiempo}
              vol={vol}
              efectivo={r?.efectivo ?? bt.capitalInicial}
              permiteOpciones={permiteOpciones}
              simbolo={symbol}
              futuros={cfgFut}
              esFuturos={esFuturos}
              onOperar={(op) =>
              operar(
                esFuturos && op.instrumento === "activo"
                  ? { ...op, apalancamiento: cfgFut.apalancamiento }
                  : op,
              )
            }
              niveles={niveles}
              onNiveles={parcharNiveles}
            />
            {r && (
              <Operaciones
                operaciones={bt.operaciones}
                resumen={r}
                capitalInicial={bt.capitalInicial}
                precioDe={precioAhora}
                zona={zonaReloj}
                conComisiones={conComisiones}
                onCerrar={(op) => cerrarOp(op.id, precioAhora(op), tiempo)}
              />
            )}
          </aside>
        ) : (
          <aside className="flex w-full shrink-0 items-center gap-3 border-t border-tv-border bg-tv-panel px-2 py-1 lg:w-10 lg:flex-col lg:items-center lg:gap-2 lg:border-l lg:border-t-0 lg:py-2">
            <button
              onClick={() => setPanelLateral(true)}
              title="Desplegar el panel de operar"
              aria-label="Desplegar el panel"
              aria-expanded={false}
              className="rounded p-1 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {r && (
              <>
                <span
                  title={`Resultado: ${r.resultado >= 0 ? "+" : "−"}$${Math.abs(r.resultado).toFixed(0)}`}
                  className={cn(
                    "font-mono text-[11px] tabular-nums lg:[writing-mode:vertical-rl]",
                    r.resultado > 0
                      ? "text-tv-green"
                      : r.resultado < 0
                        ? "text-tv-red"
                        : "text-tv-text-muted",
                  )}
                >
                  {r.pct >= 0 ? "+" : ""}
                  {r.pct.toFixed(2)} %
                </span>
                <span
                  title="Efectivo libre"
                  className="font-mono text-[11px] tabular-nums text-tv-text-dim lg:[writing-mode:vertical-rl]"
                >
                  ${r.efectivo.toFixed(0)}
                </span>
                {r.abiertas > 0 && (
                  <span
                    title={`${r.abiertas} operación(es) abierta(s)`}
                    className="rounded bg-tv-blue/20 px-1 font-mono text-[10px] tabular-nums text-tv-blue"
                  >
                    {r.abiertas}
                  </span>
                )}
              </>
            )}
          </aside>
        )}
      </div>

      {/* ── barra de reproducción ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-tv-border bg-tv-panel px-3 py-2">
        <button
          onClick={() => reproducir(!reproduciendo)}
          disabled={alFinal || velas.length === 0}
          title={reproduciendo ? "Pausar" : "Reproducir"}
          aria-label={reproduciendo ? "Pausar" : "Reproducir"}
          className="rounded bg-tv-blue p-1.5 text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          {reproduciendo ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={() => avanzar(-1)}
          disabled={idx <= idxInicio}
          title="Una vela atrás"
          aria-label="Una vela atrás"
          className="rounded p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => avanzar(1)}
          disabled={alFinal}
          title="Una vela adelante"
          aria-label="Una vela adelante"
          className="rounded p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => avanzar(10)}
          disabled={alFinal}
          title="Diez velas adelante"
          aria-label="Diez velas adelante"
          className="rounded p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text disabled:opacity-30"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            reproducir(false);
            setTiempo(bt.desde);
          }}
          title="Volver al principio (las operaciones se conservan)"
          aria-label="Volver al principio"
          className="rounded p-1.5 text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <input
          type="range"
          min={idxInicio}
          max={Math.max(idxInicio, ultimo)}
          value={Math.max(idx, idxInicio)}
          onChange={(e) => {
            reproducir(false);
            const i = Number(e.target.value);
            if (velas[i]) setTiempo(velas[i].time);
          }}
          aria-label="Posición en el tiempo"
          className="h-1 min-w-32 flex-1 cursor-pointer accent-tv-blue"
        />

        <span className="font-mono text-[11px] tabular-nums text-tv-text-dim">
          {velas.length === 0 ? "0/0" : `${idx - idxInicio + 1}/${ultimo - idxInicio + 1}`}
        </span>
        <button
          onClick={() => setPararEnOro(!pararEnOro)}
          title={
            pararEnOro
              ? "El reproductor se frena en cada punto de oro del Cipher B"
              : "Frenar el reproductor cuando salga un punto de oro del Cipher B"
          }
          aria-pressed={pararEnOro}
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors",
            pararEnOro
              ? "bg-tv-yellow/15 text-tv-yellow"
              : "text-tv-text-muted hover:bg-tv-panel-hover hover:text-tv-text",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-2 w-2 rounded-full",
              pararEnOro ? "bg-tv-yellow" : "border border-current",
            )}
          />
          Parar en oro
        </button>
        <div className="flex gap-0.5 rounded bg-tv-bg p-0.5">
          {VELOCIDADES.map((v) => (
            <button
              key={v}
              onClick={() => setVelocidad(v)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
                v === velocidad
                  ? "bg-tv-panel-hover text-tv-text"
                  : "text-tv-text-muted hover:text-tv-text",
              )}
            >
              {v}×
            </button>
          ))}
        </div>
      </div>

      {/* El aviso se DEDUCE de dónde está el reloj, no se guarda en un
          estado aparte: así no puede quedar colgado de una vela anterior
          ni hace falta limpiarlo al retroceder. */}
      {enOro && (
        <div className="flex items-center gap-2 border-t border-tv-yellow/40 bg-tv-yellow/10 px-3 py-1.5 text-[11px] text-tv-yellow">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-tv-yellow" />
          <strong className="font-semibold">Punto de oro</strong>
          <span className="text-tv-yellow/80">
            {fechaHoraEn(tiempo, zonaReloj)} · cruce al alza desde sobreventa con el
            RSI por debajo de 30
          </span>
        </div>
      )}

      {error && (
        <div className="border-t border-tv-border bg-tv-bg px-3 py-1.5 text-[11px] text-tv-yellow">
          {error}
        </div>
      )}
    </div>
  );
}
