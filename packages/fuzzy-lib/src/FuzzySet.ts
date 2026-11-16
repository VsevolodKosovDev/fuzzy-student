/**
 * Множество нечётких величин (аналог FuzzySet из примера):
 * хранение, доступ по индексу, выделение подмножества, сериализация.
 */
import { FuzzyStudent, type FuzzyStudentDict } from "./FuzzyStudent.js";

/** Диапазон [min, max]; отсутствующая граница — без ограничения. */
export type Range = [min?: number, max?: number];

/** Фильтр для выделения подмножества по параметрам. */
export interface RangeFilter {
  x0?: Range;
  s?: Range;
  nu?: Range;
}

/**
 * Критерий отбора величин по уровню α. Каждый критерий задаёт степень
 * d(B) ∈ [0, 1]; величина B проходит, если d(B) ≥ α.
 *  - possibility: d(B) = Poss(A = B) — α-срезы A и B пересекаются;
 *  - point:       d(B) = μ̃_B(x*)     — точка x* лежит в α-срезе B;
 *  - window:      d(B) = sup_{x∈[a;b]} μ̃_B(x) — α-срез B пересекает окно [a; b].
 */
export type AlphaCriterion =
  | { kind: "possibility"; reference: FuzzyStudent }
  | { kind: "point"; x: number }
  | { kind: "window"; a: number; b: number };

/** Степень, с которой величина удовлетворяет критерию. */
export function alphaDegree(fv: FuzzyStudent, criterion: AlphaCriterion): number {
  switch (criterion.kind) {
    case "possibility":
      return criterion.reference.possibilityEqual(fv);
    case "point":
      return fv.membershipNormalized(criterion.x);
    case "window":
      return fv.windowDegree(criterion.a, criterion.b);
  }
}

/** Проходит ли величина уровень α по критерию. */
export function passesAlpha(fv: FuzzyStudent, criterion: AlphaCriterion, alpha: number): boolean {
  // Небольшой допуск, чтобы величины ровно на границе (например, A = B) не терялись.
  return alphaDegree(fv, criterion) >= alpha - 1e-12;
}

/** Пересечение α-срезов нескольких величин. */
export interface CutIntersection {
  alpha: number;
  /** L = max левых границ. */
  left: number;
  /** R = min правых границ. */
  right: number;
  /** true, если L > R — общих значений нет. */
  empty: boolean;
  /** R − L (0, если пусто). */
  width: number;
  /** Индекс величины, давшей L (самая правая левая граница). */
  leftFrom: number;
  /** Индекс величины, давшей R (самая левая правая граница). */
  rightFrom: number;
}

/**
 * Пересечение α-срезов: значения x, подходящие под ВСЕ величины со степенью ≥ α.
 * Срезы — отрезки, поэтому пересечение — отрезок [max левых; min правых]
 * (пустой, если max левых > min правых).
 */
export function intersectAlphaCuts(values: readonly FuzzyStudent[], alpha: number): CutIntersection {
  if (values.length === 0) throw new RangeError("Нет величин для пересечения");
  let left = -Infinity;
  let right = Infinity;
  let leftFrom = 0;
  let rightFrom = 0;
  values.forEach((v, i) => {
    const cut = v.alphaCut(alpha);
    if (cut.left > left) {
      left = cut.left;
      leftFrom = i;
    }
    if (cut.right < right) {
      right = cut.right;
      rightFrom = i;
    }
  });
  const empty = left > right + 1e-12;
  return { alpha, left, right, empty, width: empty ? 0 : Math.max(right - left, 0), leftFrom, rightFrom };
}

/**
 * Наибольшее α, при котором α-срезы всех величин ещё имеют общую точку.
 * Для отрезков на прямой общее пересечение непусто ⇔ пересекается каждая пара,
 * а пара пересекается ⇔ α ≤ Poss(Aᵢ = Aⱼ). Поэтому ответ — min по парам Poss(Aᵢ = Aⱼ).
 */
export function maxCommonAlpha(values: readonly FuzzyStudent[]): number {
  let m = 1;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      m = Math.min(m, values[i].possibilityEqual(values[j]));
    }
  }
  return m;
}

function inRange(v: number, r?: Range): boolean {
  if (!r) return true;
  const [min, max] = r;
  if (min !== undefined && Number.isFinite(min) && v < min) return false;
  if (max !== undefined && Number.isFinite(max) && v > max) return false;
  return true;
}

export class FuzzySet implements Iterable<FuzzyStudent> {
  private readonly items: FuzzyStudent[];

  constructor(items: Iterable<FuzzyStudent> = []) {
    this.items = Array.from(items);
  }

  /** Добавить величину в множество. */
  add(fv: FuzzyStudent): this {
    this.items.push(fv);
    return this;
  }

  /** Удалить величину по индексу; возвращает удалённую. */
  remove(index: number): FuzzyStudent {
    this.checkIndex(index);
    return this.items.splice(index, 1)[0];
  }

  /** Величина по индексу; отрицательный индекс — с конца (как в Python). */
  get(index: number): FuzzyStudent {
    const i = index < 0 ? this.items.length + index : index;
    this.checkIndex(i);
    return this.items[i];
  }

  get size(): number {
    return this.items.length;
  }

  /** Последние n величин (как fuzzy_set[-30:] в примере). */
  last(n: number): FuzzyStudent[] {
    return this.items.slice(Math.max(0, this.items.length - n));
  }

  toArray(): FuzzyStudent[] {
    return this.items.slice();
  }

  [Symbol.iterator](): Iterator<FuzzyStudent> {
    return this.items[Symbol.iterator]();
  }

  /**
   * Выделить подмножество:
   *  - по списку индексов, или
   *  - по предикату (fv, i) => boolean.
   * Величины не копируются — подмножество ссылается на те же объекты.
   */
  subset(selector: readonly number[] | ((fv: FuzzyStudent, index: number) => boolean)): FuzzySet {
    if (typeof selector === "function") {
      return new FuzzySet(this.items.filter(selector));
    }
    const unique = Array.from(new Set(selector));
    unique.forEach((i) => this.checkIndex(i));
    return new FuzzySet(unique.sort((a, b) => a - b).map((i) => this.items[i]));
  }

  /** Подмножество величин, параметры которых попадают в заданные диапазоны. */
  filterByRange(filter: RangeFilter): FuzzySet {
    return this.subset(
      (fv) => inRange(fv.x0, filter.x0) && inRange(fv.s, filter.s) && inRange(fv.nu, filter.nu),
    );
  }

  /**
   * Подмножество величин, у которых α-срез пересекается с отрезком [a, b]
   * (величины, «возможные» на этом отрезке со степенью не ниже α).
   */
  filterByAlphaCut(alpha: number, a: number, b: number): FuzzySet {
    return this.filterByAlpha({ kind: "window", a, b }, alpha);
  }

  /** Подмножество величин, прошедших уровень α по заданному критерию. */
  filterByAlpha(criterion: AlphaCriterion, alpha: number): FuzzySet {
    return this.subset((fv) => passesAlpha(fv, criterion, alpha));
  }

  toList(): FuzzyStudentDict[] {
    return this.items.map((fv) => fv.toDict());
  }

  static fromList(list: readonly FuzzyStudentDict[]): FuzzySet {
    if (!Array.isArray(list)) throw new TypeError("Ожидался массив величин");
    return new FuzzySet(list.map((d) => FuzzyStudent.fromDict(d)));
  }

  private checkIndex(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= this.items.length) {
      throw new RangeError(`Индекс ${i} вне множества (размер ${this.items.length})`);
    }
  }
}
