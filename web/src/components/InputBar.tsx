import { useState } from "react";
import { GENERATE_MAX, GENERATE_MIN } from "fuzzy-lib";
import { parseNum } from "../util";

interface Props {
  onAdd: (x0: number, s: number, nu: number) => void;
  onGenerate: (n: number) => void;
}

/** Ввод величины и генерация набора (верхняя панель gui.py). */
export function InputBar({ onAdd, onGenerate }: Props) {
  const [x0, setX0] = useState("0");
  const [s, setS] = useState("1");
  const [nu, setNu] = useState("5");
  const [n, setN] = useState("200");

  return (
    <section className="panel">
      <h2>Величина T(x₀, s, ν)</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(parseNum(x0), parseNum(s), parseNum(nu));
        }}
      >
        <label>
          x₀
          <input value={x0} onChange={(e) => setX0(e.target.value)} inputMode="decimal" size={6} />
        </label>
        <label>
          s
          <input value={s} onChange={(e) => setS(e.target.value)} inputMode="decimal" size={6} />
        </label>
        <label>
          ν
          <input value={nu} onChange={(e) => setNu(e.target.value)} inputMode="numeric" size={4} />
        </label>
        <button type="submit">Добавить</button>
      </form>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          onGenerate(parseNum(n));
        }}
      >
        <label>
          Количество
          <input
            type="number"
            min={GENERATE_MIN}
            max={GENERATE_MAX}
            value={n}
            onChange={(e) => setN(e.target.value)}
            style={{ width: "5.5em" }}
          />
        </label>
        <button type="submit">Сгенерировать</button>
        <span className="hint">
          {GENERATE_MIN}–{GENERATE_MAX} величин
        </span>
      </form>
    </section>
  );
}
