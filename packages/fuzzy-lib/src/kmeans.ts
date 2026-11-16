/**
 * Кластерный анализ множества нечётких величин методом k-means
 * (аналог clustering.py из примера).
 *
 * Каждая величина T(x₀, s, ν) представлена точкой (x₀, s).
 * Критерий — евклидово расстояние между величинами:
 *   d(A, B) = √((x₀ᴬ − x₀ᴮ)² + (sᴬ − sᴮ)²).
 * Качество разбиения — внутрикластерная сумма квадратов расстояний
 *   J = Σ_кластеры Σ_{A ∈ кластер} d(A, центр)²,
 * которую k-means последовательно уменьшает.
 */
import type { FuzzyStudent } from "./FuzzyStudent.js";
import { defaultRng, type Rng } from "./random.js";

export type Point = [number, number];

export interface KMeansOptions {
  maxIter?: number;
  rng?: Rng;
}

export interface KMeansResult {
  /** Величины, разбитые по кластерам. */
  clusters: FuzzyStudent[][];
  /** Номер кластера для каждой величины (в исходном порядке). */
  labels: number[];
  /** Центры кластеров (x₀, s). */
  centroids: Point[];
  /** Итоговое значение критерия J. */
  inertia: number;
  /** Значение J после каждого шага распределения (не возрастает). */
  inertiaHistory: number[];
  /** Сколько итераций выполнено. */
  iterations: number;
}

/** Точка величины в пространстве признаков. */
export function toPoint(fv: FuzzyStudent): Point {
  return [fv.x0, fv.s];
}

/** Евклидово расстояние между точками. */
export function distance(a: Point, b: Point): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

/** Расстояние между двумя нечёткими величинами — критерий кластеризации. */
export function fuzzyDistance(a: FuzzyStudent, b: FuzzyStudent): number {
  return distance(toPoint(a), toPoint(b));
}

function sampleIndices(n: number, k: number, rng: Rng): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (n - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, k);
}

/** Разбить множество величин на k кластеров. */
export function kmeans(
  values: Iterable<FuzzyStudent>,
  k = 3,
  options: KMeansOptions = {},
): KMeansResult {
  const { maxIter = 100, rng = defaultRng } = options;
  const items = Array.from(values);
  const points = items.map(toPoint);
  const n = points.length;
  if (!Number.isInteger(k) || k <= 0 || k > n) {
    throw new RangeError(`k должно быть в диапазоне 1..${n}`);
  }

  // Начальные центры — k случайных различных величин (как random.sample в примере).
  const centroids: Point[] = sampleIndices(n, k, rng).map((i) => [...points[i]] as Point);
  let labels: number[] = new Array(n).fill(-1);
  const inertiaHistory: number[] = [];
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;

    // 1. Распределение: каждую величину — к ближайшему центру.
    const newLabels = points.map((p) => {
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < k; j++) {
        const d = distance(p, centroids[j]);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      return best;
    });

    // 2. Пустой кластер получает самую удалённую от своего центра величину.
    const counts = new Array(k).fill(0);
    newLabels.forEach((l) => counts[l]++);
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) continue;
      let far = -1;
      let farD = -1;
      for (let i = 0; i < n; i++) {
        if (counts[newLabels[i]] <= 1) continue;
        const d = distance(points[i], centroids[newLabels[i]]);
        if (d > farD) {
          farD = d;
          far = i;
        }
      }
      if (far >= 0) {
        counts[newLabels[far]]--;
        newLabels[far] = j;
        counts[j] = 1;
        centroids[j] = [...points[far]] as Point;
      }
    }

    inertiaHistory.push(computeInertia(points, newLabels, centroids));

    const changed = newLabels.some((l, i) => l !== labels[i]);
    labels = newLabels;
    if (!changed) break;

    // 3. Пересчёт центров как средних точек кластеров.
    for (let j = 0; j < k; j++) {
      let cx = 0;
      let cy = 0;
      let cnt = 0;
      for (let i = 0; i < n; i++) {
        if (labels[i] !== j) continue;
        cx += points[i][0];
        cy += points[i][1];
        cnt++;
      }
      if (cnt > 0) centroids[j] = [cx / cnt, cy / cnt];
    }
  }

  const clusters: FuzzyStudent[][] = Array.from({ length: k }, () => []);
  items.forEach((fv, i) => clusters[labels[i]].push(fv));

  return {
    clusters,
    labels,
    centroids,
    inertia: computeInertia(points, labels, centroids),
    inertiaHistory,
    iterations,
  };
}

function computeInertia(points: Point[], labels: number[], centroids: Point[]): number {
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    j += distance(points[i], centroids[labels[i]]) ** 2;
  }
  return j;
}
