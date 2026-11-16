import { useEffect, useRef, type MouseEvent } from "react";
import type { FuzzyStudent } from "fuzzy-lib";
import { POINT_SYMBOLS, type ChartTheme } from "../theme";
import type { HoverHandler } from "../chartPick";

interface Props {
  items: FuzzyStudent[];
  /** Индексы выделенных строк в порядке выделения (первая — A, вторая — B). */
  selected: number[];
  onSelect: (next: number[]) => void;
  /** Номер кластера каждой строки (если кластеризация выполнена). */
  labels: number[] | null;
  /** Величина под курсором (в таблице или на графике) — её строка подсвечивается. */
  hovered: FuzzyStudent | null;
  onHover: HoverHandler;
  /** Прокрутить таблицу к строке (после щелчка по графику); n — чтобы повторный запрос срабатывал. */
  scrollRequest: { index: number; n: number } | null;
  theme: ChartTheme;
}

const ROLE = ["A", "B"];

/** Таблица величин с выделением строк (аналог Treeview в gui.py). */
export function FuzzyTable({ items, selected, onSelect, labels, hovered, onHover, scrollRequest, theme }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Прокрутка только внутри таблицы, без прыжков всей страницы.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !scrollRequest) return;
    const row = box.querySelector<HTMLTableRowElement>(`tr[data-row="${scrollRequest.index}"]`);
    if (!row) return;
    const head = box.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top - head < box.scrollTop) box.scrollTop = top - head;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }, [scrollRequest]);

  const toggle = (i: number) =>
    onSelect(selected.includes(i) ? selected.filter((j) => j !== i) : [...selected, i]);

  const handleRowClick = (e: MouseEvent, i: number) => {
    if (e.ctrlKey || e.metaKey) {
      toggle(i);
    } else if (e.shiftKey && selected.length > 0) {
      const from = selected[selected.length - 1];
      const [a, b] = from < i ? [from, i] : [i, from];
      const range = Array.from({ length: b - a + 1 }, (_, k) => a + k);
      onSelect([...selected, ...range.filter((r) => !selected.includes(r))]);
    } else {
      onSelect(selected.length === 1 && selected[0] === i ? [] : [i]);
    }
  };

  return (
    <section className="panel table-panel">
      <div className="panel-head">
        <h2>Множество: {items.length}</h2>
        <span className="hint">
          Выделено: {selected.length}. Ctrl — добавить к выделению, Shift — диапазон
        </span>
        {selected.length > 0 && (
          <button className="link" onClick={() => onSelect([])}>
            Снять выделение
          </button>
        )}
      </div>
      <div className="table-scroll" ref={scrollRef} onMouseLeave={() => onHover(null)}>
        <table>
          <thead>
            <tr>
              <th aria-label="Выбор" />
              <th>№</th>
              <th>Имя</th>
              <th className="num">x₀</th>
              <th className="num">s</th>
              <th className="num">ν</th>
              {labels && <th>Кластер</th>}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  Добавьте величину или сгенерируйте набор
                </td>
              </tr>
            )}
            {items.map((fv, i) => {
              const pos = selected.indexOf(i);
              const label = labels?.[i];
              return (
                <tr
                  key={i}
                  data-row={i}
                  className={[pos >= 0 ? "selected" : "", fv === hovered ? "hovered" : ""].join(" ").trim() || undefined}
                  onClick={(e) => handleRowClick(e, i)}
                  onMouseEnter={() => onHover(fv)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={pos >= 0}
                      onChange={() => toggle(i)}
                      aria-label={`Выбрать ${fv.name}`}
                    />
                  </td>
                  <td className="num muted">
                    {pos >= 0 && pos < 2 ? <span className="role">{ROLE[pos]}</span> : i + 1}
                  </td>
                  <td className="name" title={fv.name}>
                    {fv.name}
                  </td>
                  <td className="num">{fv.x0.toFixed(3)}</td>
                  <td className="num">{fv.s.toFixed(3)}</td>
                  <td className="num">{fv.nu}</td>
                  {labels && (
                    <td>
                      {label === undefined ? (
                        "—"
                      ) : (
                        <span className="cluster-tag">
                          <span style={{ color: theme.series[label] }}>{POINT_SYMBOLS[label]}</span> К
                          {label + 1}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
