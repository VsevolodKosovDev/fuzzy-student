/**
 * Генерация набора нечётких величин (по заданию — от 100 до 300 штук).
 * Параметры каждой величины выбираются равномерно (ξ) в заданных диапазонах:
 *   x₀ = (b − a)·ξ + a,  s = (b − a)·ξ + a,  ν — целое из [νmin, νmax].
 */
import { FuzzyStudent } from "./FuzzyStudent.js";
import { FuzzySet } from "./FuzzySet.js";
import { defaultRng, type Rng } from "./random.js";

export interface GenerateOptions {
  /** Диапазон центров x₀. По умолчанию [−10, 10]. */
  x0Range?: [number, number];
  /** Диапазон масштабов s. По умолчанию [0.5, 3]. */
  sRange?: [number, number];
  /** Диапазон степеней свободы ν (целые). По умолчанию [1, 30]. */
  nuRange?: [number, number];
  /** Датчик равномерных чисел. */
  rng?: Rng;
}

export const GENERATE_MIN = 100;
export const GENERATE_MAX = 300;

/** Равномерная величина на [a, b] по формуле справочника x' = (b − a)·ξ + a. */
function uniformIn([a, b]: [number, number], rng: Rng): number {
  return (b - a) * rng() + a;
}

/** Сгенерировать множество из n нечётких величин Стьюдента. */
export function generateSet(n = 200, options: GenerateOptions = {}): FuzzySet {
  const {
    x0Range = [-10, 10],
    sRange = [0.5, 3],
    nuRange = [1, 30],
    rng = defaultRng,
  } = options;

  if (!Number.isInteger(n) || n < 1) throw new RangeError("n должно быть целым ≥ 1");
  if (sRange[0] <= 0) throw new RangeError("Нижняя граница s должна быть > 0");
  const nuMin = Math.ceil(Math.max(1, nuRange[0]));
  const nuMax = Math.floor(nuRange[1]);
  if (nuMax < nuMin) throw new RangeError("Пустой диапазон ν");

  const set = new FuzzySet();
  for (let i = 0; i < n; i++) {
    const x0 = uniformIn(x0Range, rng);
    const s = uniformIn(sRange, rng);
    const nu = nuMin + Math.floor(rng() * (nuMax - nuMin + 1));
    set.add(new FuzzyStudent(x0, s, Math.min(nu, nuMax)));
  }
  return set;
}
