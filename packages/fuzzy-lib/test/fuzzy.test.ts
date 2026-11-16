import { describe, expect, it } from "vitest";
import {
  FuzzySet,
  FuzzyStudent,
  Logger,
  gamma,
  generateSet,
  kmeans,
  normalBook,
  sampleStatistics,
  seededRng,
  studentStandard,
} from "../src/index.js";

/** Численный интеграл методом трапеций. */
function integrate(f: (x: number) => number, a: number, b: number, n = 200_000): number {
  const h = (b - a) / n;
  let acc = (f(a) + f(b)) / 2;
  for (let i = 1; i < n; i++) acc += f(a + i * h);
  return acc * h;
}

describe("special", () => {
  it("гамма-функция совпадает с известными значениями", () => {
    expect(gamma(1)).toBeCloseTo(1, 10);
    expect(gamma(5)).toBeCloseTo(24, 8);
    expect(gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 10);
    expect(gamma(1.5)).toBeCloseTo(Math.sqrt(Math.PI) / 2, 10);
  });
});

describe("FuzzyStudent: функция принадлежности", () => {
  it("φ(x) — плотность: интеграл ≈ 1", () => {
    for (const nu of [3, 5, 30]) {
      const t = new FuzzyStudent(2, 1.5, nu);
      expect(integrate((x) => t.membership(x), 2 - 2000, 2 + 2000)).toBeCloseTo(1, 3);
    }
  });

  it("при ν = 1 совпадает с распределением Коши", () => {
    const t = new FuzzyStudent(0, 1, 1);
    expect(t.membership(0)).toBeCloseTo(1 / Math.PI, 10);
    expect(t.membership(1)).toBeCloseTo(1 / (2 * Math.PI), 10);
  });

  it("при больших ν приближается к нормальной плотности (как в примере)", () => {
    const t = new FuzzyStudent(1, 2, 1000);
    const normal = (x: number) =>
      (1 / (Math.sqrt(2 * Math.PI) * 2)) * Math.exp(-((x - 1) ** 2) / (2 * 4));
    for (const x of [-3, 0, 1, 2.5, 5]) expect(t.membership(x)).toBeCloseTo(normal(x), 3);
  });

  it("нормированная μ̃ равна 1 в центре и симметрична", () => {
    const t = new FuzzyStudent(5, 2, 4);
    expect(t.membershipNormalized(5)).toBe(1);
    expect(t.membershipNormalized(3)).toBeCloseTo(t.membershipNormalized(7), 12);
  });

  it("на границах α-среза μ̃ = α", () => {
    const t = new FuzzyStudent(-3, 0.7, 6);
    for (const alpha of [0.05, 0.3, 0.5, 0.9, 1]) {
      const cut = t.alphaCut(alpha);
      expect(t.membershipNormalized(cut.left)).toBeCloseTo(alpha, 10);
      expect(t.membershipNormalized(cut.right)).toBeCloseTo(alpha, 10);
      expect(cut.left).toBeLessThanOrEqual(cut.right);
    }
    expect(t.alphaCut(1)).toEqual({ alpha: 1, left: -3, right: -3 });
  });

  it("отклоняет некорректные параметры", () => {
    expect(() => new FuzzyStudent(0, 0, 3)).toThrow();
    expect(() => new FuzzyStudent(0, 1, 0)).toThrow();
    expect(() => new FuzzyStudent(0, 1, 2.5)).toThrow();
    expect(() => new FuzzyStudent(0, 1, 3).alphaCut(0)).toThrow();
  });
});

