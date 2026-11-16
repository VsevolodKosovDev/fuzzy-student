import { useState, type ChangeEvent } from "react";
import type { RangeFilter } from "fuzzy-lib";
import { parseNum } from "../util";

export type View = "all" | "subset";

interface Props {
  selectedCount: number;
  totalCount: number;
  subsetCount: number | null;
  view: View;
  onFromSelection: () => void;
  onFilter: (filter: RangeFilter, description: string) => void;
  onView: (view: View) => void;
  onReset: () => void;
}

function range(min: string, max: string): [number?, number?] | undefined {
  const lo = parseNum(min);
  const hi = parseNum(max);
  if (Number.isNaN(lo) && Number.isNaN(hi)) return undefined;
  return [Number.isNaN(lo) ? undefined : lo, Number.isNaN(hi) ? undefined : hi];
}

function describe(name: string, r?: [number?, number?]): string | null {
  if (!r) return null;
  const [lo, hi] = r;
  if (lo !== undefined && hi !== undefined) return `${lo} ≤ ${name} ≤ ${hi}`;
  if (lo !== undefined) return `${name} ≥ ${lo}`;
  return `${name} ≤ ${hi}`;
}

/** Выделение подмножества из множества (по α — на вкладке «Величины и α-уровень»). */
export function SubsetPanel(props: Props) {
  const { selectedCount, totalCount, subsetCount, view } = props;
  const [f, setF] = useState({ x0Min: "", x0Max: "", sMin: "", sMax: "", nuMin: "", nuMax: "" });
  const set = (key: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [key]: e.target.value });

  const applyFilter = () => {
    const filter: RangeFilter = {
      x0: range(f.x0Min, f.x0Max),
      s: range(f.sMin, f.sMax),
      nu: range(f.nuMin, f.nuMax),
    };
    const text = [describe("x₀", filter.x0), describe("s", filter.s), describe("ν", filter.nu)]
      .filter(Boolean)
      .join(", ");
    props.onFilter(filter, text || "без ограничений");
  };

  return (
    <section className="panel">
      <h2>Подмножество</h2>
      <p className="hint">
        По уровню α — кнопкой «Выделить подмножество» на вкладке «Величины и α-уровень».
      </p>
      <div className="row">
        <button onClick={props.onFromSelection} disabled={selectedCount === 0}>
          Из выделенных ({selectedCount})
        </button>
      </div>

      <div className="filter-grid">
        <span>x₀</span>
        <input placeholder="от" value={f.x0Min} onChange={set("x0Min")} aria-label="x₀ от" />
        <input placeholder="до" value={f.x0Max} onChange={set("x0Max")} aria-label="x₀ до" />
        <span>s</span>
        <input placeholder="от" value={f.sMin} onChange={set("sMin")} aria-label="s от" />
        <input placeholder="до" value={f.sMax} onChange={set("sMax")} aria-label="s до" />
        <span>ν</span>
        <input placeholder="от" value={f.nuMin} onChange={set("nuMin")} aria-label="ν от" />
        <input placeholder="до" value={f.nuMax} onChange={set("nuMax")} aria-label="ν до" />
      </div>
      <div className="row">
        <button onClick={applyFilter} disabled={totalCount === 0}>
          По фильтру
        </button>
      </div>

      <div className="row view-switch" role="radiogroup" aria-label="Что показывать">
        <label>
          <input type="radio" checked={view === "all"} onChange={() => props.onView("all")} />
          Всё множество
        </label>
        <label>
          <input type="radio" checked={view === "subset"} onChange={() => props.onView("subset")} />
          Подмножество{subsetCount !== null ? ` (${subsetCount})` : " (не создано)"}
        </label>
        {subsetCount !== null && (
          <button className="link" onClick={props.onReset}>
            Удалить подмножество
          </button>
        )}
      </div>
    </section>
  );
}
