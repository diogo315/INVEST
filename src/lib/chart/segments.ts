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

export interface Segment {
  fromTime: number;
  fromValue: number;
  toTime: number;
  toValue: number;
  color: string;
}

/**
 * Dibuja tramos rectos sueltos (las líneas de divergencia).
 *
 * No se usa una serie de líneas con whitespace entre tramo y tramo porque
 * lightweight-charts igual une el final de un tramo con el inicio del
 * siguiente, y quedaban líneas continuas falsas de días de largo. Con un
 * primitive cada tramo es un trazo independiente.
 */
export class SegmentsOverlay implements ISeriesPrimitive<Time> {
  private _segments: Segment[] = [];
  private _visible = true;
  private readonly _paneViews: IPrimitivePaneView[];

  constructor(
    private readonly _chart: IChartApi,
    private readonly _series: ISeriesApi<SeriesType>,
    private readonly _lineWidth = 2,
  ) {
    const renderer: IPrimitivePaneRenderer = {
      draw: (target: CanvasRenderingTarget2D) => this._draw(target),
    };
    this._paneViews = [
      {
        zOrder: () => "top",
        renderer: () =>
          this._visible && this._segments.length > 0 ? renderer : null,
      },
    ];
  }

  setData(segments: Segment[]): void {
    this._segments = segments;
  }

  setVisible(v: boolean): void {
    this._visible = v;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  private _draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      const ts = this._chart.timeScale();
      const series = this._series;
      ctx.save();
      ctx.lineWidth = this._lineWidth;
      ctx.lineCap = "round";
      for (const s of this._segments) {
        const x1 = ts.timeToCoordinate(s.fromTime as unknown as Time);
        const x2 = ts.timeToCoordinate(s.toTime as unknown as Time);
        const y1 = series.priceToCoordinate(s.fromValue);
        const y2 = series.priceToCoordinate(s.toValue);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
        ctx.strokeStyle = s.color;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
}
