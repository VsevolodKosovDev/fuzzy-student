import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FuzzySet,
  FuzzyStudent,
  LINKAGE_NAMES,
  buildHierarchy,
  cutHierarchy,
  fmt,
  generateSet,
  intersectAlphaCuts,
  kmeans,
  type HierarchicalResult,
  type HierarchyTree,
  type KMeansResult,
  type LinkageMethod,
  type RangeFilter,
} from "fuzzy-lib";
import { api } from "./api";
import { DEFAULT_K, LAST_N_ON_CHART, MAX_ALPHA_VALUES, MAX_CLUSTERS, REPO_URL } from "./config";
import { useChartTheme } from "./theme";
import { clustersText, errorText } from "./util";
import { InputBar } from "./components/InputBar";
import { FuzzyTable } from "./components/FuzzyTable";
import { OperationsPanel, type OperationChoice, type OperationReport } from "./components/OperationsPanel";
import { ClusterPanel, type ClusterConfig, type ClusterSummary } from "./components/ClusterPanel";
import { SubsetPanel, type View } from "./components/SubsetPanel";
import { LogPanel } from "./components/LogPanel";
import { MembershipChart } from "./components/MembershipChart";
import { AlphaLevelView } from "./components/AlphaLevelView";
import { AlphaCutView } from "./components/AlphaCutView";
import { ClusterScatter } from "./components/ClusterScatter";
import { Dendrogram } from "./components/Dendrogram";
import { Tex } from "./components/Tex";
import { ValueEditor, type Params } from "./components/ValueEditor";

type Tab = "level" | "alpha" | "membership" | "clusters";
type Status = { text: string; kind: "info" | "error" };
type ClusterState =
  | { method: "kmeans"; res: KMeansResult }
  | { method: "hierarchical"; res: HierarchicalResult };
/** Кластеризация одного режима просмотра: по какому списку и с какими настройками получена. */
type ClusterEntry = { list: FuzzyStudent[]; cfg: ClusterConfig; st: ClusterState };

const VIEW_NAMES: Record<View, string> = { all: "всё множество", subset: "подмножество" };

const sameConfig = (a: ClusterConfig, b: ClusterConfig) =>
  a.method === b.method && a.linkage === b.linkage && a.mode === b.mode && a.k === b.k && a.h === b.h;

const TABS: { id: Tab; label: string }[] = [
  { id: "level", label: "Величины и α-уровень" },
  { id: "alpha", label: "α-срезы: до и после" },
  { id: "membership", label: "Функции принадлежности φ(x)" },
  { id: "clusters", label: "Кластеры" },
];

const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  method: "hierarchical",
  linkage: "ward",
  mode: "k",
  k: DEFAULT_K,
  h: 10,
};

/** Журнал: запись на сервер (fuzzy_log.txt) и чтение последних строк. */
function useLog() {
  const [lines, setLines] = useState<string[]>([]);
  const [file, setFile] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    api
      .getLog()
      .then((r) => {
        setLines(r.lines);
        setFile(r.file);
      })
      .catch(() => setOnline(false));
  }, []);

  const log = useCallback((message: string) => {
    api
      .log(message)
      .then((r) => {
        setOnline(true);
        setLines((prev) => [...prev.slice(-499), r.line]);
      })
      .catch(() => {
        setOnline(false);
        setLines((prev) => [...prev.slice(-499), `[не записано в файл] ${message}`]);
      });
  }, []);

  return { lines, file, online, log };
}

