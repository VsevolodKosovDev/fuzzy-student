import { useMemo, useRef } from "react";
import { Scatter } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { fmt, type FuzzyStudent, type Point } from "fuzzy-lib";
import { POINT_STYLES, baseOptions, isStrokeOnly, linearAxis, type ChartTheme } from "../theme";
import { pickHandlers, type HoverHandler, type PickHandler } from "../chartPick";

interface Props {
  items: FuzzyStudent[];
  clusters: FuzzyStudent[][] | null;
  centroids: Point[] | null;
  /** Величина под курсором (в таблице или на графике). */
  hovered: FuzzyStudent | null;
  onHover: HoverHandler;
  onPick: PickHandler;
  theme: ChartTheme;
  height?: number;
}

/** Точка графика; v — какая величина в ней нарисована (для щелчка и наведения). */
type Pt = { x: number; y: number; name?: string; v?: FuzzyStudent };

/** Величины как точки (x₀, s), раскрашенные по кластерам (show_clusters в gui.py). */
export function ClusterScatter({ items, clusters, centroids, hovered, onHover, onPick, theme, height }: Props) {
  const base = useMemo<ChartData<"scatter", Pt[]>>(() => {
    if (!clusters) {
      return {
        datasets: [
          {
            label: "Величины",
            data: items.map((v) => ({ x: v.x0, y: v.s, name: v.name, v })),
            backgroundColor: theme.series[0],
            borderColor: theme.surface,
            borderWidth: 1,
            pointRadius: 4,
          },
        ],
      };
    }
    return {
      datasets: [
        ...clusters.map((c, j) => {
          const { style, rotation } = POINT_STYLES[j];
          const strokeOnly = isStrokeOnly(style);
          return {
            label: `Кластер ${j + 1} (${c.length})`,
            data: c.map((v) => ({ x: v.x0, y: v.s, name: v.name, v })),
            backgroundColor: theme.series[j],
            // Контурные маркеры рисуются цветом кластера, залитые — с тонкой окантовкой цвета фона.
            borderColor: strokeOnly ? theme.series[j] : theme.surface,
            borderWidth: strokeOnly ? 2 : 1,
            pointStyle: style,
            rotation,
            pointRadius: 5,
            pointHoverRadius: 7,
          };
        }),
        {
          label: "Центры",
          data: (centroids ?? []).map(([x, y], j) => ({ x, y, name: `центр ${j + 1}` })),
          backgroundColor: theme.text,
          borderColor: theme.text,
          borderWidth: 2,
          pointStyle: "crossRot" as const,
          pointRadius: 9,
          pointHoverRadius: 10,
        },
      ],
    };
  }, [items, clusters, centroids, theme]);

  // Наведённая величина — кольцо вокруг её точки, поверх всех.
  const data = useMemo<ChartData<"scatter", Pt[]>>(() => {
    if (!hovered || !items.includes(hovered)) return base;
    return {
      datasets: [
        ...base.datasets,
        {
          label: "",
          data: [{ x: hovered.x0, y: hovered.s, name: hovered.name, v: hovered }],
          backgroundColor: "transparent",
          borderColor: theme.text,
          borderWidth: 2.5,
          pointRadius: 11,
          pointHoverRadius: 11,
          order: -1,
        },
      ],
    };
  }, [base, hovered, items, theme]);

  const dataRef = useRef(data);
  dataRef.current = data;

  const options = useMemo(() => {
    const opts = baseOptions(theme);
    const resolve = (ds: number, idx: number) => dataRef.current.datasets[ds]?.data[idx]?.v ?? null;
    return {
      ...opts,
      ...pickHandlers(resolve, onHover, onPick, 12),
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        ...opts.plugins,
        legend: {
          ...opts.plugins.legend,
          labels: {
            ...opts.plugins.legend.labels,
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            filter: (item: { text: string }) => item.text !== "",
          },
        },
        tooltip: {
          ...opts.plugins.tooltip,
          callbacks: {
            label: (item: { raw: Pt; dataset: { label?: string } }) =>
              `${item.raw.name ?? ""} — x₀ = ${fmt(item.raw.x, 3)}, s = ${fmt(item.raw.y, 3)} (${item.dataset.label})`,
          },
        },
      },
      scales: {
        x: linearAxis(theme, "x₀"),
        y: linearAxis(theme, "s"),
      },
    } as ChartOptions<"scatter">;
  }, [theme, onHover, onPick]);

  if (items.length === 0) {
    return <div className="chart-empty">Нет величин для отображения</div>;
  }
  return (
    <div className="chart-box" style={height ? { height } : undefined}>
      <Scatter data={data} options={options} />
    </div>
  );
}
