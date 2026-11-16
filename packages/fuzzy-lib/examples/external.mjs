// Пример использования библиотеки fuzzy-lib внешней программой (без веб-интерфейса).
// Запуск из каталога fuzzy-student: npm run build:lib, затем node packages/fuzzy-lib/examples/external.mjs
import { FuzzyStudent, Logger, generateSet, seededRng,
         buildHierarchy, cutHierarchy } from "../dist/index.js";
const log = new Logger((line) => console.log(line));

// 1. Величины и α-срезы
const a = new FuzzyStudent(2, 1, 4, "A");
const b = new FuzzyStudent(3, 2, 6, "B");
console.log("μ̃_A(2.5) =", a.membershipNormalized(2.5).toFixed(4));
const cut = a.alphaCut(0.5);
console.log(`α-срез A при α = 0.5: [${cut.left.toFixed(4)}; ${cut.right.toFixed(4)}]`);

// 2. Операции с расчётом по шагам
for (const op of ["+", "-", "*", "/"]) {
  const { result } = FuzzyStudent.operate(a, op, b);
  log.log(`A ${op} B = ${result.toString()}`);
}

// 3. Сравнение
console.log("A < B:", a.lessThan(b), " Poss(A = B) =",
            a.possibilityEqual(b).toFixed(4));

// 4. Генерация и кластеризация на k кластеров и по порогу h
const set = generateSet(200, { rng: seededRng(2026) });
const values = set.toArray();
const tree = buildHierarchy(values, "ward");
for (const k of [7, 2]) {
  const r = cutHierarchy(tree, values, { k });
  console.log(`k = ${k}: размеры [${r.clusters.map((c) => c.length).join(", ")}]`);
}
console.log("порог h = 20:", cutHierarchy(tree, values, { height: 20 }).k);

// 5. Подмножество по уровню α
const ref = values.find((v) => v.name === "T(-0.30;1.97;9)");
const subset = set.filterByAlpha({ kind: "possibility", reference: ref }, 0.5);
console.log(`Совместимы с ${ref.name}: ${subset.size} из ${set.size}`);