export default function App() {
  const theme = useChartTheme();
  const { lines, file, online, log } = useLog();

  const [items, setItems] = useState<FuzzyStudent[]>([]);
  const [subset, setSubset] = useState<FuzzyStudent[] | null>(null);
  const [view, setView] = useState<View>("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [clusterConfig, setClusterConfig] = useState<ClusterConfig>(DEFAULT_CLUSTER_CONFIG);
  /** Кластеризации всего множества и подмножества хранятся отдельно и не сбрасываются при переключении. */
  const [clusterCache, setClusterCache] = useState<Partial<Record<View, ClusterEntry>>>({});
  const [report, setReport] = useState<OperationReport | null>(null);
  const [alpha, setAlpha] = useState(0.5);
  const [tab, setTab] = useState<Tab>("level");
  const [status, setStatus] = useState<Status>({
    text: "Готово. Сгенерируйте набор величин или добавьте величину вручную.",
    kind: "info",
  });

  const active = view === "subset" && subset ? subset : items;
  // Кластеризация действительна, пока список тот же (добавление/правка величин создают новый список).
  const clusterEntry = clusterCache[view];
  const clusters = clusterEntry && clusterEntry.list === active ? clusterEntry.st : null;
  const selectedValues = useMemo(() => selected.map((i) => active[i]).filter(Boolean), [selected, active]);

  // --- Связь таблицы и графиков ----------------------------------------------

  /** Величина под курсором — в таблице или на любом графике. */
  const [hovered, setHovered] = useState<FuzzyStudent | null>(null);
  const hover = useCallback((v: FuzzyStudent | null) => setHovered((prev) => (prev === v ? prev : v)), []);
  const [scrollRequest, setScrollRequest] = useState<{ index: number; n: number } | null>(null);

  /** Щелчок по кривой/точке: как щелчок по строке таблицы (Ctrl — добавить к выделению). */
  const pick = useCallback(
    (v: FuzzyStudent, additive: boolean) => {
      const i = active.indexOf(v);
      if (i < 0) return;
      setSelected((prev) =>
        additive
          ? prev.includes(i)
            ? prev.filter((j) => j !== i)
            : [...prev, i]
          : prev.length === 1 && prev[0] === i
            ? []
            : [i],
      );
      setScrollRequest((prev) => ({ index: i, n: (prev?.n ?? 0) + 1 }));
    },
    [active],
  );

  const info = (text: string) => setStatus({ text, kind: "info" });
  const fail = (text: string) => setStatus({ text, kind: "error" });

  /** Сменился отображаемый список — выделение (номера строк) относится к старому. */
  const resetDerived = () => setSelected([]);

  // --- Ввод и генерация ------------------------------------------------------

  const addValue = (x0: number, s: number, nu: number) => {
    try {
      const fv = new FuzzyStudent(x0, s, nu);
      setItems((prev) => [...prev, fv]);
      if (view === "subset") setSubset((prev) => (prev ? [...prev, fv] : prev));
      log(`Добавлена величина ${fv.toString()}`);
      info(`Добавлена ${fv.name}`);
    } catch (e) {
      fail(errorText(e));
    }
  };

  const generate = (n: number) => {
    if (!Number.isInteger(n) || n < 100 || n > 300) {
      fail("Количество величин должно быть целым от 100 до 300");
      return;
    }
    const set = generateSet(n);
    setItems(set.toArray());
    setSubset(null);
    setView("all");
    resetDerived();
    setClusterCache({});
    setReport(null);
    log(`Сгенерировано ${n} нечётких величин`);
    info(`Сгенерировано ${n} величин: x₀ ∈ [−10; 10], s ∈ [0.5; 3], ν ∈ {1…30}. Выделите величину в таблице.`);
  };

  // --- Операции --------------------------------------------------------------

  const runOperation = (op: OperationChoice) => {
    if (selectedValues.length !== 2) {
      fail("Выделите ровно ДВЕ величины в таблице (Ctrl + щелчок)");
      return;
    }
    const [a, b] = selectedValues;
    try {
      if (op === "cmp") {
        const { order, steps, stepsTex } = FuzzyStudent.compare(a, b);
        const sign = order < 0 ? "<" : order > 0 ? ">" : "=";
        const poss = a.possibilityEqual(b);
        setReport({
          title: `Сравнение: ${a.name} ${sign} ${b.name}`,
          subtitle: "Сравнение по центрам x₀ (как в примере) и возможность равенства",
          stepsTex: [
            ...stepsTex,
            String.raw`\operatorname{Poss}(A = B) = \sup_x \min\big(\tilde\mu_A(x),\, \tilde\mu_B(x)\big) = ${fmt(poss, 4)}`,
          ],
          notes: [
            ...steps.slice(3),
            `α-срезы A и B пересекаются при α ≤ ${fmt(poss, 4)}.`,
          ],
        });
        log(`Сравнение: ${a.name} ${sign} ${b.name} (x₀: ${fmt(a.x0)} ${sign} ${fmt(b.x0)}), Poss(A=B)=${fmt(poss, 4)}`);
        info(`${a.name} ${sign} ${b.name}`);
        return;
      }
      const { result, steps, stepsTex } = FuzzyStudent.operate(a, op, b);
      setItems((prev) => [...prev, result]);
      if (view === "subset") setSubset((prev) => (prev ? [...prev, result] : prev));
      setReport({ title: `Результат: ${result.name}`, subtitle: steps[0].split(":")[0], stepsTex });
      log(`Операция: ${a.name} ${op} ${b.name} = ${result.toString()}; ${steps.slice(1, -1).join("; ")}`);
      info(`Успешно выполнено: ${result.name}`);
    } catch (e) {
      const msg = errorText(e);
      fail(
        msg.includes("x₀ ≈ 0")
          ? "Нельзя делить на нечёткую величину, у которой x₀ ≈ 0 (это вызовет бесконечность)."
          : msg,
      );
    }
  };

  const swapAB = () => {
    if (selected.length >= 2) setSelected([selected[1], selected[0], ...selected.slice(2)]);
  };

  // --- Изменение параметров выбранной величины ------------------------------

  /** Заменить величину A новой с другими параметрами (величины неизменяемые — создаём новую). */
  const editValue = ({ x0, s, nu }: Params) => {
    const old = selectedValues[0];
    if (!old) return;
    // Имя «T(x₀;s;ν)» пересчитываем, собственное имя (например, «(A + B)») сохраняем.
    const keepName = old.name !== FuzzyStudent.defaultName(old.x0, old.s, old.nu);
    let fv: FuzzyStudent;
    try {
      fv = new FuzzyStudent(x0, s, nu, keepName ? old.name : "");
    } catch (e) {
      fail(errorText(e));
      return;
    }
    const replace = (list: FuzzyStudent[]) => list.map((v) => (v === old ? fv : v));
    setItems(replace);
    setSubset((prev) => (prev ? replace(prev) : prev));
    setHovered((h) => (h === old ? fv : h));
    // Список заменяется новым — кластеризация по старому списку перестаёт действовать.
    if (clusters) clustersResetByEdit.current = true;
  };

  /** Кластеры сброшены правкой — сказать об этом в сообщении после правки. */
  const clustersResetByEdit = useRef(false);

  const commitEdit = (before: Params, after: Params) => {
    const t = (p: Params) => `T(${fmt(p.x0, 3)}; ${fmt(p.s, 3)}; ${p.nu})`;
    log(`Изменена величина: ${t(before)} → ${t(after)}`);
    const note = clustersResetByEdit.current ? " Кластеры сброшены — запустите кластеризацию заново." : "";
    clustersResetByEdit.current = false;
    info(`Изменена величина: ${t(before)} → ${t(after)}.${note}`);
  };

  /** Какие кривые показывать на вкладке φ(x). */
  const [phiShow, setPhiShow] = useState<"last" | "all" | "selected">("last");

  // --- Кластеризация ---------------------------------------------------------

  // Дерево слияний строится один раз на набор и метод связи; разрез — мгновенно.
  // Храним два последних дерева — для всего множества и для подмножества.
  const treeCache = useRef<{ list: FuzzyStudent[]; method: LinkageMethod; tree: HierarchyTree }[]>([]);
  const getTree = (list: FuzzyStudent[], method: LinkageMethod) => {
    const hit = treeCache.current.find((c) => c.list === list && c.method === method);
    if (hit) return hit.tree;
    const tree = buildHierarchy(list, method);
    treeCache.current = [{ list, method, tree }, ...treeCache.current].slice(0, 2);
    return tree;
  };

  const storeClusters = (v: View, list: FuzzyStudent[], cfg: ClusterConfig, st: ClusterState | null) =>
    setClusterCache((prev) => {
      const next = { ...prev };
      if (st) next[v] = { list, cfg, st };
      else delete next[v];
      return next;
    });

  const runClustering = (cfg: ClusterConfig, list: FuzzyStudent[], v: View = view): ClusterState | null => {
    const where = VIEW_NAMES[v];
    if (list.length === 0) {
      fail("Сначала сгенерируйте или добавьте величины");
      return null;
    }
    const maxK = Math.min(MAX_CLUSTERS, list.length);
    const byK = cfg.method === "kmeans" || cfg.mode === "k";
    if (byK && (!Number.isInteger(cfg.k) || cfg.k < 1 || cfg.k > maxK)) {
      fail(`k должно быть целым от 1 до ${maxK}`);
      return null;
    }
    try {
      if (cfg.method === "kmeans") {
        const res = kmeans(list, cfg.k);
        const sizes = res.clusters.map((c) => c.length);
        log(
          `Кластеризация k-means (${where}, ${list.length} вел.), k=${cfg.k}: размеры [${sizes.join(", ")}], ` +
            `J=${fmt(res.inertia, 3)}, итераций ${res.iterations}`,
        );
        info(`k-means (${where}): кластеры [${sizes.join(", ")}]`);
        return { method: "kmeans", res };
      }
      const tree = getTree(list, cfg.linkage);
      const res = cutHierarchy(tree, list, byK ? { k: cfg.k } : { height: cfg.h });
      if (res.k > MAX_CLUSTERS) {
        fail(`Порог h = ${fmt(cfg.h)} даёт ${clustersText(res.k)} — максимум ${MAX_CLUSTERS}. Увеличьте h.`);
        return null;
      }
      const sizes = res.clusters.map((c) => c.length);
      const how = byK ? `k=${cfg.k}` : `порог h=${fmt(cfg.h)} → k=${res.k}`;
      log(
        `Иерархическая кластеризация (${where}, ${list.length} вел., метод ${LINKAGE_NAMES[cfg.linkage]}), ${how}: ` +
          `размеры [${sizes.join(", ")}], срез h=${fmt(res.threshold, 3)}, J=${fmt(res.inertia, 3)}`,
      );
      info(`Иерархическая (${where}, ${LINKAGE_NAMES[cfg.linkage]}): ${clustersText(res.k)} [${sizes.join(", ")}]`);
      return { method: "hierarchical", res };
    } catch (e) {
      fail(errorText(e));
      return null;
    }
  };

  const cluster = () => {
    const st = runClustering(clusterConfig, active);
    if (st) {
      storeClusters(view, active, clusterConfig, st);
      setTab("clusters");
    }
  };

  const changeClusterConfig = (cfg: ClusterConfig) => {
    // При переходе к порогу h начинаем с текущей высоты среза.
    if (cfg.mode === "h" && clusterConfig.mode === "k" && clusters?.method === "hierarchical") {
      cfg = { ...cfg, h: Number(clusters.res.threshold.toFixed(2)) };
    }
    setClusterConfig(cfg);
    if (clusters) {
      const st = runClustering(cfg, active);
      if (st) storeClusters(view, active, cfg, st);
    }
  };

  /**
   * Переход к другому списку (всё множество ↔ подмножество). Если кластеры были показаны,
   * у нового списка они тоже будут: сохранённые, если получены с теми же настройками,
   * иначе — пересчитанные с текущими настройками.
   */
  const followClusters = (v: View, list: FuzzyStudent[]) => {
    if (!clusters) return;
    const e = clusterCache[v];
    if (e && e.list === list && sameConfig(e.cfg, clusterConfig)) return;
    storeClusters(v, list, clusterConfig, runClustering(clusterConfig, list, v));
  };

  const clusterSummary = useMemo<ClusterSummary | null>(() => {
    if (!clusters) return null;
    const { res } = clusters;
    const base = { sizes: res.clusters.map((c) => c.length), centroids: res.centroids, inertia: res.inertia };
    if (clusters.method === "kmeans") return { ...base, iterations: clusters.res.iterations };
    const m = clusters.res.tree.merges;
    return { ...base, threshold: clusters.res.threshold, rootHeight: m.length ? m[m.length - 1].height : 0 };
  }, [clusters]);

  // --- Подмножество ----------------------------------------------------------

  const makeSubset = (sub: FuzzySet, description: string) => {
    if (sub.size === 0) {
      fail(`Подмножество пустое (${description})`);
      return;
    }
    const list = sub.toArray();
    setSubset(list);
    setView("subset");
    resetDerived();
    log(`Выделено подмножество: ${description} — ${sub.size} из ${active.length}`);
    info(`Подмножество: ${sub.size} из ${active.length}`);
    followClusters("subset", list);
  };

  const subsetFromSelection = () => makeSubset(new FuzzySet(active).subset(selected), "выделенные строки");

  const subsetByFilter = (filter: RangeFilter, description: string) =>
    makeSubset(new FuzzySet(active).filterByRange(filter), `фильтр ${description}`);

  const subsetByAlphaLevel = (indices: number[], description: string) =>
    makeSubset(new FuzzySet(active).subset(indices), `α-уровень, ${description}`);

  const changeView = (v: View) => {
    if (v === view) return;
    if (v === "subset" && !subset) {
      fail(
        "Подмножество ещё не создано. Создайте его: «Выделить подмножество» на вкладке «Величины и α-уровень», " +
          "«Из выделенных» (отметьте строки в таблице) или «По фильтру».",
      );
      return;
    }
    setView(v);
    resetDerived();
    followClusters(v, v === "subset" && subset ? subset : items);
  };

  const dropSubset = () => {
    if (view === "subset") followClusters("all", items);
    setSubset(null);
    setView("all");
    resetDerived();
    storeClusters("subset", [], clusterConfig, null);
    log("Подмножество удалено");
  };

  // --- Файлы -----------------------------------------------------------------

  const save = async () => {
    try {
      const r = await api.save(new FuzzySet(items).toList());
      log(`Сохранено в fuzzy_set.json (${r.count} величин)`);
      info(`Сохранено ${r.count} величин: ${r.file}`);
    } catch (e) {
      fail(`Не удалось сохранить: ${errorText(e)}`);
    }
  };

  const load = async () => {
    try {
      const r = await api.load();
      const set = FuzzySet.fromList(r.items);
      setItems(set.toArray());
      setSubset(null);
      setView("all");
      resetDerived();
      setClusterCache({});
      setReport(null);
      log(`Загружено из fuzzy_set.json (${set.size} величин)`);
      info(`Загружено ${set.size} величин: ${r.file}`);
    } catch (e) {
      fail(`Не удалось загрузить: ${errorText(e)}`);
    }
  };

  // --- Данные для графиков ---------------------------------------------------

  const background = useMemo(
    () => (phiShow === "all" ? active : phiShow === "last" ? active.slice(-LAST_N_ON_CHART) : []),
    [active, phiShow],
  );
  const highlighted = useMemo(() => selectedValues.slice(0, 8), [selectedValues]);
  const alphaValues = useMemo(
    () => (selectedValues.length > 0 ? selectedValues : active.slice(-3)).slice(0, MAX_ALPHA_VALUES),
    [selectedValues, active],
  );

  const commitAlphaCuts = () => {
    if (alphaValues.length === 0) return;
    const cuts = alphaValues.map((v) => {
      const c = v.alphaCut(alpha);
      return `${v.name}: [${fmt(c.left, 3)}; ${fmt(c.right, 3)}]`;
    });
    let common = "";
    if (alphaValues.length >= 2) {
      const r = intersectAlphaCuts(alphaValues, alpha);
      common = r.empty
        ? "; общее пересечение пусто"
        : `; общее пересечение [${fmt(r.left, 3)}; ${fmt(r.right, 3)}], ширина ${fmt(r.width, 3)}`;
    }
    log(`α-срез при α=${alpha.toFixed(2)}: ${cuts.join(", ")}${common}`);
  };

  return (
    <div className="app">
      <header>
        <h1>Нечёткие величины Стьюдента T(x₀, s, ν)</h1>
        <div className={`status ${status.kind}`} role="status">
          {status.text}
        </div>
        {!online && (
          <div className="status error">
            Сервер журнала недоступен — запустите <code>npm run dev</code>; записи не попадают в fuzzy_log.txt.
          </div>
        )}
      </header>

      <main>
        <div className="left">
          <InputBar onAdd={addValue} onGenerate={generate} />
          <FuzzyTable
            items={active}
            selected={selected}
            onSelect={setSelected}
            labels={clusters?.res.labels ?? null}
            hovered={hovered}
            onHover={hover}
            scrollRequest={scrollRequest}
            theme={theme}
          />
          <OperationsPanel
            a={selectedValues[0]}
            b={selectedValues[1]}
            onRun={runOperation}
            onSwap={swapAB}
            report={report}
          />
          <ClusterPanel
            config={clusterConfig}
            onChange={changeClusterConfig}
            onCluster={cluster}
            onReset={() => storeClusters(view, active, clusterConfig, null)}
            summary={clusterSummary}
            theme={theme}
          />
          <SubsetPanel
            selectedCount={selected.length}
            totalCount={active.length}
            subsetCount={subset?.length ?? null}
            view={view}
            onFromSelection={subsetFromSelection}
            onFilter={subsetByFilter}
            onView={changeView}
            onReset={dropSubset}
          />
        </div>

        <div className="right">
          <section className="panel charts">
            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? "tab active" : "tab"}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === "level" && (
              <AlphaLevelView
                values={active}
                reference={selectedValues[0]}
                alpha={alpha}
                onAlpha={setAlpha}
                onCommit={log}
                onMakeSubset={subsetByAlphaLevel}
                hovered={hovered}
                onHover={hover}
                onPick={pick}
                theme={theme}
              />
            )}
            {tab === "alpha" && (
              <AlphaCutView
                values={alphaValues}
                alpha={alpha}
                onAlpha={setAlpha}
                onCommit={commitAlphaCuts}
                selectedCount={selectedValues.length}
                hovered={hovered}
                onHover={hover}
                onPick={pick}
                theme={theme}
              />
            )}
            {tab === "membership" && (
              <>
                <Tex
                  block
                  tex={String.raw`\varphi(x) = \frac{\Gamma\left(\frac{\nu+1}{2}\right)}{s\sqrt{\nu\pi}\;\Gamma\left(\frac{\nu}{2}\right)}\left(1 + \frac{1}{\nu}\left(\frac{x - x_0}{s}\right)^2\right)^{-\frac{\nu+1}{2}}`}
                />
                <div className="row" role="radiogroup" aria-label="Какие кривые показывать">
                  <span className="hint" style={{ margin: 0 }}>
                    Показать:
                  </span>
                  <label>
                    <input type="radio" checked={phiShow === "last"} onChange={() => setPhiShow("last")} />
                    последние {LAST_N_ON_CHART} (как в примере)
                  </label>
                  <label>
                    <input type="radio" checked={phiShow === "all"} onChange={() => setPhiShow("all")} />
                    все ({active.length})
                  </label>
                  <label>
                    <input type="radio" checked={phiShow === "selected"} onChange={() => setPhiShow("selected")} />
                    только выделенные ({selectedValues.length})
                  </label>
                </div>
                <p className="hint">
                  Серым — {phiShow === "selected" ? "ничего" : phiShow === "all" ? "все величины" : `последние ${LAST_N_ON_CHART} величин`},
                  цветом — выделенные (до 8), толстой линией — величина под курсором.
                </p>
                {phiShow === "selected" && selectedValues.length === 0 ? (
                  <div className="chart-empty">Выделите величины в таблице (Ctrl + щелчок)</div>
                ) : (
                  <MembershipChart
                    background={background}
                    highlighted={highlighted}
                    hovered={hovered}
                    onHover={hover}
                    onPick={pick}
                    theme={theme}
                  />
                )}
                <ValueEditor
                  value={selectedValues[0]}
                  index={selected[0]}
                  onChange={editValue}
                  onCommit={commitEdit}
                />
              </>
            )}
            {tab === "clusters" && clusters && (
              <p className="hint">
                Кластеризовано: <b>{VIEW_NAMES[view]}</b> ({active.length} вел.).
                {subset && " Переключение «Всё множество / Подмножество» сохраняет кластеры каждого."}
              </p>
            )}
            {tab === "clusters" &&
              (clusters?.method === "hierarchical" ? (
                <div className="cluster-view">
                  <figure>
                    <figcaption>Дендрограмма</figcaption>
                    <Dendrogram result={clusters.res} theme={theme} />
                  </figure>
                  <figure>
                    <figcaption>Величины (x₀, s) по кластерам</figcaption>
                    <ClusterScatter
                      items={active}
                      clusters={clusters.res.clusters}
                      centroids={clusters.res.centroids}
                      hovered={hovered}
                      onHover={hover}
                      onPick={pick}
                      theme={theme}
                      height={400}
                    />
                  </figure>
                </div>
              ) : (
                <>
                  {!clusters && (
                    <p className="hint">Нажмите «Кластеризовать» — появятся дендрограмма и точки по кластерам.</p>
                  )}
                  <ClusterScatter
                    items={active}
                    clusters={clusters?.res.clusters ?? null}
                    centroids={clusters?.res.centroids ?? null}
                    hovered={hovered}
                    onHover={hover}
                    onPick={pick}
                    theme={theme}
                  />
                </>
              ))}
          </section>
          <LogPanel lines={lines} file={file} onSave={save} onLoad={load} />
        </div>
      </main>

      <footer>
        Репозиторий: <a href={REPO_URL}>{REPO_URL}</a> · Формулы: Абчук В. А. и др. «Справочник по исследованию
        операций», табл. 2.2.5, 2.2.7
      </footer>
    </div>
  );
}
