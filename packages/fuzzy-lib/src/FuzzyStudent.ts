/**
 * Нечёткая величина T(x₀, s, ν) с функцией принадлежности распределения Стьюдента.
 *
 * Справочник Абчука (стр. 70) даёт плотность стандартного распределения Стьюдента
 *   S_k(t) = Γ((k+1)/2) / (√(kπ)·Γ(k/2)) · (1 + t²/k)^(−(k+1)/2),   −∞ < t < +∞.
 * Чтобы величина имела центр и ширину (как x₀ и σ у нормальной в примере),
 * делаем замену t = (x − x₀)/s:
 *   φ(x) = Γ((ν+1)/2) / (s·√(νπ)·Γ(ν/2)) · (1 + ((x − x₀)/s)²/ν)^(−(ν+1)/2).
 *
 *  x₀ — центр («примерно сколько»), аналог x₀ нормальной величины;
 *  s  — масштаб (ширина), аналог σ;
 *  ν  — число степеней свободы (k в справочнике), задаёт толщину «хвостов».
 */
import { lnGamma } from "./special.js";
import { defaultRng, studentStandard, type Rng } from "./random.js";
import { sampleStatistics, type SampleStatistics } from "./stats.js";

/** Сериализуемое представление величины (для JSON-файла). */
export interface FuzzyStudentDict {
  x0: number;
  s: number;
  nu: number;
  name: string;
}

/** Арифметические операции над величинами. */
export type Operation = "+" | "-" | "*" | "/";

/** Результат операции с подробным расчётом. */
export interface OperationResult {
  result: FuzzyStudent;
  /** Шаги расчёта с подставленными числами (для журнала и «математики решения»). */
  steps: string[];
  /** Те же шаги в LaTeX (для красивого отображения формул). */
  stepsTex: string[];
}

/** Результат сравнения величин. */
export interface ComparisonResult {
  /** −1, если A < B; 0, если A = B; 1, если A > B (по центрам x₀). */
  order: -1 | 0 | 1;
  /** Текстовое пояснение. */
  steps: string[];
  /** Пояснение в LaTeX. */
  stepsTex: string[];
}

/** α-срез: интервал [left, right], на котором нормированная μ̃(x) ≥ α. */
export interface AlphaCut {
  alpha: number;
  left: number;
  right: number;
}

/** Теоретические характеристики распределения T(x₀, s, ν). */
export interface TheoreticalMoments {
  /** M = x₀ при ν > 1, иначе не существует (NaN). */
  mean: number;
  /** D = s²·ν/(ν − 2) при ν > 2, иначе бесконечна. */
  variance: number;
  /** σ = √D. */
  std: number;
  /** Асимметрия 0 при ν > 3, иначе не определена (NaN). */
  skewness: number;
  /** Эксцесс 6/(ν − 4) при ν > 4, иначе бесконечен. */
  kurtosis: number;
}

/** Порог «нуля» — как в примере (1e-9). */
export const EPS = 1e-9;

/** Аккуратное форматирование чисел в пояснениях. */
export function fmt(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return String(v);
  const r = Number(v.toFixed(digits));
  return Object.is(r, -0) ? "0" : String(r);
}

/** Число в скобках, если отрицательное: (−2). */
function fp(v: number): string {
  const s = fmt(v);
  return v < 0 ? `(${s})` : s;
}

export class FuzzyStudent {
  readonly x0: number;
  readonly s: number;
  readonly nu: number;
  name: string;

  constructor(x0 = 0, s = 1, nu = 10, name = "") {
    if (!Number.isFinite(x0)) throw new RangeError("x₀ должно быть конечным числом");
    if (!Number.isFinite(s) || s <= 0) throw new RangeError("s должна быть > 0");
    if (!Number.isInteger(nu) || nu < 1) {
      throw new RangeError("ν (число степеней свободы) должно быть целым ≥ 1");
    }
    this.x0 = x0;
    this.s = s;
    this.nu = nu;
    this.name = name || FuzzyStudent.defaultName(x0, s, nu);
  }

