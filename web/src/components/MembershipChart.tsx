import { useMemo, useRef } from "react";
import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { fmt, type FuzzyStudent } from "fuzzy-lib";
import { baseOptions, linearAxis, withAlpha, type ChartTheme } from "../theme";
import { pickHandlers, type HoverHandler, type PickHandler } from "../chartPick";

interface Props {
  /** Фоновые величины (последние N множества). */
  background: FuzzyStudent[];
  /** Выделенные величины — рисуются цветом и подписываются в легенде. */
  highlighted: FuzzyStudent[];
  /** Величина под курсором (в таблице или на графике). */
  hovered: FuzzyStudent | null;
  onHover: HoverHandler;
  onPick: PickHandler;
  theme: ChartTheme;
}

type Pt = { x: number; y: number };

/**
 * Точки графика φ(x). В примере у нормальной величины — отрезок x₀ ± 3σ.
 * У Стьюдента хвосты длиннее, поэтому рисуем до 1 % от высоты вершины:
 * при ν = 30 это ≈ x₀ ± 3s, при ν = 1 — ≈ x₀ ± 10s; кривая доходит до оси, а не обрывается.
 */
function curve(fv: FuzzyStudent): Pt[] {
  const half = fv.alphaHalfWidth(0.01);
  const pts: Pt[] = [];
  for (let i = -80; i <= 80; i++) {
    const x = fv.x0 + (i * half) / 80;
    pts.push({ x, y: fv.membership(x) });
  }
  return pts;
}

/** Функции принадлежности φ(x) (как redraw() в gui.py). */
export function MembershipChart({ background, highlighted, hovered, onHover, onPick, theme }: Props) {
  // Величина для каждого набора данных — для подсказки и щелчка по кривой.
  const dsValuesRef = useRef<FuzzyStudent[]>([]);

  const data = useMemo<ChartData<"line", Pt[]>>(() => {
    const hl = new Set(highlighted);
    const bg = background.filter((v) => !hl.has(v));
    // Наведённая величина рисуется поверх всех — даже если её нет среди последних N.
    const hov = hovered ? [hovered] : [];
    dsValuesRef.current = [...bg, ...highlighted, ...hov];
    return {
      datasets: [
        ...bg.map((fv, i) => ({
          label: i === 0 ? `Остальные (${bg.length})` : "",
          data: curve(fv),
          borderColor: withAlpha(theme.muted, 0.45),
          backgroundColor: withAlpha(theme.muted, 0.45),
          borderWidth: 1,
          pointRadius: 0,
          pointHitRadius: 4,
          order: 2,
        })),
        ...highlighted.map((fv, i) => ({
          label: fv.name,
          data: curve(fv),
          borderColor: theme.series[i],
          backgroundColor: theme.series[i],
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 6,
          order: 1,
        })),
        ...hov.map((fv) => ({
          label: "",
          data: curve(fv),
          borderColor: theme.text,
          backgroundColor: theme.text,
          borderWidth: 3,
          pointRadius: 0,
          pointHitRadius: 6,
          order: -1,
        })),
      ],
    };
  }, [background, highlighted, hovered, theme]);

  const options = useMemo(() => {
    const base = baseOptions(theme);
    const resolve = (ds: number) => dsValuesRef.current[ds] ?? null;
    return {
      ...base,
      ...pickHandlers(resolve, onHover, onPick),
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        ...base.plugins,
        legend: {
          ...base.plugins.legend,
          labels: { ...base.plugins.legend.labels, filter: (item: { text: string }) => item.text !== "" },
        },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: {
            title: (items: { parsed: { x: number } }[]) => `x = ${fmt(items[0]?.parsed.x ?? 0, 3)}`,
            label: (item: { datasetIndex: number; parsed: { y: number } }) =>
              `${dsValuesRef.current[item.datasetIndex]?.name ?? "величина"}: φ = ${fmt(item.parsed.y, 4)}`,
          },
        },
      },
      scales: {
        x: linearAxis(theme, "x"),
        y: linearAxis(theme, "φ(x)", { beginAtZero: true }),
      },
    } as ChartOptions<"line">;
  }, [theme, onHover, onPick]);

  if (background.length === 0 && highlighted.length === 0) {
    return <div className="chart-empty">Нет величин для отображения</div>;
  }
  return (
    <div className="chart-box">
      <Line data={data} options={options} />
    </div>
  );
}
