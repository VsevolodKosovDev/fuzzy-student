/**
 * Оценки параметров эмпирического распределения (справочник Абчука, табл. 2.2.7).
 *
 *  x̄  = (1/n) Σ xᵢ
 *  s²  = (1/n) Σ xᵢ² − x̄²            при n > 40
 *  s₁² = n/(n−1) · s²                при n ≤ 40
 *  s   = √s² (или s₁ = √(n/(n−1)) · s при n ≤ 40)
 *  Sk  = m₃ / s³ = 1/(n s³) Σ (xᵢ − x̄)³          — асимметрия
 *  Ex  = m₄ / s⁴ − 3 = 1/(n s⁴) Σ (xᵢ − x̄)⁴ − 3  — эксцесс
 *  где mₖ = (1/n) Σ (xᵢ − x̄)ᵏ — эмпирический центральный момент k-го порядка.
 */

export interface SampleStatistics {
  /** Объём выборки n. */
  n: number;
  /** Математическое ожидание x̄. */
  mean: number;
  /** Дисперсия: s² при n > 40, s₁² при n ≤ 40. */
  variance: number;
  /** Среднее квадратическое отклонение: s при n > 40, s₁ при n ≤ 40. */
  std: number;
  /** Асимметрия Sk. */
  skewness: number;
  /** Эксцесс Ex. */
  kurtosis: number;
  /** Какая формула дисперсии применена. */
  varianceFormula: "n > 40" | "n ≤ 40";
}

/** Эмпирический центральный момент k-го порядка. */
export function centralMoment(xs: readonly number[], k: number, mean?: number): number {
  const m = mean ?? xs.reduce((a, b) => a + b, 0) / xs.length;
  let acc = 0;
  for (const x of xs) acc += (x - m) ** k;
  return acc / xs.length;
}

/** Статистики выборки по табл. 2.2.7. */
export function sampleStatistics(xs: readonly number[]): SampleStatistics {
  const n = xs.length;
  if (n < 2) {
    throw new RangeError("Для оценки дисперсии нужна выборка из ≥ 2 значений");
  }
  let sum = 0;
  let sumSq = 0;
  for (const x of xs) {
    sum += x;
    sumSq += x * x;
  }
  const mean = sum / n;
  // s² = (1/n)Σx² − x̄²  (не может быть отрицательной, но защищаемся от ошибок округления)
  const s2 = Math.max(sumSq / n - mean * mean, 0);

  let variance: number;
  let varianceFormula: SampleStatistics["varianceFormula"];
  if (n > 40) {
    variance = s2;
    varianceFormula = "n > 40";
  } else {
    variance = (n / (n - 1)) * s2;
    varianceFormula = "n ≤ 40";
  }
  const std = Math.sqrt(variance);

  // В Sk и Ex по табл. 2.2.7 стоят s³ и s⁴ — используем s = √m₂.
  const m2 = centralMoment(xs, 2, mean);
  const m3 = centralMoment(xs, 3, mean);
  const m4 = centralMoment(xs, 4, mean);
  const skewness = m2 > 0 ? m3 / m2 ** 1.5 : 0;
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;

  return { n, mean, variance, std, skewness, kurtosis, varianceFormula };
}