  static defaultName(x0: number, s: number, nu: number): string {
    return `T(${x0.toFixed(2)};${s.toFixed(2)};${nu})`;
  }

  // ---------------------------------------------------------------------------
  // Функция принадлежности
  // ---------------------------------------------------------------------------

  /** Нормирующий множитель Γ((ν+1)/2) / (s·√(νπ)·Γ(ν/2)) — высота графика в точке x₀. */
  get peak(): number {
    const { nu, s } = this;
    return Math.exp(lnGamma((nu + 1) / 2) - lnGamma(nu / 2)) / (s * Math.sqrt(nu * Math.PI));
  }

  /** Множитель формы (1 + ((x − x₀)/s)²/ν)^(−(ν+1)/2), равный 1 в центре. */
  private shape(x: number): number {
    const z = (x - this.x0) / this.s;
    return Math.pow(1 + (z * z) / this.nu, -(this.nu + 1) / 2);
  }

  /**
   * Функция принадлежности φ(x) — плотность Стьюдента со сдвигом x₀ и масштабом s
   * (как в примере: μ(x) у нормальной величины тоже равна её плотности).
   */
  membership(x: number): number {
    return this.peak * this.shape(x);
  }

  /**
   * Нормированная функция принадлежности μ̃(x) = φ(x)/φ(x₀), высота = 1.
   * Используется для α-срезов (α ∈ (0, 1]).
   */
  membershipNormalized(x: number): number {
    return this.shape(x);
  }

  /**
   * α-срез: множество x, где μ̃(x) ≥ α.
   * Из (1 + z²/ν)^(−(ν+1)/2) ≥ α получаем
   *   |x − x₀| ≤ w(α) = s·√(ν·(α^(−2/(ν+1)) − 1)).
   */
  alphaCut(alpha: number): AlphaCut {
    if (!(alpha > 0 && alpha <= 1)) {
      throw new RangeError("α должно лежать в (0, 1]");
    }
    const w = this.alphaHalfWidth(alpha);
    return { alpha, left: this.x0 - w, right: this.x0 + w };
  }

  /** Полуширина α-среза w(α). */
  alphaHalfWidth(alpha: number): number {
    return this.s * Math.sqrt(this.nu * (Math.pow(alpha, -2 / (this.nu + 1)) - 1));
  }

