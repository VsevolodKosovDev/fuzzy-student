import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { fmt, intersectAlphaCuts, maxCommonAlpha, type FuzzyStudent } from "fuzzy-lib";
import { baseOptions, linearAxis, withAlpha, type ChartTheme } from "../theme";
import { MAX_ALPHA_VALUES } from "../config";
import { pickHandlers, type HoverHandler, type PickHandler } from "../chartPick";
import { Tex } from "./Tex";

interface Props {
  values: FuzzyStudent[];
  alpha: number;
  onAlpha: (alpha: number) => void;
  /** Вызывается, когда пользователь отпустил ползунок (для записи в журнал). */
  onCommit: () => void;
  /** Сколько величин выделено в таблице (0 — показаны последние величины множества). */
  selectedCount: number;
  /** Величина под курсором (в таблице или на графике). */
  hovered: FuzzyStudent | null;
  onHover: HoverHandler;
  onPick: PickHandler;
  theme: ChartTheme;
}

type Pt = { x: number; y: number | null };

/** Общий диапазон по x: где μ̃ ≥ 0.02 у всех показанных величин. */
function domain(values: FuzzyStudent[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    const w = v.alphaHalfWidth(0.02);
    lo = Math.min(lo, v.x0 - w);
    hi = Math.max(hi, v.x0 + w);
  }
  return [lo, hi];
}

function grid(lo: number, hi: number, extra: number[] = []): number[] {
  const xs = Array.from({ length: 241 }, (_, i) => lo + ((hi - lo) * i) / 240);
  return [...xs, ...extra].sort((a, b) => a - b);
}

