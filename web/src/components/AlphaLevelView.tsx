import { useMemo, useRef, useState } from "react";
import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { alphaDegree, fmt, type AlphaCriterion, type FuzzyStudent } from "fuzzy-lib";
import { baseOptions, linearAxis, withAlpha, type ChartTheme } from "../theme";
import { parseNum } from "../util";
import { pickHandlers, type HoverHandler, type PickHandler } from "../chartPick";
import { Tex } from "./Tex";

export type CriterionKind = AlphaCriterion["kind"];

interface Props {
  values: FuzzyStudent[];
  /** Выбранная величина A (первая выделенная в таблице). */
  reference: FuzzyStudent | undefined;
  alpha: number;
  onAlpha: (alpha: number) => void;
  /** Отпущен ползунок / сменён критерий — записать итог в журнал. */
  onCommit: (message: string) => void;
  /** Выделить прошедшие величины как подмножество. */
  onMakeSubset: (indices: number[], description: string) => void;
  /** Величина под курсором (в таблице или на графике). */
  hovered: FuzzyStudent | null;
  onHover: HoverHandler;
  onPick: PickHandler;
  theme: ChartTheme;
}

type Pt = { x: number; y: number | null };

const KIND_LABELS: Record<CriterionKind, { text: string; tex: string }> = {
  possibility: {
    text: "Совпадение с A: α-срезы A и B пересекаются",
    tex: String.raw`A_\alpha \cap B_\alpha \ne \varnothing \iff \operatorname{Poss}(A = B) \ge \alpha`,
  },
  point: { text: "Точка x* лежит в α-срезе B", tex: String.raw`\tilde\mu_B(x^*) \ge \alpha` },
  window: {
    text: "α-срез B пересекает окно [a; b]",
    tex: String.raw`B_\alpha \cap [a;\,b] \ne \varnothing`,
  },
};

const GRID = 121;

/** Общий диапазон по x — где μ̃ ≥ 0.05 хотя бы у одной величины. */
function domain(values: FuzzyStudent[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    const w = v.alphaHalfWidth(0.05);
    lo = Math.min(lo, v.x0 - w);
    hi = Math.max(hi, v.x0 + w);
  }
  return [lo, hi];
}

/**
 * Вкладка «Величины и α-уровень»: все кривые μ̃(x) тонкими линиями, линия α,
 * отбор величин по критерию, число прошедших и подмножество из них.
 */
