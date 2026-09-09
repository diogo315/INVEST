import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

export interface BandPoint {
  time: number;
  upper: number;
  lower: number;
  /** true en la primera vela de un período de anclaje: corta el relleno ahí. */
  isNew?: boolean;
}

/**
 * Relleno translúcido entre dos series (banda superior e inferior).
 *
 * lightweight-charts no tiene un equivalente al `fill()` de Pine, así que se
 * dibuja como un series primitive: un polígono por cada tramo continuo, con
 * las coordenadas que da la propia serie para que quede alineado con el eje
 * de precios en cualquier zoom.
 */
export class BandFill implements ISeriesPrimitive<Time> {
  private _points: BandPoint[] = [];
  private _visible = true;
  private readonly _paneViews: IPrimitivePaneView[];

  constructor(
    private readonly _chart: IChartApi,
    private readonly _series: ISeriesApi<SeriesType>,
    private _color: string,
  ) {
    const renderer: IPrimitivePaneRenderer = {
      draw: (target: CanvasRenderingTarget2D) => this._draw(target),
    };
    this._paneViews = [
      {
        // Debajo de las líneas y de las velas: es un fondo, no una marca.
        zOrder: () => "bottom",
        renderer: () =>
          this._visible && this._points.length > 1 ? renderer : null,
      },
    ];
  }

  setData(points: BandPoint[]): void {
    this._points = points;
  }

  setVisible(v: boolean): void {
    this._visible = v;
  }

  setColor(c: string): void {
    this._color = c;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  private _draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const ts = this._chart.timeScale();
      const series = this._series;

      // Un polígono por tramo: al reiniciarse el anclaje el VWAP salta, y
      // un solo polígono pintaría una cuña vertical enorme entre sesiones.
      let seg: Array<{ x: number; yu: number; yl: number }> = [];
      const flush = () => {
        if (seg.length > 1) {
          ctx.beginPath();
          ctx.moveTo(seg[0].x, seg[0].yu);
          for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i].x, seg[i].yu);
          for (let i = seg.length - 1; i >= 0; i--) ctx.lineTo(seg[i].x, seg[i].yl);
          ctx.closePath();
          ctx.fill();
        }
        seg = [];
      };

      ctx.save();
      ctx.fillStyle = this._color;
      for (const p of this._points) {
        if (p.isNew) flush();
        const x = ts.timeToCoordinate(p.time as unknown as Time);
        const yu = series.priceToCoordinate(p.upper);
        const yl = series.priceToCoordinate(p.lower);
        if (x === null || yu === null || yl === null) continue;
        // Descartamos lo que quedó fuera del viewport para no pintar de más.
        if (x < -50 || x > mediaSize.width + 50) {
          if (seg.length > 1) flush();
          else seg = [];
          continue;
        }
        seg.push({ x, yu, yl });
      }
      flush();
      ctx.restore();
    });
  }
}

export interface ZonePoint {
  time: number;
  value: number;
}

/**
 * Relleno degradado entre una serie y un nivel fijo, con el degradado
 * definido en precio (no en píxeles): equivale al
 * `fill(plot, midLine, topValue, bottomValue, top_color, bottom_color)`
 * de Pine.
 *
 * El RSI de TradingView lo usa dos veces: verde entre 100 y 70 (opaco
 * arriba, transparente en 70) y rojo entre 30 y 0. Como el color de abajo
 * es totalmente transparente, solo se ve la zona de sobrecompra/sobreventa
 * aunque el polígono llegue hasta la línea media.
 */
export class ZoneGradientFill implements ISeriesPrimitive<Time> {
  private _points: ZonePoint[] = [];
  private _visible = true;
  private readonly _paneViews: IPrimitivePaneView[];

  constructor(
    private readonly _chart: IChartApi,
    private readonly _series: ISeriesApi<SeriesType>,
    private readonly _baseline: number,
    private readonly _topValue: number,
    private readonly _topColor: string,
    private readonly _bottomValue: number,
    private readonly _bottomColor: string,
  ) {
    const renderer: IPrimitivePaneRenderer = {
      draw: (target: CanvasRenderingTarget2D) => this._draw(target),
    };
    this._paneViews = [
      {
        zOrder: () => "bottom",
        renderer: () =>
          this._visible && this._points.length > 1 ? renderer : null,
      },
    ];
  }

  setData(points: ZonePoint[]): void {
    this._points = points;
  }

  setVisible(v: boolean): void {
    this._visible = v;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  private _draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const ts = this._chart.timeScale();
      const series = this._series;

      const yTop = series.priceToCoordinate(this._topValue);
      const yBottom = series.priceToCoordinate(this._bottomValue);
      const yBase = series.priceToCoordinate(this._baseline);
      if (yTop === null || yBottom === null || yBase === null) return;

      const grad = ctx.createLinearGradient(0, yTop, 0, yBottom);
      grad.addColorStop(0, this._topColor);
      grad.addColorStop(1, this._bottomColor);

      const pts: Array<{ x: number; y: number }> = [];
      for (const p of this._points) {
        const x = ts.timeToCoordinate(p.time as unknown as Time);
        const y = series.priceToCoordinate(p.value);
        if (x === null || y === null) continue;
        if (x < -50 || x > mediaSize.width + 50) continue;
        pts.push({ x, y });
      }
      if (pts.length < 2) return;

      ctx.save();
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[pts.length - 1].x, yBase);
      ctx.lineTo(pts[0].x, yBase);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }
}