/** Картинка «до» и «после» применения α (α-срезы). */
export function AlphaCutView({
  values,
  alpha,
  onAlpha,
  onCommit,
  selectedCount,
  hovered,
  onHover,
  onPick,
  theme,
}: Props) {
  const [lo, hi] = useMemo(() => domain(values), [values]);
  const cuts = useMemo(() => values.map((v) => v.alphaCut(alpha)), [values, alpha]);
  const inter = useMemo(
    () => (values.length > 0 ? intersectAlphaCuts(values, alpha) : null),
    [values, alpha],
  );
  const alphaMax = useMemo(() => maxCommonAlpha(values), [values]);
  const showCommon = values.length >= 2 && inter !== null && !inter.empty;

  const alphaLine = (label: string) => ({
    label,
    data: [
      { x: lo, y: alpha },
      { x: hi, y: alpha },
    ],
    borderColor: theme.textSecondary,
    backgroundColor: theme.textSecondary,
    borderDash: [6, 4],
    borderWidth: 1,
    pointRadius: 0,
  });

  const before = useMemo<ChartData<"line", Pt[]>>(
    () => ({
      datasets: [
        ...values.map((v, i) => ({
          label: v.name,
          data: grid(lo, hi).map((x) => ({ x, y: v.membershipNormalized(x) })),
          borderColor: theme.series[i],
          backgroundColor: theme.series[i],
          borderWidth: v === hovered ? 4.5 : 2,
          pointRadius: 0,
          pointHitRadius: 6,
          order: v === hovered ? -1 : 0,
        })),
        alphaLine(`α = ${alpha.toFixed(2)}`),
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, alpha, lo, hi, theme, hovered],
  );

  const after = useMemo<ChartData<"line", Pt[]>>(
    () => ({
      datasets: [
        ...values.flatMap((v, i) => {
          const cut = cuts[i];
          const color = theme.series[i];
          return [
            {
              label: v.name,
              // Часть графика, где μ̃(x) ≥ α; вне среза точек нет.
              data: grid(lo, hi, [cut.left, cut.right]).map((x) => {
                const y = v.membershipNormalized(x);
                return { x, y: x >= cut.left - 1e-12 && x <= cut.right + 1e-12 ? y : null };
              }),
              borderColor: color,
              backgroundColor: withAlpha(color, 0.12),
              fill: { target: { value: alpha } },
              borderWidth: v === hovered ? 4.5 : 2,
              pointRadius: 0,
              pointHitRadius: 6,
              spanGaps: false,
              order: v === hovered ? -1 : 0,
            },
            {
              label: "",
              // Сам α-срез — отрезок [left, right] на уровне α.
              data: [
                { x: cut.left, y: alpha },
                { x: cut.right, y: alpha },
              ],
              borderColor: color,
              backgroundColor: color,
              borderWidth: 4,
              pointRadius: 4,
              pointHoverRadius: 6,
            },
          ];
        }),
        alphaLine(`α = ${alpha.toFixed(2)}`),
        // Общее пересечение срезов — закрашенная полоса
        ...(showCommon
          ? [
              {
                label: "общее пересечение",
                data: [
                  { x: inter!.left, y: 1.05 },
                  { x: inter!.right, y: 1.05 },
                ],
                borderColor: withAlpha(theme.text, 0.5),
                backgroundColor: withAlpha(theme.text, theme.dark ? 0.16 : 0.1),
                borderWidth: 0,
                pointRadius: 0,
                fill: "origin" as const,
              },
            ]
          : []),
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values, cuts, alpha, lo, hi, theme, inter, showCommon, hovered],
  );

  // «До»: набор i — величина i. «После»: на каждую величину два набора (кривая и срез).
  const beforeOptions = useMemo(
    () => makeOptions((ds) => values[ds] ?? null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, lo, hi, values, onHover, onPick],
  );
  const afterOptions = useMemo(
    () => makeOptions((ds) => (ds < values.length * 2 ? values[Math.floor(ds / 2)] : null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, lo, hi, values, onHover, onPick],
  );

  function makeOptions(resolve: (ds: number) => FuzzyStudent | null) {
    const base = baseOptions(theme);
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
            label: (item: { dataset: { label?: string }; parsed: { y: number } }) =>
              `${item.dataset.label || "α-срез"}: μ̃ = ${fmt(item.parsed.y, 3)}`,
          },
        },
      },
      scales: {
        x: linearAxis(theme, "x", { min: lo, max: hi }),
        y: linearAxis(theme, "μ̃(x)", { min: 0, max: 1.05 }),
      },
    } as ChartOptions<"line">;
  }

  if (values.length === 0) {
    return <div className="chart-empty">Нет величин для отображения</div>;
  }

  return (
    <div className="alpha-view">
      <p className="source-note">
        {selectedCount === 0
          ? `Ничего не выделено — показаны последние ${values.length} ${values.length === 1 ? "величина" : "величины"} множества. Выделите свои в таблице (Ctrl + щелчок, до ${MAX_ALPHA_VALUES}).`
          : selectedCount > values.length
            ? `Показаны первые ${values.length} из ${selectedCount} выделенных величин.`
            : `Показаны выделенные в таблице величины: ${values.length}.`}
      </p>
      <div className="row alpha-slider">
        <label htmlFor="alpha">α = {alpha.toFixed(2)}</label>
        <input
          id="alpha"
          type="range"
          min={0.01}
          max={1}
          step={0.01}
          value={alpha}
          onChange={(e) => onAlpha(Number(e.target.value))}
          onPointerUp={onCommit}
          onKeyUp={onCommit}
        />
      </div>
      <p className="hint" style={{ marginBottom: 0 }}>
        Для среза функция принадлежности нормирована к высоте 1:
      </p>
      <Tex
        block
        tex={String.raw`\tilde\mu(x) = \frac{\varphi(x)}{\varphi(x_0)} = \left(1 + \frac{1}{\nu}\left(\frac{x - x_0}{s}\right)^2\right)^{-\frac{\nu+1}{2}},\qquad A_\alpha = \{\,x : \tilde\mu(x) \ge \alpha\,\}`}
      />
      <div className="two-charts">
        <figure>
          <figcaption>До применения α</figcaption>
          <div className="chart-box small">
            <Line data={before} options={beforeOptions} />
          </div>
        </figure>
        <figure>
          <figcaption>После применения α (α-срезы)</figcaption>
          <div className="chart-box small">
            <Line data={after} options={afterOptions} />
          </div>
        </figure>
      </div>
      <table className="compact">
        <thead>
          <tr>
            <th>Величина</th>
            <th className="num">α-срез</th>
            <th className="num">Ширина</th>
          </tr>
        </thead>
        <tbody>
          {values.map((v, i) => (
            <tr
              key={i}
              className={v === hovered ? "hovered" : undefined}
              onMouseEnter={() => onHover(v)}
              onMouseLeave={() => onHover(null)}
            >
              <td>
                <span className="swatch" style={{ background: theme.series[i] }} /> {v.name}
              </td>
              <td className="num">
                [{fmt(cuts[i].left, 3)}; {fmt(cuts[i].right, 3)}]
              </td>
              <td className="num">{fmt(cuts[i].right - cuts[i].left, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="steps intersection-card">
        <div className="steps-title">Пересечение α-срезов (α = {alpha.toFixed(2)})</div>
        {values.length < 2 || !inter ? (
          <p className="hint">
            Выделите в таблице две и более величины (Ctrl + щелчок) — здесь появится их общий диапазон.
          </p>
        ) : (
          <>
            <div className="intersection-result">
              {inter.empty ? (
                <>
                  Общий диапазон: <b>пусто (∅)</b>
                </>
              ) : (
                <>
                  Общий диапазон: <b>[{fmt(inter.left, 3)}; {fmt(inter.right, 3)}]</b>, ширина{" "}
                  <b>{fmt(inter.width, 3)}</b>
                </>
              )}
            </div>
            <p className="hint">
              {inter.empty
                ? `Нет такого x, которое подходило бы под все ${values.length} величины хотя бы на α = ${alpha.toFixed(2)}.`
                : `Любое x из этого диапазона подходит под все ${values.length} величины одновременно — у каждой степень не ниже ${alpha.toFixed(2)}.`}
            </p>
            <ol className="tex-steps">
              <li>
                <Tex
                  tex={String.raw`L = \max_i \operatorname{left}(A_i) = \max(${cuts.map((c) => fmt(c.left, 3)).join(";\\,")}) = ${fmt(inter.left, 3)}`}
                />{" "}
                <span className="hint">— у {values[inter.leftFrom].name}</span>
              </li>
              <li>
                <Tex
                  tex={String.raw`R = \min_i \operatorname{right}(A_i) = \min(${cuts.map((c) => fmt(c.right, 3)).join(";\\,")}) = ${fmt(inter.right, 3)}`}
                />{" "}
                <span className="hint">— у {values[inter.rightFrom].name}</span>
              </li>
              <li>
                <Tex
                  tex={
                    inter.empty
                      ? String.raw`L = ${fmt(inter.left, 3)} > R = ${fmt(inter.right, 3)} \;\Rightarrow\; \bigcap_i A_{i,\alpha} = \varnothing`
                      : String.raw`L \le R \;\Rightarrow\; \bigcap_i A_{i,\alpha} = [L;\,R] = [${fmt(inter.left, 3)};\,${fmt(inter.right, 3)}],\quad R - L = ${fmt(inter.width, 3)}`
                  }
                />
              </li>
              <li>
                <Tex tex={String.raw`\bigcap_i A_{i,\alpha} \ne \varnothing \iff \alpha \le \min_{i<j} \operatorname{Poss}(A_i = A_j) = ${fmt(alphaMax, 3)}`} />
                <span className="hint">
                  {alpha <= alphaMax + 1e-9 ? " — текущее α в этих пределах." : " — текущее α больше, поэтому пусто."}
                </span>
              </li>
            </ol>
            {values.length <= 4 && (
              <table className="compact">
                <thead>
                  <tr>
                    <th>Пара</th>
                    <th className="num">Пересечение срезов</th>
                    <th className="num">Ширина</th>
                    <th className="num">
                      <Tex tex={String.raw`\operatorname{Poss}(A_i = A_j)`} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {values.flatMap((vi, i) =>
                    values.slice(i + 1).map((vj, d) => {
                      const j = i + 1 + d;
                      const p = intersectAlphaCuts([vi, vj], alpha);
                      return (
                        <tr key={`${i}-${j}`}>
                          <td>
                            <span className="swatch" style={{ background: theme.series[i] }} /> ∩{" "}
                            <span className="swatch" style={{ background: theme.series[j] }} /> {i + 1} и {j + 1}
                          </td>
                          <td className="num">{p.empty ? "∅" : `[${fmt(p.left, 3)}; ${fmt(p.right, 3)}]`}</td>
                          <td className="num">{fmt(p.width, 3)}</td>
                          <td className="num">{fmt(vi.possibilityEqual(vj), 3)}</td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className="steps">
        <div className="steps-title">Расчёт α-среза для {values[0].name}</div>
        <ol className="tex-steps">
          {values[0].explainAlphaCutTex(alpha).map((s, i) => (
            <li key={i}>
              <Tex tex={s} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
