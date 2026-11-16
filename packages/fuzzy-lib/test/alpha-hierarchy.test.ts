import { describe, expect, it } from "vitest";
import {
  FuzzySet,
  FuzzyStudent,
  alphaDegree,
  buildHierarchy,
  cutHierarchy,
  dendrogramLinks,
  generateSet,
  hierarchical,
  intersectAlphaCuts,
  maxCommonAlpha,
  passesAlpha,
  seededRng,
  type LinkageMethod,
} from "../src/index.js";

describe("критерии отбора по α", () => {
  const a = new FuzzyStudent(0, 1, 5, "A");
  const b = new FuzzyStudent(3, 1.5, 8, "B");

  it("Poss(A = B): 1 для самой себя, симметрична, в (0, 1)", () => {
    expect(a.possibilityEqual(a)).toBe(1);
    const p = a.possibilityEqual(b);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    expect(b.possibilityEqual(a)).toBeCloseTo(p, 12);
  });

  it("Poss(A = B) — уровень, на котором α-срезы касаются", () => {
    const p = a.possibilityEqual(b);
    expect(a.alphaCutsIntersect(b, p - 1e-6)).toBe(true);
    expect(a.alphaCutsIntersect(b, p + 1e-6)).toBe(false);
    // В точке касания срезов μ̃_A = μ̃_B = p
    const x = a.alphaCut(p).right;
    expect(a.membershipNormalized(x)).toBeCloseTo(p, 6);
    expect(b.membershipNormalized(x)).toBeCloseTo(p, 6);
  });

  it("окно: степень 1, если x₀ в окне, иначе μ̃ в ближнем конце", () => {
    expect(b.windowDegree(2, 4)).toBe(1);
    expect(b.windowDegree(0, 1)).toBeCloseTo(b.membershipNormalized(1), 12);
    expect(b.windowDegree(1, 0)).toBeCloseTo(b.membershipNormalized(1), 12);
  });

  it("окно ⇔ α-срез пересекает окно", () => {
    for (const alpha of [0.1, 0.4, 0.8]) {
      const cut = b.alphaCut(alpha);
      const intersects = cut.left <= 1 && cut.right >= 0;
      expect(passesAlpha(b, { kind: "window", a: 0, b: 1 }, alpha)).toBe(intersects);
    }
  });

  it("точка — частный случай окна при a = b = x*", () => {
    for (const x of [-2, 0.5, 3, 7]) {
      expect(alphaDegree(b, { kind: "point", x })).toBeCloseTo(b.windowDegree(x, x), 12);
    }
  });

  it("при росте α подходящих величин не становится больше", () => {
    const set = generateSet(200, { rng: seededRng(11) });
    const ref = set.get(0);
    for (const criterion of [
      { kind: "possibility" as const, reference: ref },
      { kind: "point" as const, x: 1 },
      { kind: "window" as const, a: -1, b: 2 },
    ]) {
      let prev = Infinity;
      for (const alpha of [0.05, 0.2, 0.5, 0.8, 1]) {
        const count = set.filterByAlpha(criterion, alpha).size;
        expect(count).toBeLessThanOrEqual(prev);
        prev = count;
      }
    }
    // Выбранная величина всегда проходит критерий совпадения с собой
    expect(passesAlpha(ref, { kind: "possibility", reference: ref }, 1)).toBe(true);
  });
});

describe("пересечение α-срезов", () => {
  const a = new FuzzyStudent(0, 1, 5, "A");
  const b = new FuzzyStudent(2, 1, 5, "B");
  const c = new FuzzyStudent(10, 1, 5, "C");

  it("пересечение двух срезов — [max левых; min правых]", () => {
    const r = intersectAlphaCuts([a, b], 0.3);
    expect(r.left).toBeCloseTo(b.alphaCut(0.3).left, 12);
    expect(r.right).toBeCloseTo(a.alphaCut(0.3).right, 12);
    expect(r.empty).toBe(false);
    expect(r.width).toBeCloseTo(r.right - r.left, 12);
    expect(r.leftFrom).toBe(1);
    expect(r.rightFrom).toBe(0);
  });

  it("далёкая величина делает пересечение пустым", () => {
    const r = intersectAlphaCuts([a, b, c], 0.5);
    expect(r.empty).toBe(true);
    expect(r.width).toBe(0);
  });

  it("одна величина — её собственный срез", () => {
    const r = intersectAlphaCuts([a], 0.5);
    expect(r.left).toBeCloseTo(a.alphaCut(0.5).left, 12);
    expect(r.right).toBeCloseTo(a.alphaCut(0.5).right, 12);
  });

  it("maxCommonAlpha — граница, где общее пересечение исчезает", () => {
    const vals = [a, b, new FuzzyStudent(1, 2, 3, "D")];
    const m = maxCommonAlpha(vals);
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(1);
    expect(intersectAlphaCuts(vals, m - 1e-6).empty).toBe(false);
    expect(intersectAlphaCuts(vals, m + 1e-6).empty).toBe(true);
    expect(maxCommonAlpha([a])).toBe(1);
  });
});