export function AlphaLevelView(props: Props) {
  const { values, reference, alpha, theme } = props;
  const [kind, setKind] = useState<CriterionKind>("possibility");
  const [xStar, setXStar] = useState("0");
  const [win, setWin] = useState({ a: "-2", b: "2" });

  const criterion = useMemo<AlphaCriterion | null>(() => {
    if (kind === "possibility") return reference ? { kind, reference } : null;
    if (kind === "point") {
      const x = parseNum(xStar);
      return Number.isFinite(x) ? { kind, x } : null;
    }
    const a = parseNum(win.a);
    const b = parseNum(win.b);
    return Number.isFinite(a) && Number.isFinite(b) ? { kind, a: Math.min(a, b), b: Math.max(a, b) } : null;
  }, [kind, reference, xStar, win]);

  // Степени не зависят от α — пересчитываются только при смене критерия.
  const degrees = useMemo(
    () => (criterion ? values.map((v) => alphaDegree(v, criterion)) : null),
    [values, criterion],
  );
  const passing = useMemo(
    () => (degrees ? degrees.map((d) => d >= alpha - 1e-12) : values.map(() => false)),
    [degrees, alpha, values],
  );
  const passCount = passing.filter(Boolean).length;

  const [lo, hi] = useMemo(() => domain(values), [values]);
  const curves = useMemo(
    () =>
      values.map((v) =>
        Array.from({ length: GRID }, (_, i) => {
          const x = lo + ((hi - lo) * i) / (GRID - 1);
          return { x, y: v.membershipNormalized(x) };
        }),
      ),
    [values, lo, hi],
  );

  const describe = (): string => {
    if (!criterion) return "критерий не задан";
    switch (criterion.kind) {
      case "possibility":
        return `Poss(${criterion.reference.name} = B) ≥ ${alpha.toFixed(2)}`;
      case "point":
        return `μ̃(${fmt(criterion.x)}) ≥ ${alpha.toFixed(2)}`;
      case "window":
        return `α-срез (α = ${alpha.toFixed(2)}) пересекает [${fmt(criterion.a)}; ${fmt(criterion.b)}]`;
    }
  };

  // Имя и сама величина для каждого набора данных — для подсказки и щелчка по кривой.
  const namesRef = useRef<string[]>([]);
  const dsValuesRef = useRef<FuzzyStudent[]>([]);

  const data = useMemo<ChartData<"line", Pt[]>>(() => {
    const names: string[] = [];
    const dsValues: FuzzyStudent[] = [];
    const failColor = withAlpha(theme.muted, theme.dark ? 0.35 : 0.3);
    const passColor = theme.series[0];
    const refColor = theme.series[1];
    let firstFail = true;
    let firstPass = true;
    const datasets: ChartData<"line", Pt[]>["datasets"] = [];

    // Не прошедшие — снизу, прошедшие — поверх.
    values.forEach((v, i) => {
      if (passing[i] || v === reference) return;
      names.push(`${v.name} — не подходит (степень ${fmt(degrees?.[i] ?? 0, 3)})`);
      dsValues.push(v);
      datasets.push({
        label: firstFail ? `Не подходят (${values.length - passCount})` : "",
        data: curves[i],
        borderColor: failColor,
        backgroundColor: failColor,
        borderWidth: 1,
        pointRadius: 0,
        pointHitRadius: 3,
        order: 3, // меньший order рисуется поверх
      });
      firstFail = false;
    });
    values.forEach((v, i) => {
      if (!passing[i] || v === reference) return;
      names.push(`${v.name} — подходит (степень ${fmt(degrees?.[i] ?? 0, 3)})`);
      dsValues.push(v);
      datasets.push({
        label: firstPass ? `Подходят (${passCount})` : "",
        data: curves[i],
        borderColor: passColor,
        backgroundColor: passColor,
        borderWidth: 1.25,
        pointRadius: 0,
        pointHitRadius: 3,
        order: 2,
      });
      firstPass = false;
    });
    const refIndex = reference ? values.indexOf(reference) : -1;
    if (refIndex >= 0) {
      names.push(`A: ${reference!.name}`, `α-срез A`);
      dsValues.push(reference!, reference!);
      datasets.push({
        label: `A: ${reference!.name}`,
        data: curves[refIndex],
        borderColor: refColor,
        backgroundColor: refColor,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHitRadius: 4,
        order: 0,
      });
      // α-срез A — отрезок на уровне α
      const cut = reference!.alphaCut(alpha);
      datasets.push({
        label: "",
        data: [
          { x: cut.left, y: alpha },
          { x: cut.right, y: alpha },
        ],
        borderColor: refColor,
        backgroundColor: refColor,
        borderWidth: 4,
        pointRadius: 4,
        order: 0,
      });
    }
    datasets.push({
      label: `α = ${alpha.toFixed(2)}`,
      data: [
        { x: lo, y: alpha },
        { x: hi, y: alpha },
      ],
      borderColor: theme.text,
      backgroundColor: theme.text,
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      order: 1,
    });
    if (criterion?.kind === "window") {
      datasets.push({
        label: `окно [${fmt(criterion.a)}; ${fmt(criterion.b)}]`,
        data: [
          { x: criterion.a, y: 1.05 },
          { x: criterion.b, y: 1.05 },
        ],
        borderColor: withAlpha(theme.textSecondary, 0.6),
        backgroundColor: withAlpha(theme.textSecondary, 0.12),
        borderWidth: 0,
        pointRadius: 0,
        fill: "origin",
      });
    }
    if (criterion?.kind === "point") {
      datasets.push({
        label: `x* = ${fmt(criterion.x)}`,
        data: [
          { x: criterion.x, y: 0 },
          { x: criterion.x, y: 1.05 },
        ],
        borderColor: theme.textSecondary,
        backgroundColor: theme.textSecondary,
        borderDash: [2, 3],
        borderWidth: 1.5,
        pointRadius: 0,
      });
    }
    namesRef.current = names;
    dsValuesRef.current = dsValues;
    return { datasets };
  }, [values, curves, passing, passCount, reference, alpha, criterion, lo, hi, theme, degrees]);

  // Наведённая величина (из таблицы или с графика) — поверх всех, толстой контрастной линией.
  const hoveredRef = useRef<FuzzyStudent | null>(null);
  hoveredRef.current = props.hovered;
  const chartData = useMemo<ChartData<"line", Pt[]>>(() => {
    const i = props.hovered ? values.indexOf(props.hovered) : -1;
    if (i < 0) return data;
    return {
      datasets: [
        ...data.datasets,
        {
          label: "",
          data: curves[i],
          borderColor: theme.text,
          backgroundColor: theme.text,
          borderWidth: 3,
          pointRadius: 0,
          pointHitRadius: 4,
          order: -1,
        },
      ],
    };
  }, [data, props.hovered, values, curves, theme]);

  const { onHover, onPick } = props;
  const options = useMemo(() => {
    const base = baseOptions(theme);
    // Набор данных → величина: кривые величин идут первыми, наведённая — последней.
    const resolve = (ds: number) =>
      ds < dsValuesRef.current.length ? dsValuesRef.current[ds] : ds === data.datasets.length ? hoveredRef.current : null;
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
          // Подсказка только для кривых величин (не для линии α, окна и т. п.).
          filter: (item: { datasetIndex: number }) => item.datasetIndex < namesRef.current.length,
          callbacks: {
            title: (items: { parsed: { x: number } }[]) => `x = ${fmt(items[0]?.parsed.x ?? 0, 3)}`,
            label: (item: { datasetIndex: number; parsed: { y: number } }) =>
              `${namesRef.current[item.datasetIndex] ?? ""}: μ̃ = ${fmt(item.parsed.y, 3)}`,
          },
        },
      },
      scales: {
        x: linearAxis(theme, "x", { min: lo, max: hi }),
        y: linearAxis(theme, "μ̃(x)", { min: 0, max: 1.05 }),
      },
    } as ChartOptions<"line">;
  }, [theme, lo, hi, onHover, onPick, data]);

  const passIndices = passing.flatMap((p, i) => (p ? [i] : []));
  const commit = () => props.onCommit(`α-уровень: ${describe()} — подходят ${passCount} из ${values.length}`);

  if (values.length === 0) {
    return <div className="chart-empty">Сгенерируйте или добавьте величины</div>;
  }

  const cut = reference?.alphaCut(alpha);

  return (
    <div className="alpha-level">
      <div className="row alpha-slider">
        <label htmlFor="alpha-level">α = {alpha.toFixed(2)}</label>
        <input
          id="alpha-level"
          type="range"
          min={0.01}
          max={1}
          step={0.01}
          value={alpha}
          onChange={(e) => props.onAlpha(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
        />
      </div>

      <div className="criteria" role="radiogroup" aria-label="Критерий отбора">
        {(Object.keys(KIND_LABELS) as CriterionKind[]).map((k) => (
          <label key={k}>
            <input type="radio" checked={kind === k} onChange={() => setKind(k)} />
            {KIND_LABELS[k].text}: <Tex tex={KIND_LABELS[k].tex} />
            {k === "point" && kind === "point" && (
              <input value={xStar} onChange={(e) => setXStar(e.target.value)} size={5} aria-label="x*" />
            )}
            {k === "window" && kind === "window" && (
              <>
                <input value={win.a} onChange={(e) => setWin({ ...win, a: e.target.value })} size={4} aria-label="a" />
                <input value={win.b} onChange={(e) => setWin({ ...win, b: e.target.value })} size={4} aria-label="b" />
              </>
            )}
          </label>
        ))}
      </div>

      <div className="alpha-level-grid">
        <aside className="value-card">
          <h3>Выбранная величина A</h3>
          {reference && cut ? (
            <dl>
              <dt>Имя</dt>
              <dd>{reference.name}</dd>
              <dt>Центр x₀</dt>
              <dd>{fmt(reference.x0, 3)}</dd>
              <dt>Левая граница</dt>
              <dd>{fmt(cut.left, 3)}</dd>
              <dt>Правая граница</dt>
              <dd>{fmt(cut.right, 3)}</dd>
              <dt>Ширина α-среза</dt>
              <dd>{fmt(cut.right - cut.left, 3)}</dd>
              <dt>s</dt>
              <dd>{fmt(reference.s, 3)}</dd>
              <dt>ν</dt>
              <dd>{reference.nu}</dd>
            </dl>
          ) : (
            <p className="hint">Выделите величину в таблице — здесь появятся её центр и границы α-среза.</p>
          )}
          <p className="hint">Границы — концы α-среза при текущем α:</p>
          <Tex block tex={String.raw`x_0 \pm s\sqrt{\nu\left(\alpha^{-\frac{2}{\nu+1}} - 1\right)}`} />
        </aside>

        <div>
          <div className="pass-count">
            {criterion ? (
              <>
                Подходят <b>{passCount}</b> из {values.length} · {describe()}
              </>
            ) : (
              <span className="muted">
                {kind === "possibility" ? "Выделите величину A в таблице" : "Укажите числа для критерия"}
              </span>
            )}
          </div>
          <div className="chart-box">
            <Line data={chartData} options={options} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              onClick={() => props.onMakeSubset(passIndices, describe())}
              disabled={!criterion || passCount === 0}
            >
              Выделить подмножество ({passCount})
            </button>
            <span className="hint">Подходящие величины станут подмножеством — с ним работают таблица, операции и кластеры.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
