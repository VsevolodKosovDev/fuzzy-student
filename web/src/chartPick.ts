import type { ActiveElement, Chart, ChartEvent } from "chart.js";
import type { FuzzyStudent } from "fuzzy-lib";

/** Навели на величину (null — увели мышь). */
export type HoverHandler = (value: FuzzyStudent | null) => void;
/** Щелчок по величине на графике; additive — с Ctrl (добавить к выделению). */
export type PickHandler = (value: FuzzyStudent, additive: boolean) => void;

/** Какая величина нарисована точкой index набора данных datasetIndex. */
export type Resolve = (datasetIndex: number, index: number) => FuzzyStudent | null;

/**
 * Обработчики Chart.js для связи графика с таблицей:
 * наведение подсвечивает строку, щелчок выделяет величину.
 * Кривая считается «под курсором», если ближайшая её точка не дальше maxDist пикселей.
 */
export function pickHandlers(resolve: Resolve, onHover: HoverHandler, onPick: PickHandler, maxDist = 18) {
  const nearest = (e: ChartEvent, elements: ActiveElement[]): FuzzyStudent | null => {
    const el = elements[0];
    if (!el || e.x == null || e.y == null) return null;
    if (Math.hypot(el.element.x - e.x, el.element.y - e.y) > maxDist) return null;
    return resolve(el.datasetIndex, el.index);
  };

  return {
    onHover: (e: ChartEvent, elements: ActiveElement[], chart: Chart) => {
      const v = e.type === "mouseout" ? null : nearest(e, elements);
      chart.canvas.style.cursor = v ? "pointer" : "default";
      onHover(v);
    },
    onClick: (e: ChartEvent, elements: ActiveElement[]) => {
      const v = nearest(e, elements);
      if (!v) return;
      const native = e.native as MouseEvent | null;
      onPick(v, Boolean(native && (native.ctrlKey || native.metaKey)));
    },
  };
}