describe("иерархическая кластеризация", () => {
  // Величины на прямой s = 1: x₀ = 0, 1, 5, 6, 20
  const values = [0, 1, 5, 6, 20].map((x, i) => new FuzzyStudent(x, 1, 5, `v${i}`));

  it("ближний сосед: известные высоты слияний", () => {
    const tree = buildHierarchy(values, "single");
    expect(tree.merges.map((m) => m.height)).toEqual([1, 1, 4, 14]);
    expect(tree.merges[tree.merges.length - 1].size).toBe(5);
  });

  it("дальний сосед и средняя связь", () => {
    expect(buildHierarchy(values, "complete").merges.map((m) => m.height)).toEqual([1, 1, 6, 20]);
    const avg = buildHierarchy(values, "average").merges.map((m) => m.height);
    expect(avg.slice(0, 3)).toEqual([1, 1, 5]);
    expect(avg[3]).toBeCloseTo((20 + 19 + 15 + 14) / 4, 12);
  });

  it("Уорд: высоты не убывают; первое слияние = расстояние", () => {
    const tree = buildHierarchy(values, "ward");
    expect(tree.merges[0].height).toBe(1);
    for (let i = 1; i < tree.merges.length; i++) {
      expect(tree.merges[i].height).toBeGreaterThanOrEqual(tree.merges[i - 1].height);
    }
  });

  it("разрез на k кластеров", () => {
    const res = hierarchical(values, { k: 3 }, "ward");
    expect(res.k).toBe(3);
    expect(res.clusters.map((c) => c.map((v) => v.name))).toEqual([["v0", "v1"], ["v2", "v3"], ["v4"]]);
    expect(res.labels).toEqual([0, 0, 1, 1, 2]);
    // Линия среза между 2-м и 3-м слиянием
    const h = res.tree.merges.map((m) => m.height);
    expect(res.threshold).toBeCloseTo((h[1] + h[2]) / 2, 12);
    expect(res.mergeLabels.filter((l) => l !== null).length).toBe(2);
  });

  it("разрез по порогу h (по критерию)", () => {
    const tree = buildHierarchy(values, "single");
    expect(cutHierarchy(tree, values, { height: 0.5 }).k).toBe(5);
    expect(cutHierarchy(tree, values, { height: 1 }).k).toBe(3);
    expect(cutHierarchy(tree, values, { height: 10 }).k).toBe(2);
    expect(cutHierarchy(tree, values, { height: 100 }).k).toBe(1);
  });

  it("смена k перестраивает разбиение: 7 → 2", () => {
    const set = generateSet(200, { rng: seededRng(12) }).toArray();
    const tree = buildHierarchy(set, "ward");
    const r7 = cutHierarchy(tree, set, { k: 7 });
    const r2 = cutHierarchy(tree, set, { k: 2 });
    expect(r7.clusters.length).toBe(7);
    expect(r2.clusters.length).toBe(2);
    expect(r7.clusters.flat().length).toBe(200);
    expect(r2.threshold).toBeGreaterThan(r7.threshold);
    // Каждый кластер из 7 целиком лежит в одном из 2 (иерархичность)
    for (const c of r7.clusters) {
      const outer = new Set(c.map((v) => r2.labels[set.indexOf(v)]));
      expect(outer.size).toBe(1);
    }
  });

  it("все методы связи дают корректное дерево", () => {
    const set = generateSet(120, { rng: seededRng(13) }).toArray();
    for (const method of ["ward", "complete", "average", "single"] as LinkageMethod[]) {
      const tree = buildHierarchy(set, method);
      expect(tree.merges.length).toBe(119);
      expect(new Set(tree.leafOrder).size).toBe(120);
      expect(tree.merges[118].size).toBe(120);
      const links = dendrogramLinks(tree);
      expect(links.length).toBe(119);
      for (const l of links) expect(l.leftX).toBeLessThan(l.rightX);
    }
  });

  it("подмножество по α и FuzzySet.filterByAlphaCut согласованы", () => {
    const set = new FuzzySet(values);
    expect(set.filterByAlphaCut(0.5, 2, 3).toArray()).toEqual(
      set.filterByAlpha({ kind: "window", a: 2, b: 3 }, 0.5).toArray(),
    );
  });
});
