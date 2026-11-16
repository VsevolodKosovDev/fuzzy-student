import { useState } from "react";
import type { FuzzyStudent, Operation } from "fuzzy-lib";
import { Tex } from "./Tex";

export type OperationChoice = Operation | "cmp";

export interface OperationReport {
  title: string;
  /** Подзаголовок, например «Сложение» или «Сравнение по центрам x₀ (как в примере)». */
  subtitle?: string;
  /** Формулы расчёта по шагам (LaTeX). */
  stepsTex: string[];
  /** Пояснения текстом после формул. */
  notes?: string[];
}

interface Props {
  a?: FuzzyStudent;
  b?: FuzzyStudent;
  onRun: (op: OperationChoice) => void;
  onSwap: () => void;
  report: OperationReport | null;
}

const OPTIONS: { value: OperationChoice; label: string }[] = [
  { value: "+", label: "A + B" },
  { value: "-", label: "A − B" },
  { value: "*", label: "A × B" },
  { value: "/", label: "A ÷ B" },
  { value: "cmp", label: "Сравнить A и B" },
];

/** Арифметика и сравнение над двумя выделенными величинами с расчётом по шагам. */
export function OperationsPanel({ a, b, onRun, onSwap, report }: Props) {
  const [op, setOp] = useState<OperationChoice>("+");
  const ready = Boolean(a && b);

  return (
    <section className="panel">
      <h2>Операции</h2>
      <p className="hint">
        A: <b>{a?.name ?? "—"}</b> &nbsp; B: <b>{b?.name ?? "—"}</b>
        {!ready && " — выделите в таблице ровно две величины"}
      </p>
      <div className="row">
        <select value={op} onChange={(e) => setOp(e.target.value as OperationChoice)} aria-label="Операция">
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button onClick={() => onRun(op)} disabled={!ready}>
          Выполнить (A, B)
        </button>
        <button className="secondary" onClick={onSwap} disabled={!ready}>
          Поменять A ↔ B
        </button>
      </div>
      {report && (
        <div className="steps">
          <div className="steps-title">{report.title}</div>
          {report.subtitle && <div className="hint">{report.subtitle}</div>}
          <ol className="tex-steps">
            {report.stepsTex.map((s, i) => (
              <li key={i}>
                <Tex tex={s} />
              </li>
            ))}
          </ol>
          {report.notes?.map((n, i) => (
            <p key={i} className="hint" style={{ margin: "6px 0 0" }}>
              {n}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
