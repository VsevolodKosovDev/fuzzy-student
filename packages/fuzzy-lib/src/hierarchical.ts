/**
 * Иерархическая (агломеративная) кластеризация множества нечётких величин.
 *
 * Каждая величина T(x₀, s, ν) — точка (x₀, s); расстояние между величинами
 *   d(A, B) = √((x₀ᴬ − x₀ᴮ)² + (sᴬ − sᴮ)²).
 *
 * Алгоритм: сначала каждая величина — отдельный кластер; на каждом шаге
 * сливаются два ближайших кластера, расстояния до нового кластера
 * пересчитываются по формуле Ланса — Уильямса для выбранного метода связи.
 * Последовательность слияний — дерево (дендрограмма); высота слияния —
 * расстояние между слитыми кластерами.
 *
 * Разбиение получается разрезом дерева:
 *  - на заданное количество k кластеров (отменяем k − 1 последних слияний);
 *  - по критерию — порогу h (оставляем слияния с высотой ≤ h).
 */
import type { FuzzyStudent } from "./FuzzyStudent.js";
import { distance, toPoint, type Point } from "./kmeans.js";

/** Метод связи (как считать расстояние между кластерами). */
export type LinkageMethod = "ward" | "complete" | "average" | "single";

export const LINKAGE_NAMES: Record<LinkageMethod, string> = {
  ward: "Уорда",
  complete: "дальнего соседа",
  average: "средней связи",
  single: "ближнего соседа",
};

/**
 * Одно слияние. Идентификаторы как в SciPy: 0…n−1 — исходные величины,
 * n + t — кластер, полученный на шаге t.
 */
export interface Merge {
  a: number;
  b: number;
  height: number;
  size: number;
}

export interface HierarchyTree {
  n: number;
  method: LinkageMethod;
  points: Point[];
  /** n − 1 слияний в порядке выполнения; высоты не убывают. */
  merges: Merge[];
  /** Порядок листьев слева направо на дендрограмме. */
  leafOrder: number[];
}

export type CutBy = { k: number } | { height: number };

export interface HierarchicalResult {
  tree: HierarchyTree;
  /** Величины по кластерам (кластеры пронумерованы слева направо по дендрограмме). */
  clusters: FuzzyStudent[][];
  /** Номер кластера каждой величины (в исходном порядке). */
  labels: number[];
  /** Число кластеров. */
  k: number;
  /** Высота линии среза на дендрограмме. */
  threshold: number;
  /** Номер кластера для каждого слияния (null — слияние выше среза). */
  mergeLabels: (number | null)[];
  /** Центры кластеров (x₀, s). */
  centroids: Point[];
  /** Внутрикластерная сумма квадратов расстояний J (для сравнения с k-means). */
  inertia: number;
}

/** Пересчёт расстояния до объединённого кластера (формула Ланса — Уильямса). */
function lanceWilliams(
  method: LinkageMethod,
  dik: number,
  djk: number,
  dij: number,
  ni: number,
  nj: number,
  nk: number,
): number {
  switch (method) {
    case "single":
      return Math.min(dik, djk);
    case "complete":
      return Math.max(dik, djk);
    case "average":
      return (ni * dik + nj * djk) / (ni + nj);
    case "ward": {
      const v = ((ni + nk) * dik * dik + (nj + nk) * djk * djk - nk * dij * dij) / (ni + nj + nk);
      return Math.sqrt(Math.max(v, 0));
    }
  }
}

/** Построить дерево слияний. Сложность O(n³) — для 100–300 величин доли секунды. */
export function buildHierarchy(
  values: Iterable<FuzzyStudent>,
  method: LinkageMethod = "ward",
): HierarchyTree {
  const points = Array.from(values, toPoint);
  const n = points.length;
  if (n === 0) throw new RangeError("Множество пусто");

  // Матрица расстояний между «ячейками»; ячейка i хранит текущий кластер.
  const D: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      D[i][j] = D[j][i] = distance(points[i], points[j]);
    }
  }
  const alive = new Uint8Array(n).fill(1);
  const clusterId = Array.from({ length: n }, (_, i) => i);
  const size = new Array<number>(n).fill(1);
  const merges: Merge[] = [];

  for (let step = 0; step < n - 1; step++) {
    // 1. Ближайшая пара кластеров.
    let bi = -1;
    let bj = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      const row = D[i];
      for (let j = i + 1; j < n; j++) {
        if (alive[j] && row[j] < best) {
          best = row[j];
          bi = i;
          bj = j;
        }
      }
    }

    // 2. Слияние: новый кластер занимает ячейку bi, ячейка bj выбывает.
    const ni = size[bi];
    const nj = size[bj];
    for (let k = 0; k < n; k++) {
      if (!alive[k] || k === bi || k === bj) continue;
      const d = lanceWilliams(method, D[bi][k], D[bj][k], best, ni, nj, size[k]);
      D[bi][k] = D[k][bi] = d;
    }
    merges.push({ a: clusterId[bi], b: clusterId[bj], height: best, size: ni + nj });
    clusterId[bi] = n + step;
    size[bi] = ni + nj;
    alive[bj] = 0;
  }

  return { n, method, points, merges, leafOrder: leafOrder(n, merges) };
}

