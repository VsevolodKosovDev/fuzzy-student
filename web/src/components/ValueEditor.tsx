import { useEffect, useRef, useState } from "react";
import { fmt, type FuzzyStudent } from "fuzzy-lib";
import { parseNum } from "../util";
import { Tex } from "./Tex";

export interface Params {
  x0: number;
  s: number;
  nu: number;
}

interface Props {
  /** Редактируемая величина (A — первая выделенная). */
  value: FuzzyStudent | undefined;
  /** Номер строки в таблице — по нему понимаем, что выбрана другая величина. */
  index: number | undefined;
  /** Изменение параметров (вызывается сразу при движении ползунка). */
  onChange: (params: Params) => void;
  /** Изменение закончено (отпущен ползунок, Enter, уход из поля) — для журнала. */
  onCommit: (before: Params, after: Params) => void;
}

interface ControlProps {
  label: string;
  tex: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  onChange: (v: number) => void;
  onCommit: () => void;
}

/** Ползунок + поле ввода для одного параметра. */
function ParamControl({ label, tex, hint, value, min, max, step, integer, onChange, onCommit }: ControlProps) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  // Значение поменялось ползунком — обновить поле (если в нём не печатают).
  useEffect(() => {
    if (!focused.current) setText(integer ? String(value) : fmt(value, 3));
  }, [value, integer]);

  const applyText = (t: string) => {
    setText(t);
    const v = parseNum(t);
    if (!Number.isFinite(v)) return;
    if (integer ? Number.isInteger(v) && v >= 1 : label === "s" ? v > 0 : true) onChange(v);
  };

  return (
    <div className="param-control">
      <label className="param-label" title={hint}>
        <Tex tex={tex} />
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        // Значения за пределами ползунка (например, x₀ = 40) поле ввода допускает, ползунок упирается в край.
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        aria-label={label}
      />
      <input
        className="param-input"
        value={text}
        inputMode={integer ? "numeric" : "decimal"}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(integer ? String(value) : fmt(value, 3));
          onCommit();
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        onChange={(e) => applyText(e.target.value)}
        aria-label={`${label} — число`}
      />
      <span className="hint param-hint">{hint}</span>
    </div>
  );
}

/** Редактор параметров выбранной величины: кривая меняется сразу при движении ползунков. */
export function ValueEditor({ value, index, onChange, onCommit }: Props) {
  // Параметры на момент выбора величины — для кнопки «Вернуть исходные».
  const original = useRef<Params | null>(null);
  // Параметры на начало текущего изменения — для записи «было → стало» в журнал.
  const start = useRef<Params | null>(null);
  const lastIndex = useRef<number | undefined>(undefined);

  if (index !== lastIndex.current) {
    lastIndex.current = index;
    original.current = value ? { x0: value.x0, s: value.s, nu: value.nu } : null;
    start.current = null;
  }

  if (!value) {
    return (
      <div className="value-editor">
        <h3>Изменить величину</h3>
        <p className="hint">Выделите величину в таблице или щёлкните по её кривой — здесь появятся её параметры.</p>
      </div>
    );
  }

  const current: Params = { x0: value.x0, s: value.s, nu: value.nu };
  const change = (patch: Partial<Params>) => {
    if (!start.current) start.current = current;
    onChange({ ...current, ...patch });
  };
  const commit = () => {
    const before = start.current;
    start.current = null;
    if (before && (before.x0 !== value.x0 || before.s !== value.s || before.nu !== value.nu)) {
      onCommit(before, { x0: value.x0, s: value.s, nu: value.nu });
    }
  };
  const orig = original.current;
  const changed = orig && (orig.x0 !== value.x0 || orig.s !== value.s || orig.nu !== value.nu);

  return (
    <div className="value-editor">
      <div className="value-editor-head">
        <h3>
          Изменить величину A: <span className="mono">{value.name}</span>
        </h3>
        <button
          className="secondary"
          disabled={!changed}
          onClick={() => {
            if (!orig) return;
            onChange(orig);
            onCommit(current, orig);
          }}
        >
          Вернуть исходные
        </button>
      </div>
      <ParamControl
        label="x₀"
        tex="x_0"
        hint="центр — сдвигает колокол"
        value={value.x0}
        min={-20}
        max={20}
        step={0.1}
        onChange={(x0) => change({ x0 })}
        onCommit={commit}
      />
      <ParamControl
        label="s"
        tex="s"
        hint="ширина — растягивает колокол"
        value={value.s}
        min={0.1}
        max={10}
        step={0.05}
        onChange={(s) => change({ s })}
        onCommit={commit}
      />
      <ParamControl
        label="ν"
        tex="\nu"
        hint="степени свободы — толщина хвостов"
        value={value.nu}
        min={1}
        max={60}
        step={1}
        integer
        onChange={(nu) => change({ nu })}
        onCommit={commit}
      />
      <p className="hint">
        Высота вершины <Tex tex={String.raw`\varphi(x_0) = ${fmt(value.peak, 4)}`} /> — чем уже колокол (меньше s),
        тем он выше: площадь под кривой всегда равна 1.
      </p>
    </div>
  );
}
