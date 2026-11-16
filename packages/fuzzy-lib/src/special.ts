/**
 * Специальные функции.
 *
 * Гамма-функция нужна для нормирующего множителя плотности Стьюдента:
 *   C(ν) = Γ((ν+1)/2) / (√(νπ) · Γ(ν/2)).
 * Считаем логарифм Γ через аппроксимацию Ланцоша (g = 7, n = 9),
 * чтобы не было переполнения при больших ν.
 */

const LANCZOS_G = 7;
const LANCZOS_COEF = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** ln Γ(z) для z > 0. */
export function lnGamma(z: number): number {
  if (!(z > 0)) {
    throw new RangeError("lnGamma определена здесь только для z > 0");
  }
  if (z < 0.5) {
    // Формула отражения: Γ(z)·Γ(1−z) = π / sin(πz)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  const x = z - 1;
  let a = LANCZOS_COEF[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) {
    a += LANCZOS_COEF[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Γ(z) для z > 0. */
export function gamma(z: number): number {
  return Math.exp(lnGamma(z));
}
