"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useChartStore,
  DEFAULT_CONFIG,
  type IndicatorKey,
} from "@/lib/store/chart-store";

const TITLES: Record<IndicatorKey, string> = {
  ema20: "EMA — Slot 1",
  ema50: "EMA — Slot 2",
  ema200: "EMA — Slot 3",
  rsi: "RSI",
  macd: "MACD",
  volume: "Volumen",
  bb: "Bollinger Bands",
  stoch: "Stochastic",
  vwap: "VWAP",
  cipher: "VuManChu Cipher B",
  gli: "Global Liquidity (M2)",
  srsi: "Stoch RSI",
};

export function IndicatorSettingsDialog() {
  const target = useChartStore((s) => s.settingsTarget);
  const setTarget = useChartStore((s) => s.setSettingsTarget);
  const config = useChartStore((s) => s.config);
  const setConfig = useChartStore((s) => s.setConfig);

  const open = target !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setTarget(null);
      }}
    >
      <DialogContent className="max-w-sm bg-tv-panel">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {target ? TITLES[target] : ""} — Configuración
          </DialogTitle>
        </DialogHeader>
        {target && (
          <SettingsForm
            target={target}
            config={config}
            onApply={(patch) => setConfig(patch)}
            onSave={(patch) => {
              setConfig(patch);
              setTarget(null);
            }}
            onReset={() => {
              setConfig(DEFAULT_CONFIG);
              setTarget(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  target: IndicatorKey;
  config: typeof DEFAULT_CONFIG;
  onApply: (patch: Partial<typeof DEFAULT_CONFIG>) => void;
  onSave: (patch: Partial<typeof DEFAULT_CONFIG>) => void;
  onReset: () => void;
}

function SettingsForm({ target, config, onApply, onSave, onReset }: FormProps) {
  // Local draft state to avoid recalculating chart on every keystroke
  const [draft, setDraft] = useState({
    ema20: config.ema20,
    ema50: config.ema50,
    ema200: config.ema200,
    rsi: config.rsi,
    macdFast: config.macdFast,
    macdSlow: config.macdSlow,
    macdSignal: config.macdSignal,
    bbPeriod: config.bbPeriod,
    bbStdDev: config.bbStdDev,
    stochK: config.stochK,
    stochD: config.stochD,
    stochSmooth: config.stochSmooth,
    srsiK: config.srsiK,
    srsiD: config.srsiD,
    srsiRsiLen: config.srsiRsiLen,
    srsiStochLen: config.srsiStochLen,
    vwapMult1: config.vwapMult1,
    vwapMult2: config.vwapMult2,
    vwapMult3: config.vwapMult3,
    wtChannelLen: config.wtChannelLen,
    wtAverageLen: config.wtAverageLen,
    wtMALen: config.wtMALen,
    mfiPeriod: config.mfiPeriod,
    mfiMultiplier: config.mfiMultiplier,
    cipherStochLen: config.cipherStochLen,
    cipherStochRsiLen: config.cipherStochRsiLen,
    cipherStochSmoothK: config.cipherStochSmoothK,
    cipherStochSmoothD: config.cipherStochSmoothD,
    wtObLevel: config.wtObLevel,
    wtOsLevel: config.wtOsLevel,
  });

  useEffect(() => {
    setDraft({
      ema20: config.ema20,
      ema50: config.ema50,
      ema200: config.ema200,
      rsi: config.rsi,
      macdFast: config.macdFast,
      macdSlow: config.macdSlow,
      macdSignal: config.macdSignal,
      bbPeriod: config.bbPeriod,
      bbStdDev: config.bbStdDev,
      stochK: config.stochK,
      stochD: config.stochD,
      stochSmooth: config.stochSmooth,
      srsiK: config.srsiK,
      srsiD: config.srsiD,
      srsiRsiLen: config.srsiRsiLen,
      srsiStochLen: config.srsiStochLen,
      vwapMult1: config.vwapMult1,
      vwapMult2: config.vwapMult2,
      vwapMult3: config.vwapMult3,
      wtChannelLen: config.wtChannelLen,
      wtAverageLen: config.wtAverageLen,
      wtMALen: config.wtMALen,
      mfiPeriod: config.mfiPeriod,
      mfiMultiplier: config.mfiMultiplier,
      cipherStochLen: config.cipherStochLen,
      cipherStochRsiLen: config.cipherStochRsiLen,
      cipherStochSmoothK: config.cipherStochSmoothK,
      cipherStochSmoothD: config.cipherStochSmoothD,
      wtObLevel: config.wtObLevel,
      wtOsLevel: config.wtOsLevel,
    });
  }, [config, target]);

  function save() {
    if (target === "ema20") onSave({ ema20: clamp(draft.ema20, 2, 500) });
    else if (target === "ema50") onSave({ ema50: clamp(draft.ema50, 2, 500) });
    else if (target === "ema200") onSave({ ema200: clamp(draft.ema200, 2, 500) });
    else if (target === "rsi") onSave({ rsi: clamp(draft.rsi, 2, 100) });
    else if (target === "macd")
      onSave({
        macdFast: clamp(draft.macdFast, 2, 100),
        macdSlow: clamp(draft.macdSlow, 2, 200),
        macdSignal: clamp(draft.macdSignal, 2, 100),
      });
    else if (target === "bb")
      onSave({
        bbPeriod: clamp(draft.bbPeriod, 2, 200),
        bbStdDev: clamp(draft.bbStdDev, 1, 10),
      });
    else if (target === "srsi")
      onSave({
        srsiK: clamp(draft.srsiK, 1, 50),
        srsiD: clamp(draft.srsiD, 1, 50),
        srsiRsiLen: clamp(draft.srsiRsiLen, 2, 100),
        srsiStochLen: clamp(draft.srsiStochLen, 2, 100),
      });
    else if (target === "stoch")
      onSave({
        stochK: clamp(draft.stochK, 2, 100),
        stochD: clamp(draft.stochD, 1, 50),
        stochSmooth: clamp(draft.stochSmooth, 1, 50),
      });
    else if (target === "cipher")
      onSave({
        wtChannelLen: clamp(draft.wtChannelLen, 2, 100),
        wtAverageLen: clamp(draft.wtAverageLen, 2, 100),
        wtMALen: clamp(draft.wtMALen, 1, 50),
        mfiPeriod: clamp(draft.mfiPeriod, 2, 200),
        mfiMultiplier: clamp(draft.mfiMultiplier, 1, 500),
        cipherStochLen: clamp(draft.cipherStochLen, 2, 100),
        cipherStochRsiLen: clamp(draft.cipherStochRsiLen, 2, 100),
        cipherStochSmoothK: clamp(draft.cipherStochSmoothK, 1, 50),
        cipherStochSmoothD: clamp(draft.cipherStochSmoothD, 1, 50),
        wtObLevel: clamp(draft.wtObLevel, 1, 200),
        wtOsLevel: clamp(draft.wtOsLevel, -200, -1),
      });
    else if (target === "vwap")
      onSave({
        vwapMult1: clampF(draft.vwapMult1, 0, 10),
        vwapMult2: clampF(draft.vwapMult2, 0, 10),
        vwapMult3: clampF(draft.vwapMult3, 0, 10),
      });
    else if (target === "volume") onSave({});
  }

  return (
    <div className="flex flex-col gap-3">
      {(target === "ema20" || target === "ema50" || target === "ema200") && (
        <Field
          label="Período"
          value={draft[target]}
          onChange={(n) => setDraft((d) => ({ ...d, [target]: n }))}
        />
      )}
      {target === "rsi" && (
        <Field
          label="Período"
          value={draft.rsi}
          onChange={(n) => setDraft((d) => ({ ...d, rsi: n }))}
        />
      )}
      {target === "macd" && (
        <div className="grid grid-cols-3 gap-2">
          <Field
            label="Rápida"
            value={draft.macdFast}
            onChange={(n) => setDraft((d) => ({ ...d, macdFast: n }))}
          />
          <Field
            label="Lenta"
            value={draft.macdSlow}
            onChange={(n) => setDraft((d) => ({ ...d, macdSlow: n }))}
          />
          <Field
            label="Señal"
            value={draft.macdSignal}
            onChange={(n) => setDraft((d) => ({ ...d, macdSignal: n }))}
          />
        </div>
      )}
      {target === "volume" && (
        <p className="text-xs text-tv-text-muted">
          El indicador de volumen no tiene parámetros configurables en esta
          versión.
        </p>
      )}
      {target === "bb" && (
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="Período"
            value={draft.bbPeriod}
            onChange={(n) => setDraft((d) => ({ ...d, bbPeriod: n }))}
          />
          <Field
            label="Desv. estándar"
            value={draft.bbStdDev}
            min={1}
            max={10}
            onChange={(n) => setDraft((d) => ({ ...d, bbStdDev: n }))}
          />
        </div>
      )}
      {target === "stoch" && (
        <div className="grid grid-cols-3 gap-2">
          <Field
            label="%K"
            value={draft.stochK}
            onChange={(n) => setDraft((d) => ({ ...d, stochK: n }))}
          />
          <Field
            label="%D"
            value={draft.stochD}
            min={1}
            max={50}
            onChange={(n) => setDraft((d) => ({ ...d, stochD: n }))}
          />
          <Field
            label="Suaviz."
            value={draft.stochSmooth}
            min={1}
            max={50}
            onChange={(n) => setDraft((d) => ({ ...d, stochSmooth: n }))}
          />
        </div>
      )}
      {target === "srsi" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="K"
              value={draft.srsiK}
              min={1}
              max={50}
              onChange={(n) => setDraft((d) => ({ ...d, srsiK: n }))}
            />
            <Field
              label="D"
              value={draft.srsiD}
              min={1}
              max={50}
              onChange={(n) => setDraft((d) => ({ ...d, srsiD: n }))}
            />
            <Field
              label="RSI Length"
              value={draft.srsiRsiLen}
              min={2}
              max={100}
              onChange={(n) => setDraft((d) => ({ ...d, srsiRsiLen: n }))}
            />
            <Field
              label="Stochastic Length"
              value={draft.srsiStochLen}
              min={2}
              max={100}
              onChange={(n) => setDraft((d) => ({ ...d, srsiStochLen: n }))}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-tv-text-muted">
            Equivalente al Stoch RSI estándar de TradingView (Pine v6): RSI
            sobre el cierre, luego estocástico y suavizado SMA en K y D. Bandas
            en 80 / 50 / 20.
          </p>
        </div>
      )}
      {target === "vwap" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <PlainSelect
              label="Anchor Period"
              value={config.vwapAnchor}
              options={[
                ["session", "Sesión (día UTC)"],
                ["week", "Semana"],
                ["month", "Mes"],
                ["quarter", "Trimestre"],
                ["year", "Año"],
              ]}
              onChange={(v) => onApply({ vwapAnchor: v })}
            />
            <PlainSelect
              label="Source"
              value={config.vwapSource}
              options={[
                ["hlc3", "hlc3"],
                ["hl2", "hl2"],
                ["hlcc4", "hlcc4"],
                ["ohlc4", "ohlc4"],
                ["close", "close"],
              ]}
              onChange={(v) => onApply({ vwapSource: v })}
            />
          </div>
          <PlainSelect
            label="Bands Calculation Mode"
            value={config.vwapBandsMode}
            options={[
              ["stdev", "Standard Deviation"],
              ["pct", "Percentage (mult 1 = 1%)"],
            ]}
            onChange={(v) => onApply({ vwapBandsMode: v })}
          />
          <div className="flex flex-col gap-2 border-t border-tv-border pt-3">
            {(
              [
                [1, "vwapShowBand1", "vwapMult1", "#4caf50"],
                [2, "vwapShowBand2", "vwapMult2", "#808000"],
                [3, "vwapShowBand3", "vwapMult3", "#008080"],
              ] as const
            ).map(([n, showKey, multKey, color]) => (
              <div key={n} className="flex items-center gap-3">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <div className="flex-1">
                  <Toggle
                    label={`Bands Multiplier #${n}`}
                    checked={config[showKey]}
                    onChange={(v) => onApply({ [showKey]: v })}
                  />
                </div>
                <div className="w-24">
                  <FloatField
                    label=""
                    value={draft[multKey]}
                    step={0.5}
                    min={0}
                    max={10}
                    onChange={(v) => setDraft((d) => ({ ...d, [multKey]: v }))}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-tv-text-muted">
            Equivalente al VWAP estándar de TradingView (Pine v6): desviación
            estándar ponderada por volumen y reinicio en cada período de
            anclaje. Los anclajes Earnings / Dividends / Splits del original no
            aplican a cripto.
          </p>
        </div>
      )}
      {target === "cipher" && (
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Mostrar
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <Toggle
              label="WaveTrend"
              checked={config.cipherShowWaveTrend}
              onChange={(v) => onApply({ cipherShowWaveTrend: v })}
            />
            <Toggle
              label="Fast WT (VWAP)"
              checked={config.cipherShowFastWT}
              onChange={(v) => onApply({ cipherShowFastWT: v })}
            />
            <Toggle
              label="Buy dots"
              checked={config.cipherShowBuyDots}
              onChange={(v) => onApply({ cipherShowBuyDots: v })}
            />
            <Toggle
              label="Sell dots"
              checked={config.cipherShowSellDots}
              onChange={(v) => onApply({ cipherShowSellDots: v })}
            />
            <Toggle
              label="Gold dots"
              checked={config.cipherShowGoldDots}
              onChange={(v) => onApply({ cipherShowGoldDots: v })}
            />
            <Toggle
              label="Cross dots"
              checked={config.cipherShowCrossDots}
              onChange={(v) => onApply({ cipherShowCrossDots: v })}
            />
            <Toggle
              label="MFI"
              checked={config.cipherShowMFI}
              onChange={(v) => onApply({ cipherShowMFI: v })}
            />
            <Toggle
              label="RSI"
              checked={config.cipherShowRSI}
              onChange={(v) => onApply({ cipherShowRSI: v })}
            />
            <Toggle
              label="Stoch RSI"
              checked={config.cipherShowStochRSI}
              onChange={(v) => onApply({ cipherShowStochRSI: v })}
            />
          </div>

          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            WaveTrend
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field
              label="Channel"
              value={draft.wtChannelLen}
              max={100}
              onChange={(n) => setDraft((d) => ({ ...d, wtChannelLen: n }))}
            />
            <Field
              label="Average"
              value={draft.wtAverageLen}
              max={100}
              onChange={(n) => setDraft((d) => ({ ...d, wtAverageLen: n }))}
            />
            <Field
              label="MA"
              value={draft.wtMALen}
              min={1}
              max={50}
              onChange={(n) => setDraft((d) => ({ ...d, wtMALen: n }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field
              label="OB 1"
              value={draft.wtObLevel}
              min={1}
              max={200}
              onChange={(n) => setDraft((d) => ({ ...d, wtObLevel: n }))}
            />
            <Field
              label="OB 2"
              value={config.wtObLevel2}
              min={1}
              max={200}
              onChange={(n) => onApply({ wtObLevel2: clamp(n, 1, 200) })}
            />
            <Field
              label="OB 3"
              value={config.wtObLevel3}
              min={1}
              max={200}
              onChange={(n) => onApply({ wtObLevel3: clamp(n, 1, 200) })}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field
              label="OS 1"
              value={draft.wtOsLevel}
              min={-200}
              max={-1}
              onChange={(n) => setDraft((d) => ({ ...d, wtOsLevel: n }))}
            />
            <Field
              label="OS 2"
              value={config.wtOsLevel2}
              min={-200}
              max={-1}
              onChange={(n) => onApply({ wtOsLevel2: clamp(n, -200, -1) })}
            />
            <Field
              label="OS 3"
              value={config.wtOsLevel3}
              min={-200}
              max={-1}
              onChange={(n) => onApply({ wtOsLevel3: clamp(n, -200, -1) })}
            />
          </div>

          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            MFI
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field
              label="Período"
              value={draft.mfiPeriod}
              max={200}
              onChange={(n) => setDraft((d) => ({ ...d, mfiPeriod: n }))}
            />
            <Field
              label="Multiplier"
              value={draft.mfiMultiplier}
              min={1}
              max={1000}
              onChange={(n) => setDraft((d) => ({ ...d, mfiMultiplier: n }))}
            />
            <Field
              label="Y Pos"
              value={config.cipherMfiYPos}
              min={-50}
              max={50}
              onChange={(n) => onApply({ cipherMfiYPos: clamp(n, -50, 50) })}
            />
          </div>

          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            RSI
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field
              label="Longitud"
              value={config.cipherRsiLen}
              max={100}
              onChange={(n) => onApply({ cipherRsiLen: clamp(n, 2, 100) })}
            />
            <Field
              label="Overbought"
              value={config.cipherRsiOverbought}
              min={1}
              max={99}
              onChange={(n) =>
                onApply({ cipherRsiOverbought: clamp(n, 1, 99) })
              }
            />
            <Field
              label="Oversold"
              value={config.cipherRsiOversold}
              min={1}
              max={99}
              onChange={(n) =>
                onApply({ cipherRsiOversold: clamp(n, 1, 99) })
              }
            />
          </div>

          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Divergencias
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <Toggle
              label="Div dots"
              checked={config.cipherShowDivDots}
              onChange={(v) => onApply({ cipherShowDivDots: v })}
            />
            <Toggle
              label="No OB/OS en hidden"
              checked={config.cipherNotApplyOBOSOnHidden}
              onChange={(v) => onApply({ cipherNotApplyOBOSOnHidden: v })}
            />
            <Toggle
              label="WT regular"
              checked={config.cipherShowWTDivergences}
              onChange={(v) => onApply({ cipherShowWTDivergences: v })}
            />
            <Toggle
              label="WT hidden"
              checked={config.cipherShowWTDivergencesHidden}
              onChange={(v) => onApply({ cipherShowWTDivergencesHidden: v })}
            />
            <Toggle
              label="WT 2nd regular"
              checked={config.cipherShowWTDivergences2}
              onChange={(v) => onApply({ cipherShowWTDivergences2: v })}
            />
            <span />
            <Toggle
              label="RSI regular"
              checked={config.cipherShowRSIDivergences}
              onChange={(v) => onApply({ cipherShowRSIDivergences: v })}
            />
            <Toggle
              label="RSI hidden"
              checked={config.cipherShowRSIDivergencesHidden}
              onChange={(v) =>
                onApply({ cipherShowRSIDivergencesHidden: v })
              }
            />
            <Toggle
              label="Stoch regular"
              checked={config.cipherShowStochDivergences}
              onChange={(v) => onApply({ cipherShowStochDivergences: v })}
            />
            <Toggle
              label="Stoch hidden"
              checked={config.cipherShowStochDivergencesHidden}
              onChange={(v) =>
                onApply({ cipherShowStochDivergencesHidden: v })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="WT bear min"
              value={config.cipherWtDivOBLevel}
              min={1}
              max={200}
              onChange={(n) =>
                onApply({ cipherWtDivOBLevel: clamp(n, 1, 200) })
              }
            />
            <Field
              label="WT bull min"
              value={config.cipherWtDivOSLevel}
              min={-200}
              max={-1}
              onChange={(n) =>
                onApply({ cipherWtDivOSLevel: clamp(n, -200, -1) })
              }
            />
            <Field
              label="WT 2nd bear"
              value={config.cipherWtDivOBLevel2}
              min={1}
              max={200}
              onChange={(n) =>
                onApply({ cipherWtDivOBLevel2: clamp(n, 1, 200) })
              }
            />
            <Field
              label="WT 2nd bull"
              value={config.cipherWtDivOSLevel2}
              min={-200}
              max={-1}
              onChange={(n) =>
                onApply({ cipherWtDivOSLevel2: clamp(n, -200, -1) })
              }
            />
            <Field
              label="RSI bear min"
              value={config.cipherRsiDivOBLevel}
              min={1}
              max={100}
              onChange={(n) =>
                onApply({ cipherRsiDivOBLevel: clamp(n, 1, 100) })
              }
            />
            <Field
              label="RSI bull min"
              value={config.cipherRsiDivOSLevel}
              min={1}
              max={100}
              onChange={(n) =>
                onApply({ cipherRsiDivOSLevel: clamp(n, 1, 100) })
              }
            />
          </div>

          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Stochastic RSI
          </div>
          <div className="flex flex-col gap-1.5">
            <Toggle
              label="Use Log"
              checked={config.cipherStochUseLog}
              onChange={(v) => onApply({ cipherStochUseLog: v })}
            />
            <Toggle
              label="Use Avg de K & D"
              checked={config.cipherStochUseAvg}
              onChange={(v) => onApply({ cipherStochUseAvg: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Stoch len"
              value={draft.cipherStochLen}
              max={100}
              onChange={(n) =>
                setDraft((d) => ({ ...d, cipherStochLen: n }))
              }
            />
            <Field
              label="RSI len"
              value={draft.cipherStochRsiLen}
              max={100}
              onChange={(n) =>
                setDraft((d) => ({ ...d, cipherStochRsiLen: n }))
              }
            />
            <Field
              label="Smooth K"
              value={draft.cipherStochSmoothK}
              min={1}
              max={50}
              onChange={(n) =>
                setDraft((d) => ({ ...d, cipherStochSmoothK: n }))
              }
            />
            <Field
              label="Smooth D"
              value={draft.cipherStochSmoothD}
              min={1}
              max={50}
              onChange={(n) =>
                setDraft((d) => ({ ...d, cipherStochSmoothD: n }))
              }
            />
          </div>

          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Schaff Trend Cycle
          </div>
          <Toggle
            label="Mostrar Schaff TC line"
            checked={config.cipherShowSchaff}
            onChange={(v) => onApply({ cipherShowSchaff: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Length"
              value={config.cipherSchaffLength}
              max={100}
              onChange={(n) =>
                onApply({ cipherSchaffLength: clamp(n, 2, 100) })
              }
            />
            <Field
              label="Factor x100"
              value={Math.round((config.cipherSchaffFactor ?? 0.5) * 100)}
              min={1}
              max={100}
              onChange={(n) =>
                onApply({ cipherSchaffFactor: clamp(n, 1, 100) / 100 })
              }
            />
            <Field
              label="Fast"
              value={config.cipherSchaffFast}
              max={200}
              onChange={(n) =>
                onApply({ cipherSchaffFast: clamp(n, 2, 200) })
              }
            />
            <Field
              label="Slow"
              value={config.cipherSchaffSlow}
              max={500}
              onChange={(n) =>
                onApply({ cipherSchaffSlow: clamp(n, 2, 500) })
              }
            />
          </div>

          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Sommi Flag (multi-TF)
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <Toggle
              label="Sommi flag"
              checked={config.cipherShowSommiFlag}
              onChange={(v) => onApply({ cipherShowSommiFlag: v })}
            />
            <Toggle
              label="Sommi F. Wave"
              checked={config.cipherShowSommiFastWave}
              onChange={(v) => onApply({ cipherShowSommiFastWave: v })}
            />
          </div>
          <TFSelect
            label="F. Wave timeframe"
            value={config.cipherSommiVwapTF}
            onChange={(v) => onApply({ cipherSommiVwapTF: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="F. Wave bear <"
              value={config.cipherSommiVwapBearLevel}
              min={-200}
              max={200}
              onChange={(n) =>
                onApply({ cipherSommiVwapBearLevel: clamp(n, -200, 200) })
              }
            />
            <Field
              label="F. Wave bull >"
              value={config.cipherSommiVwapBullLevel}
              min={-200}
              max={200}
              onChange={(n) =>
                onApply({ cipherSommiVwapBullLevel: clamp(n, -200, 200) })
              }
            />
            <Field
              label="WT bear >"
              value={config.cipherSommiFlagWTBearLevel}
              min={-200}
              max={200}
              onChange={(n) =>
                onApply({ cipherSommiFlagWTBearLevel: clamp(n, -200, 200) })
              }
            />
            <Field
              label="WT bull <"
              value={config.cipherSommiFlagWTBullLevel}
              min={-200}
              max={200}
              onChange={(n) =>
                onApply({ cipherSommiFlagWTBullLevel: clamp(n, -200, 200) })
              }
            />
            <Field
              label="MFI bear <"
              value={config.cipherSommiRSIMFIBearLevel}
              min={-200}
              max={200}
              onChange={(n) =>
                onApply({ cipherSommiRSIMFIBearLevel: clamp(n, -200, 200) })
              }
            />
            <Field
              label="MFI bull >"
              value={config.cipherSommiRSIMFIBullLevel}
              min={-200}
              max={200}
              onChange={(n) =>
                onApply({ cipherSommiRSIMFIBullLevel: clamp(n, -200, 200) })
              }
            />
          </div>

          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            Sommi Diamond (multi-TF)
          </div>
          <Toggle
            label="Sommi diamond"
            checked={config.cipherShowSommiDiamond}
            onChange={(v) => onApply({ cipherShowSommiDiamond: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <TFSelect
              label="HTC Res. 1"
              value={config.cipherSommiHTCRes}
              onChange={(v) => onApply({ cipherSommiHTCRes: v })}
            />
            <TFSelect
              label="HTC Res. 2"
              value={config.cipherSommiHTCRes2}
              onChange={(v) => onApply({ cipherSommiHTCRes2: v })}
            />
            <Field
              label="WT bear >"
              value={config.cipherSommiDiamondWTBearLevel}
              min={-200}
              max={200}
              onChange={(n) =>
                onApply({ cipherSommiDiamondWTBearLevel: clamp(n, -200, 200) })
              }
            />
            <Field
              label="WT bull <"
              value={config.cipherSommiDiamondWTBullLevel}
              min={-200}
              max={200}
              onChange={(n) =>
                onApply({ cipherSommiDiamondWTBullLevel: clamp(n, -200, 200) })
              }
            />
          </div>

          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
            MACD Colors (multi-TF)
          </div>
          <Toggle
            label="Pintar WT con MACD del TF alto"
            checked={config.cipherShowMacdColors}
            onChange={(v) => onApply({ cipherShowMacdColors: v })}
          />
          <TFSelect
            label="MACD Colors TF"
            value={config.cipherMacdColorsTF}
            onChange={(v) => onApply({ cipherMacdColorsTF: v })}
          />
          <p className="text-[10px] text-tv-text-muted">
            Nota: el Pine pinta cada barra individualmente. Aquí se aplica el
            color del régimen MACD/MFI <em>actual</em> a toda la serie WT (un
            color global). Es un compromiso por limitaciones del motor de
            gráficos.
          </p>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-tv-text-muted hover:text-tv-text"
        >
          Reset defaults
        </Button>
        <Button size="sm" onClick={save} className="bg-tv-blue hover:bg-tv-blue/90">
          Aplicar
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  min = 2,
  max = 500,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {label}
      </span>
      <Input
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(n);
        }}
        className="bg-tv-bg tabular-nums"
      />
    </label>
  );
}

const TF_OPTIONS = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "12h",
  "1d",
  "3d",
  "1w",
] as const;

function TFSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs text-tv-text"
      >
        {TF_OPTIONS.map((tf) => (
          <option key={tf} value={tf}>
            {tf}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-tv-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 cursor-pointer accent-tv-blue"
      />
      <span>{label}</span>
    </label>
  );
}

function PlainSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-tv-border bg-tv-bg px-2 py-1 text-xs text-tv-text"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Como Field pero acepta decimales (los multiplicadores van de a 0.5). */
function FloatField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 0.5,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      {label !== "" && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-tv-text-muted">
          {label}
        </span>
      )}
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        className="bg-tv-bg tabular-nums"
      />
    </label>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** clamp para decimales (clamp() se usa con enteros en el resto del form). */
function clampF(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