describe("датчики по справочнику", () => {
  it("нормальная η имеет M ≈ 0, D ≈ 1", () => {
    const rng = seededRng(1);
    const xs = Array.from({ length: 100_000 }, () => normalBook(rng));
    const st = sampleStatistics(xs);
    expect(st.mean).toBeCloseTo(0, 1);
    expect(st.variance).toBeGreaterThan(0.97);
    expect(st.variance).toBeLessThan(1.03);
  });

  it("стандартная t при k = 10 имеет D ≈ k/(k−2) = 1.25", () => {
    const rng = seededRng(2);
    const xs = Array.from({ length: 100_000 }, () => studentStandard(10, rng));
    const st = sampleStatistics(xs);
    expect(st.mean).toBeCloseTo(0, 1);
    expect(st.variance).toBeGreaterThan(1.25 * 0.95);
    expect(st.variance).toBeLessThan(1.25 * 1.05);
  });

  it("выборка T(x₀, s, ν): среднее ≈ x₀, дисперсия ≈ s²ν/(ν−2)", () => {
    const t = new FuzzyStudent(4, 2, 10);
    const st = t.sampleStatistics(100_000, seededRng(3));
    const theory = t.theoretical();
    expect(st.mean).toBeGreaterThan(3.95);
    expect(st.mean).toBeLessThan(4.05);
    expect(theory.variance).toBeCloseTo(5, 10);
    expect(st.variance / theory.variance).toBeGreaterThan(0.95);
    expect(st.variance / theory.variance).toBeLessThan(1.05);
  });
});

describe("статистики по табл. 2.2.7", () => {
  it("при n ≤ 40 используется несмещённая оценка s₁² = n/(n−1)·s²", () => {
    const st = sampleStatistics([1, 2, 3, 4, 5]);
    expect(st.mean).toBe(3);
    expect(st.variance).toBeCloseTo(2.5, 12);
    expect(st.varianceFormula).toBe("n ≤ 40");
  });

  it("при n > 40 используется s² = (1/n)Σx² − x̄²", () => {
    const xs = Array.from({ length: 50 }, (_, i) => i);
    const st = sampleStatistics(xs);
    expect(st.variance).toBeCloseTo((50 * 50 - 1) / 12, 10);
    expect(st.varianceFormula).toBe("n > 40");
    expect(st.skewness).toBeCloseTo(0, 10);
  });
});

describe("арифметика — формулы примера", () => {
  const a = new FuzzyStudent(2, 1, 4, "A");
  const b = new FuzzyStudent(3, 2, 6, "B");

  it("сложение и вычитание", () => {
    const sum = a.add(b);
    expect(sum.x0).toBe(5);
    expect(sum.s).toBeCloseTo(Math.sqrt(5), 12);
    expect(sum.nu).toBe(4);
    const diff = a.sub(b);
    expect(diff.x0).toBe(-1);
    expect(diff.s).toBeCloseTo(Math.sqrt(5), 12);
  });

  it("умножение и деление", () => {
    const prod = a.mul(b);
    expect(prod.x0).toBe(6);
    expect(prod.s).toBeCloseTo(Math.sqrt(4 * 4 + 9 * 1), 12);
    const q = a.div(b);
    expect(q.x0).toBeCloseTo(2 / 3, 12);
    expect(q.s).toBeCloseTo(Math.sqrt(1 / 9 + (4 * 4) / 81), 12);
    expect(q.nu).toBe(4);
  });

  it("операции с числом", () => {
    expect(a.add(10).x0).toBe(12);
    expect(a.add(10).s).toBe(1);
    expect(a.mul(-3).s).toBe(3);
    expect(a.div(2).s).toBe(0.5);
  });

  it("деление на величину с x₀ ≈ 0 — ошибка", () => {
    expect(() => a.div(new FuzzyStudent(0, 1, 3))).toThrow(/x₀ ≈ 0/);
  });

  it("операция возвращает шаги расчёта и имя результата", () => {
    const { result, steps } = FuzzyStudent.operate(a, "+", b);
    expect(result.name).toBe("(A + B)");
    expect(steps.some((s) => s.includes("√(1² + 2²)"))).toBe(true);
    expect(steps.some((s) => s.includes("min(4, 6) = 4"))).toBe(true);
  });

  it("сравнение по x₀", () => {
    expect(a.compareTo(b)).toBe(-1);
    expect(b.compareTo(a)).toBe(1);
    expect(a.lessThan(b)).toBe(true);
    expect(FuzzyStudent.compare(a, new FuzzyStudent(2, 5, 9)).order).toBe(0);
    expect(a.equals(new FuzzyStudent(2, 1, 4))).toBe(true);
  });
});