  /**
   * Возможность равенства Poss(A = B) = sup_x min(μ̃_A(x), μ̃_B(x)).
   * Для симметричных унимодальных функций это наибольшее α, при котором
   * α-срезы пересекаются: |x₀ᴬ − x₀ᴮ| ≤ w_A(α) + w_B(α).
   * Так как w(α) убывает по α, ищем это α делением отрезка пополам.
   */
  possibilityEqual(other: FuzzyStudent): number {
    const d = Math.abs(this.x0 - other.x0);
    if (d < EPS) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (this.alphaHalfWidth(mid) + other.alphaHalfWidth(mid) >= d) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Пересекаются ли α-срезы двух величин: A_α ∩ B_α ≠ ∅. */
  alphaCutsIntersect(other: FuzzyStudent, alpha: number): boolean {
    return (
      Math.abs(this.x0 - other.x0) <= this.alphaHalfWidth(alpha) + other.alphaHalfWidth(alpha) + EPS
    );
  }

  /**
   * Степень попадания величины в окно [a; b]: sup_{x∈[a;b]} μ̃(x).
   * Равна 1, если x₀ в окне, иначе μ̃ в ближайшем к x₀ конце окна.
   * α-срез пересекает окно ⇔ эта степень ≥ α.
   */
  windowDegree(a: number, b: number): number {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (this.x0 >= lo && this.x0 <= hi) return 1;
    return this.membershipNormalized(this.x0 < lo ? lo : hi);
  }

  /** Пояснение к α-срезу по шагам. */
  explainAlphaCut(alpha: number): string[] {
    const cut = this.alphaCut(alpha);
    const p = -2 / (this.nu + 1);
    const pow = Math.pow(alpha, p);
    return [
      `μ̃(x) = (1 + ((x − x₀)/s)²/ν)^(−(ν+1)/2) ≥ α`,
      `|x − x₀| ≤ w = s·√(ν·(α^(−2/(ν+1)) − 1))`,
      `α^(−2/(ν+1)) = ${fmt(alpha)}^(${fmt(p)}) = ${fmt(pow)}`,
      `w = ${fmt(this.s)}·√(${this.nu}·(${fmt(pow)} − 1)) = ${fmt(cut.right - this.x0)}`,
      `α-срез = [${fmt(this.x0)} − ${fmt(cut.right - this.x0)}; ${fmt(this.x0)} + ${fmt(cut.right - this.x0)}] = [${fmt(cut.left)}; ${fmt(cut.right)}]`,
    ];
  }

  /** Пояснение к α-срезу по шагам в LaTeX. */
  explainAlphaCutTex(alpha: number): string[] {
    const cut = this.alphaCut(alpha);
    const p = -2 / (this.nu + 1);
    const pow = Math.pow(alpha, p);
    const w = cut.right - this.x0;
    return [
      String.raw`\tilde\mu(x) = \left(1 + \frac{1}{\nu}\left(\frac{x - x_0}{s}\right)^2\right)^{-\frac{\nu+1}{2}} \ge \alpha`,
      String.raw`\lvert x - x_0 \rvert \le w = s\sqrt{\nu\left(\alpha^{-\frac{2}{\nu+1}} - 1\right)}`,
      String.raw`\alpha^{-\frac{2}{\nu+1}} = ${fmt(alpha)}^{${fmt(p)}} = ${fmt(pow)}`,
      String.raw`w = ${fmt(this.s)} \cdot \sqrt{${this.nu} \cdot (${fmt(pow)} - 1)} = ${fmt(w)}`,
      String.raw`A_\alpha = [${fmt(this.x0)} - ${fmt(w)};\; ${fmt(this.x0)} + ${fmt(w)}] = [${fmt(cut.left)};\; ${fmt(cut.right)}]`,
    ];
  }

  // ---------------------------------------------------------------------------
  // Генерация значений (справочник, стр. 71) и статистики (табл. 2.2.7)
  // ---------------------------------------------------------------------------

  /** Одно значение: x' = s·t + x₀, где t — стандартная величина Стьюдента с ν степенями свободы. */
  sample(rng: Rng = defaultRng): number {
    return this.s * studentStandard(this.nu, rng) + this.x0;
  }

  /** Выборка из n значений. */
  sampleMany(n: number, rng: Rng = defaultRng): number[] {
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = this.sample(rng);
    return out;
  }

  /**
   * Генерирует выборку из nSamples значений и вычисляет статистики
   * согласно табл. 2.2.7 (аналог sample_statistics в примере).
   */
  sampleStatistics(nSamples = 100, rng: Rng = defaultRng): SampleStatistics & { samples: number[] } {
    const samples = this.sampleMany(nSamples, rng);
    return { ...sampleStatistics(samples), samples };
  }

  /** Теоретические моменты распределения T(x₀, s, ν). */
  theoretical(): TheoreticalMoments {
    const { x0, s, nu } = this;
    const variance = nu > 2 ? (s * s * nu) / (nu - 2) : Infinity;
    return {
      mean: nu > 1 ? x0 : NaN,
      variance,
      std: Math.sqrt(variance),
      skewness: nu > 3 ? 0 : NaN,
      kurtosis: nu > 4 ? 6 / (nu - 4) : Infinity,
    };
  }

  // ---------------------------------------------------------------------------
  // Арифметика — формулы из примера (FuzzyNormal), σ → s, ν = min(ν₁, ν₂)
  // ---------------------------------------------------------------------------

  /**
   * Выполнить операцию A op B с подробным расчётом.
   * B — нечёткая величина или обычное число.
   */
  static operate(a: FuzzyStudent, op: Operation, b: FuzzyStudent | number): OperationResult {
    return typeof b === "number" ? operateScalar(a, op, b) : operateFuzzy(a, op, b);
  }

  add(other: FuzzyStudent | number): FuzzyStudent {
    return FuzzyStudent.operate(this, "+", other).result;
  }

  sub(other: FuzzyStudent | number): FuzzyStudent {
    return FuzzyStudent.operate(this, "-", other).result;
  }

  mul(other: FuzzyStudent | number): FuzzyStudent {
    return FuzzyStudent.operate(this, "*", other).result;
  }

  div(other: FuzzyStudent | number): FuzzyStudent {
    return FuzzyStudent.operate(this, "/", other).result;
  }

  // ---------------------------------------------------------------------------
  // Сравнение — как в примере, по центрам x₀
  // ---------------------------------------------------------------------------

  /** −1 / 0 / 1 по центрам x₀ (как __lt__ в примере). */
  compareTo(other: FuzzyStudent | number): -1 | 0 | 1 {
    const b = typeof other === "number" ? other : other.x0;
    if (Math.abs(this.x0 - b) < EPS) return 0;
    return this.x0 < b ? -1 : 1;
  }

  lessThan(other: FuzzyStudent | number): boolean {
    return this.compareTo(other) < 0;
  }

  /** Равенство: совпадают все параметры (как __eq__ в примере, плюс ν). */
  equals(other: FuzzyStudent): boolean {
    return (
      Math.abs(this.x0 - other.x0) < EPS &&
      Math.abs(this.s - other.s) < EPS &&
      this.nu === other.nu
    );
  }

  /** Сравнение с пояснением. */
  static compare(a: FuzzyStudent, b: FuzzyStudent): ComparisonResult {
    const order = a.compareTo(b);
    const sign = order < 0 ? "<" : order > 0 ? ">" : "=";
    const steps = [
      `Сравнение по центрам x₀ (как в примере):`,
      `x₀(A) = ${fmt(a.x0)},  x₀(B) = ${fmt(b.x0)}`,
      `${fmt(a.x0)} ${sign} ${fmt(b.x0)}  ⇒  ${a.name} ${sign} ${b.name}`,
    ];
    const signTex = order < 0 ? "<" : order > 0 ? ">" : "=";
    const stepsTex = [
      String.raw`x_0^A = ${fmt(a.x0)},\quad x_0^B = ${fmt(b.x0)}`,
      String.raw`${fmt(a.x0)} ${signTex} ${fmt(b.x0)} \;\Rightarrow\; A ${signTex} B`,
    ];
    if (order === 0) {
      steps.push(
        a.equals(b)
          ? "Все параметры совпадают — величины равны."
          : "Центры совпадают, но s или ν различаются — величины равны только по положению.",
      );
    }
    return { order, steps, stepsTex };
  }

  // ---------------------------------------------------------------------------
  // Сериализация
  // ---------------------------------------------------------------------------

  toDict(): FuzzyStudentDict {
    return { x0: this.x0, s: this.s, nu: this.nu, name: this.name };
  }

  static fromDict(d: FuzzyStudentDict): FuzzyStudent {
    return new FuzzyStudent(Number(d.x0), Number(d.s), Number(d.nu), d.name ?? "");
  }

  toString(): string {
    return `FuzzyStudent(x0=${this.x0.toFixed(4)}, s=${this.s.toFixed(4)}, nu=${this.nu})`;
  }
}

// -----------------------------------------------------------------------------
// Реализация операций
// -----------------------------------------------------------------------------

const OP_NAMES: Record<Operation, string> = {
  "+": "Сложение",
  "-": "Вычитание",
  "*": "Умножение",
  "/": "Деление",
};

/** Знак операции в LaTeX. */
const OP_TEX: Record<Operation, string> = { "+": "+", "-": "-", "*": "\\times", "/": "\\div" };

function resultLine(r: FuzzyStudent): string {
  return `Результат: T(${fmt(r.x0)}; ${fmt(r.s)}; ${r.nu})`;
}

/** T(x₀; s; ν) в LaTeX. */
function tT(x0: number, s: number, nu: number): string {
  return `T(${fmt(x0)};\\,${fmt(s)};\\,${nu})`;
}

function operateFuzzy(a: FuzzyStudent, op: Operation, b: FuzzyStudent): OperationResult {
  const { x0: x1, s: s1, nu: n1 } = a;
  const { x0: x2, s: s2, nu: n2 } = b;
  const nu = Math.min(n1, n2);
  const steps: string[] = [
    `${OP_NAMES[op]}: A = T(${fmt(x1)}; ${fmt(s1)}; ${n1}),  B = T(${fmt(x2)}; ${fmt(s2)}; ${n2})`,
  ];
  const stepsTex: string[] = [`A = ${tT(x1, s1, n1)},\\quad B = ${tT(x2, s2, n2)}`];
  let x0: number;
  let s: number;

  switch (op) {
    case "+":
    case "-": {
      x0 = op === "+" ? x1 + x2 : x1 - x2;
      const under = s1 * s1 + s2 * s2;
      s = Math.sqrt(under);
      const sign = op === "+" ? "+" : "-";
      steps.push(
        `x₀ = x₀₁ ${op === "+" ? "+" : "−"} x₀₂ = ${fmt(x1)} ${op === "+" ? "+" : "−"} ${fp(x2)} = ${fmt(x0)}`,
        `s = √(s₁² + s₂²) = √(${fmt(s1)}² + ${fmt(s2)}²) = √${fmt(under)} = ${fmt(s)}`,
      );
      stepsTex.push(
        `x_0 = x_{01} ${sign} x_{02} = ${fmt(x1)} ${sign} ${fp(x2)} = ${fmt(x0)}`,
        `s = \\sqrt{s_1^2 + s_2^2} = \\sqrt{${fmt(s1)}^2 + ${fmt(s2)}^2} = \\sqrt{${fmt(under)}} = ${fmt(s)}`,
      );
      break;
    }
    case "*": {
      x0 = x1 * x2;
      const under = x1 * x1 * s2 * s2 + x2 * x2 * s1 * s1;
      s = Math.max(Math.sqrt(under), EPS);
      steps.push(
        `x₀ = x₀₁ · x₀₂ = ${fmt(x1)} · ${fp(x2)} = ${fmt(x0)}`,
        `s = √(x₀₁²·s₂² + x₀₂²·s₁²) = √(${fp(x1)}²·${fmt(s2)}² + ${fp(x2)}²·${fmt(s1)}²) = √${fmt(under)} = ${fmt(s)}`,
      );
      stepsTex.push(
        `x_0 = x_{01} \\cdot x_{02} = ${fmt(x1)} \\cdot ${fp(x2)} = ${fmt(x0)}`,
        `s = \\sqrt{x_{01}^2 s_2^2 + x_{02}^2 s_1^2} = \\sqrt{${fp(x1)}^2 \\cdot ${fmt(s2)}^2 + ${fp(x2)}^2 \\cdot ${fmt(s1)}^2} = \\sqrt{${fmt(under)}} = ${fmt(s)}`,
      );
      break;
    }
    case "/": {
      if (Math.abs(x2) < EPS) {
        throw new RangeError("Деление на нечёткую величину с x₀ ≈ 0");
      }
      x0 = x1 / x2;
      const under = (s1 * s1) / (x2 * x2) + (x1 * x1 * s2 * s2) / x2 ** 4;
      s = Math.max(Math.sqrt(under), EPS);
      steps.push(
        `x₀ = x₀₁ / x₀₂ = ${fmt(x1)} / ${fp(x2)} = ${fmt(x0)}`,
        `s = √(s₁²/x₀₂² + x₀₁²·s₂²/x₀₂⁴) = √(${fmt(s1)}²/${fp(x2)}² + ${fp(x1)}²·${fmt(s2)}²/${fp(x2)}⁴) = √${fmt(under)} = ${fmt(s)}`,
      );
      stepsTex.push(
        `x_0 = \\dfrac{x_{01}}{x_{02}} = \\dfrac{${fmt(x1)}}{${fmt(x2)}} = ${fmt(x0)}`,
        `s = \\sqrt{\\dfrac{s_1^2}{x_{02}^2} + \\dfrac{x_{01}^2 s_2^2}{x_{02}^4}} = \\sqrt{\\dfrac{${fmt(s1)}^2}{${fp(x2)}^2} + \\dfrac{${fp(x1)}^2 \\cdot ${fmt(s2)}^2}{${fp(x2)}^4}} = \\sqrt{${fmt(under)}} = ${fmt(s)}`,
      );
      break;
    }
  }

  steps.push(`ν = min(ν₁, ν₂) = min(${n1}, ${n2}) = ${nu}`);
  stepsTex.push(`\\nu = \\min(\\nu_1, \\nu_2) = \\min(${n1}, ${n2}) = ${nu}`);
  const result = new FuzzyStudent(x0, s, nu, `(${a.name} ${op} ${b.name})`);
  steps.push(resultLine(result));
  stepsTex.push(`A ${OP_TEX[op]} B = ${tT(result.x0, result.s, result.nu)}`);
  return { result, steps, stepsTex };
}

function operateScalar(a: FuzzyStudent, op: Operation, c: number): OperationResult {
  if (!Number.isFinite(c)) throw new RangeError("Число должно быть конечным");
  const { x0: x1, s: s1, nu } = a;
  const steps: string[] = [`${OP_NAMES[op]} на число: A = T(${fmt(x1)}; ${fmt(s1)}; ${nu}),  c = ${fmt(c)}`];
  const stepsTex: string[] = [`A = ${tT(x1, s1, nu)},\\quad c = ${fmt(c)}`];
  let x0: number;
  let s: number;

  switch (op) {
    case "+":
    case "-":
      x0 = op === "+" ? x1 + c : x1 - c;
      s = s1;
      steps.push(`x₀ = x₀₁ ${op === "+" ? "+" : "−"} c = ${fmt(x0)}`, `s = s₁ = ${fmt(s)} (сдвиг ширину не меняет)`);
      stepsTex.push(`x_0 = x_{01} ${op === "+" ? "+" : "-"} c = ${fmt(x0)}`, `s = s_1 = ${fmt(s)}`);
      break;
    case "*":
      if (Math.abs(c) < EPS) throw new RangeError("Умножение на 0 даёт вырожденную величину (s = 0)");
      x0 = x1 * c;
      s = Math.abs(s1 * c);
      steps.push(`x₀ = x₀₁ · c = ${fmt(x0)}`, `s = |s₁ · c| = ${fmt(s)}`);
      stepsTex.push(`x_0 = x_{01} \\cdot c = ${fmt(x0)}`, `s = \\lvert s_1 \\cdot c \\rvert = ${fmt(s)}`);
      break;
    case "/":
      if (Math.abs(c) < 1e-12) throw new RangeError("Деление на 0");
      x0 = x1 / c;
      s = s1 / Math.abs(c);
      steps.push(`x₀ = x₀₁ / c = ${fmt(x0)}`, `s = s₁ / |c| = ${fmt(s)}`);
      stepsTex.push(`x_0 = \\dfrac{x_{01}}{c} = ${fmt(x0)}`, `s = \\dfrac{s_1}{\\lvert c \\rvert} = ${fmt(s)}`);
      break;
  }

  steps.push(`ν = ν₁ = ${nu}`);
  stepsTex.push(`\\nu = \\nu_1 = ${nu}`);
  const result = new FuzzyStudent(x0, s, nu, `(${a.name} ${op} ${fmt(c)})`);
  steps.push(resultLine(result));
  stepsTex.push(`A ${OP_TEX[op]} c = ${tT(result.x0, result.s, result.nu)}`);
  return { result, steps, stepsTex };
}