/** Порядок листьев при обходе дерева от корня (левое поддерево — первым). */
function leafOrder(n: number, merges: Merge[]): number[] {
  if (n === 1) return [0];
  const order: number[] = [];
  const stack = [n + merges.length - 1];
  while (stack.length) {
    const id = stack.pop()!;
    if (id < n) {
      order.push(id);
    } else {
      const m = merges[id - n];
      stack.push(m.b, m.a); // a обрабатывается первым
    }
  }
  return order;
}

/** Сколько первых слияний выполнить для разреза. */
function appliedCount(tree: HierarchyTree, by: CutBy): number {
  const total = tree.merges.length;
  if ("k" in by) {
    if (!Number.isInteger(by.k) || by.k < 1 || by.k > tree.n) {
      throw new RangeError(`k должно быть целым от 1 до ${tree.n}`);
    }
    return tree.n - by.k;
  }
  if (!(by.height >= 0)) throw new RangeError("Порог h должен быть ≥ 0");
  let c = 0;
  while (c < total && tree.merges[c].height <= by.height) c++;
  return c;
}

/** Высота линии среза для разреза, выполняющего applied слияний. */
function cutHeight(tree: HierarchyTree, applied: number, by: CutBy): number {
  if ("height" in by) return by.height;
  const m = tree.merges;
  if (m.length === 0) return 0;
  if (applied >= m.length) return m[m.length - 1].height * 1.05 || 1;
  if (applied === 0) return m[0].height / 2;
  // Посередине между последним выполненным и первым отменённым слиянием.
  return (m[applied - 1].height + m[applied].height) / 2;
}

/** Разрезать дерево: на k кластеров или по порогу высоты h. */
export function cutHierarchy(
  tree: HierarchyTree,
  values: readonly FuzzyStudent[],
  by: CutBy,
): HierarchicalResult {
  const { n, merges, points } = tree;
  if (values.length !== n) throw new RangeError("Набор величин не соответствует дереву");
  const applied = appliedCount(tree, by);

  // Объединение листьев по выполненным слияниям (система непересекающихся множеств).
  const parent = Array.from({ length: n + merges.length }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let t = 0; t < applied; t++) {
    const id = n + t;
    parent[find(merges[t].a)] = id;
    parent[find(merges[t].b)] = id;
  }

  // Нумерация кластеров слева направо по дендрограмме.
  const rootToLabel = new Map<number, number>();
  for (const leaf of tree.leafOrder) {
    const r = find(leaf);
    if (!rootToLabel.has(r)) rootToLabel.set(r, rootToLabel.size);
  }
  const labels = Array.from({ length: n }, (_, i) => rootToLabel.get(find(i))!);
  const k = rootToLabel.size;

  const mergeLabels = merges.map((_, t) => (t < applied ? rootToLabel.get(find(n + t))! : null));

  const clusters: FuzzyStudent[][] = Array.from({ length: k }, () => []);
  values.forEach((fv, i) => clusters[labels[i]].push(fv));

  const centroids: Point[] = Array.from({ length: k }, () => [0, 0]);
  const counts = new Array<number>(k).fill(0);
  points.forEach(([x, y], i) => {
    centroids[labels[i]][0] += x;
    centroids[labels[i]][1] += y;
    counts[labels[i]]++;
  });
  centroids.forEach((c, j) => {
    c[0] /= counts[j];
    c[1] /= counts[j];
  });
  let inertia = 0;
  points.forEach((p, i) => (inertia += distance(p, centroids[labels[i]]) ** 2));

  return {
    tree,
    clusters,
    labels,
    k,
    threshold: cutHeight(tree, applied, by),
    mergeLabels,
    centroids,
    inertia,
  };
}

/** Построить дерево и сразу разрезать. */
export function hierarchical(
  values: Iterable<FuzzyStudent>,
  by: CutBy = { k: 7 },
  method: LinkageMethod = "ward",
): HierarchicalResult {
  const items = Array.from(values);
  return cutHierarchy(buildHierarchy(items, method), items, by);
}

/** Геометрия дендрограммы: x — позиция (листья 0…n−1), y — высота. */
export interface DendrogramLink {
  /** Номер слияния t. */
  index: number;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  height: number;
  size: number;
}

/** Координаты П-образных соединений для рисования дендрограммы. */
export function dendrogramLinks(tree: HierarchyTree): DendrogramLink[] {
  const { n, merges, leafOrder: order } = tree;
  const x = new Array<number>(n + merges.length);
  const y = new Array<number>(n + merges.length).fill(0);
  order.forEach((leaf, pos) => (x[leaf] = pos));
  return merges.map((m, t) => {
    const id = n + t;
    x[id] = (x[m.a] + x[m.b]) / 2;
    y[id] = m.height;
    return {
      index: t,
      leftX: x[m.a],
      leftY: y[m.a],
      rightX: x[m.b],
      rightY: y[m.b],
      height: m.height,
      size: m.size,
    };
  });
}
