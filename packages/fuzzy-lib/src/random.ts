/**
 * Датчики случайных чисел по справочнику Абчука (табл. 2.2.5).
 *
 *  ξ  — равномерно распределённая на [0, 1] величина;
 *  η  — нормированная нормальная величина (x₀ = 0, σ = 1), стр. 65:
 *         ωₙ = (Σξᵢ − n/2) / √(n/12)            (центрированная сумма n равномерных)
 *         η  = ωₙ − (ωₙ³ − 3ωₙ) / (20n),   n > 5
 *  t  — величина Стьюдента с k степенями свободы, стр. 71:
 *         t = η_{k+1} / √( (1/k) · Σ_{i=1..k} ηᵢ² )
 */

/** Источник равномерных чисел на [0, 1). */
export type Rng = () => number;

/** Стандартный датчик (Math.random). */
export const defaultRng: Rng = Math.random;

/**
 * Детерминированный датчик mulberry32 — для воспроизводимых результатов
 * (тесты, повторяемая генерация).
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ξ — равномерная величина на [0, 1). */
export function uniform(rng: Rng = defaultRng): number {
  return rng();
}

/** Количество слагаемых в сумме равномерных при получении нормальной величины. */
export const NORMAL_TERMS = 12;

/**
 * η — нормированная нормальная величина N(0, 1) по формуле справочника:
 * сумма n равномерных, центрированная и нормированная, с поправкой
 * −(ω³ − 3ω)/(20n), которая уточняет хвосты распределения.
 */
export function normalBook(rng: Rng = defaultRng, n: number = NORMAL_TERMS): number {
  if (n <= 5) {
    throw new RangeError("Формула справочника требует n > 5");
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += rng();
  const w = (sum - n / 2) / Math.sqrt(n / 12);
  return w - (w ** 3 - 3 * w) / (20 * n);
}

/**
 * t — стандартная величина Стьюдента с k степенями свободы (центр 0, масштаб 1).
 * Моделируется последовательность η₁ … η_{k+1}, затем
 *   t = η_{k+1} / √((1/k)·Σ_{i=1..k} ηᵢ²).
 * (В скане справочника под корнем пропущен квадрат — по определению
 *  распределения Стьюдента там стоит сумма квадратов.)
 */
export function studentStandard(k: number, rng: Rng = defaultRng): number {
  if (!Number.isInteger(k) || k < 1) {
    throw new RangeError("Число степеней свободы k должно быть целым ≥ 1");
  }
  for (;;) {
    let sumSq = 0;
    for (let i = 0; i < k; i++) {
      const eta = normalBook(rng);
      sumSq += eta * eta;
    }
    const etaLast = normalBook(rng);
    if (sumSq > 0) {
      return etaLast / Math.sqrt(sumSq / k);
    }
    // sumSq = 0 практически невозможно, но тогда просто повторяем опыт.
  }
}
