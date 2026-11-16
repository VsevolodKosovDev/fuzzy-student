import { useEffect, useMemo, useRef, useState } from "react";
import { LINKAGE_NAMES, dendrogramLinks, fmt, type HierarchicalResult } from "fuzzy-lib";
import type { ChartTheme } from "../theme";
import { clustersText } from "../util";

interface Props {
  result: HierarchicalResult;
  theme: ChartTheme;
}

const HEIGHT = 400;
const M = { left: 52, right: 12, top: 26, bottom: 30 };

/** «Красивый» шаг делений оси. */
function niceStep(range: number, ticks = 5): number {
  const raw = range / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Дендрограмма, окрашенная под текущий разрез, с линией среза. */
export function Dendrogram({ result, theme }: Props) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const { tree, labels, mergeLabels, threshold, k } = result;
  const links = useMemo(() => dendrogramLinks(tree), [tree]);

  const n = tree.n;
  const rootH = tree.merges.length ? tree.merges[tree.merges.length - 1].height : 1;
  const maxH = Math.max(rootH, threshold) * 1.08 || 1;
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const xs = (pos: number) => M.left + ((pos + 0.5) * plotW) / n;
  const ys = (h: number) => M.top + plotH * (1 - h / maxH);

  const step = niceStep(maxH);
  const ticks: number[] = [];
  for (let v = 0; v <= maxH + 1e-9; v += step) ticks.push(v);

  const strokeW = n > 150 ? 1 : 1.4;
  const cutY = ys(threshold);
  const color = (label: number | null) => (label === null ? theme.muted : theme.series[label]);

  return (
    <div ref={ref} className="dendrogram">
      <svg width={width} height={HEIGHT} role="img" aria-label={`Дендрограмма, ${clustersText(k)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={ys(t)} y2={ys(t)} stroke={theme.grid} />
            <text x={M.left - 6} y={ys(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={theme.muted}>
              {fmt(t, 2)}
            </text>
          </g>
        ))}
        <text
          transform={`translate(14 ${M.top + plotH / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={12}
          fill={theme.textSecondary}
        >
          расстояние слияния
        </text>

        {links.map((l) => {
          const d = `M${xs(l.leftX)},${ys(l.leftY)} V${ys(l.height)} H${xs(l.rightX)} V${ys(l.rightY)}`;
          return (
            <g key={l.index}>
              <path d={d} fill="none" stroke={color(mergeLabels[l.index])} strokeWidth={strokeW} />
              <path d={d} fill="none" stroke="transparent" strokeWidth={8}>
                <title>
                  Слияние {l.index + 1}: {l.size} вел., расстояние {fmt(l.height, 3)}
                </title>
              </path>
            </g>
          );
        })}

        {/* Цветная полоса под листьями — принадлежность величин кластерам */}
        {tree.leafOrder.map((leaf, pos) => (
          <rect
            key={leaf}
            x={M.left + (pos * plotW) / n}
            y={M.top + plotH + 6}
            width={Math.max(plotW / n, 1)}
            height={8}
            fill={theme.series[labels[leaf]]}
          />
        ))}
        <text x={M.left} y={HEIGHT - 4} fontSize={11} fill={theme.muted}>
          {n} величин (листья), метод {LINKAGE_NAMES[tree.method]}
        </text>

        <line
          x1={M.left}
          x2={width - M.right}
          y1={cutY}
          y2={cutY}
          stroke={theme.text}
          strokeDasharray="6 4"
          strokeWidth={1.5}
        />
        <text x={width - M.right} y={cutY - 6} textAnchor="end" fontSize={12} fill={theme.text}>
          срез h = {fmt(threshold, 2)} → k = {k}
        </text>
      </svg>
    </div>
  );
}