describe("FuzzySet", () => {
  const set = new FuzzySet([
    new FuzzyStudent(0, 1, 3, "a"),
    new FuzzyStudent(5, 2, 10, "b"),
    new FuzzyStudent(-4, 0.5, 20, "c"),
  ]);

  it("доступ, подмножество по индексам и по фильтру", () => {
    expect(set.size).toBe(3);
    expect(set.get(-1).name).toBe("c");
    expect(set.subset([2, 0]).toArray().map((v) => v.name)).toEqual(["a", "c"]);
    expect(set.filterByRange({ x0: [-1, 10] }).size).toBe(2);
    expect(set.filterByRange({ nu: [5, undefined], s: [undefined, 1] }).toArray()[0].name).toBe("c");
  });

  it("подмножество по α-срезу", () => {
    // α = 0.5: срез a ≈ [−1.12; 1.12], срез b ≈ [2.68; 7.32], срез c ≈ [−4.42; −3.58];
    // отрезок [1; 3] пересекает только срезы a и b
    const names = set.filterByAlphaCut(0.5, 1, 3).toArray().map((v) => v.name);
    expect(names).toEqual(["a", "b"]);
  });

  it("toList / fromList сохраняют величины", () => {
    const restored = FuzzySet.fromList(JSON.parse(JSON.stringify(set.toList())));
    expect(restored.size).toBe(3);
    restored.toArray().forEach((v, i) => expect(v.equals(set.get(i))).toBe(true));
    expect(restored.get(1).name).toBe("b");
  });
});

describe("generateSet", () => {
  it("генерирует n величин в заданных диапазонах", () => {
    const set = generateSet(200, { rng: seededRng(4) });
    expect(set.size).toBe(200);
    for (const v of set) {
      expect(v.x0).toBeGreaterThanOrEqual(-10);
      expect(v.x0).toBeLessThanOrEqual(10);
      expect(v.s).toBeGreaterThanOrEqual(0.5);
      expect(v.s).toBeLessThanOrEqual(3);
      expect(Number.isInteger(v.nu)).toBe(true);
      expect(v.nu).toBeGreaterThanOrEqual(1);
      expect(v.nu).toBeLessThanOrEqual(30);
    }
  });
});

describe("kmeans", () => {
  it("находит три явно разделённые группы", () => {
    const rng = seededRng(5);
    const groups: [number, number][] = [
      [-20, 1],
      [0, 5],
      [20, 1],
    ];
    const values = groups.flatMap(([x, s], g) =>
      Array.from(
        { length: 30 },
        () => new FuzzyStudent(x + rng() - 0.5, s + (rng() - 0.5) * 0.2, 5, `g${g}`),
      ),
    );
    const res = kmeans(values, 3, { rng: seededRng(6) });
    expect(res.clusters.map((c) => c.length).sort()).toEqual([30, 30, 30]);
    for (const cluster of res.clusters) {
      expect(new Set(cluster.map((v) => v.name)).size).toBe(1);
    }
    for (let i = 1; i < res.inertiaHistory.length; i++) {
      expect(res.inertiaHistory[i]).toBeLessThanOrEqual(res.inertiaHistory[i - 1] + 1e-9);
    }
  });

  it("не оставляет пустых кластеров и проверяет k", () => {
    const set = generateSet(150, { rng: seededRng(7) });
    const res = kmeans(set, 8, { rng: seededRng(8) });
    expect(res.clusters.every((c) => c.length > 0)).toBe(true);
    expect(res.labels.length).toBe(150);
    expect(() => kmeans(set, 0)).toThrow();
    expect(() => kmeans(set, 151)).toThrow();
  });
});

describe("Logger", () => {
  it("пишет строку с меткой времени в приёмник", () => {
    const lines: string[] = [];
    const logger = new Logger((l) => lines.push(l));
    const line = logger.log("Добавлена величина");
    expect(lines).toEqual([line]);
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] Добавлена величина$/);
  });
});
