import { useEffect, useState } from "react";
import { LINKAGE_NAMES, fmt, type LinkageMethod, type Point } from "fuzzy-lib";
import { MAX_CLUSTERS } from "../config";
import { POINT_SYMBOLS, type ChartTheme } from "../theme";
import { parseNum } from "../util";
import { Tex } from "./Tex";

export interface ClusterConfig {
  method: "hierarchical" | "kmeans";
  linkage: LinkageMethod;
  /** Иерархический метод: разрез на k кластеров или по порогу h. */
  mode: "k" | "h";
  k: number;
  h: number;
}

/** Общие данные результата для отображения (оба метода). */
export interface ClusterSummary {
  sizes: number[];
  centroids: Point[];
  inertia: number;
  /** Иерархический метод: высота среза и высота корня дерева. */
  threshold?: number;
  rootHeight?: number;
  iterations?: number;
}

interface Props {
  config: ClusterConfig;
  onChange: (config: ClusterConfig) => void;
  onCluster: () => void;
  onReset: () => void;
  summary: ClusterSummary | null;
  theme: ChartTheme;
}

const LINKAGES: LinkageMethod[] = ["ward", "complete", "average", "single"];

/** Кластерный анализ: иерархический (дендрограмма) или k-means. */
export function ClusterPanel({ config, onChange, onCluster, onReset, summary, theme }: Props) {
  const [kText, setKText] = useState(String(config.k));
  const [hText, setHText] = useState(String(config.h));
  // Если значение поменялось снаружи (например, h подставлен из текущего среза) — обновить поле.
  useEffect(() => {
    if (parseNum(kText) !== config.k) setKText(String(config.k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.k]);
  useEffect(() => {
    if (parseNum(hText) !== config.h) setHText(String(config.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.h]);

  const hierarchical = config.method === "hierarchical";
  const byK = !hierarchical || config.mode === "k";

  const changeK = (text: string) => {
    setKText(text);
    const k = parseNum(text);
    if (Number.isInteger(k) && k >= 1) onChange({ ...config, k });
  };
  const changeH = (text: string) => {
    setHText(text);
    const h = parseNum(text);
    if (h >= 0) onChange({ ...config, h });
  };

  return (
    <section className="panel">
      <h2>Кластерный анализ</h2>
      <div className="row" role="radiogroup" aria-label="Метод">
        <label>
          <input
            type="radio"
            checked={hierarchical}
            onChange={() => onChange({ ...config, method: "hierarchical" })}
          />
          Иерархический (дендрограмма)
        </label>
        <label>
          <input type="radio" checked={!hierarchical} onChange={() => onChange({ ...config, method: "kmeans" })} />
          k-means
        </label>
      </div>

      {hierarchical && (
        <>
          <div className="row">
            <label>
              Метод связи
              <select
                value={config.linkage}
                onChange={(e) => onChange({ ...config, linkage: e.target.value as LinkageMethod })}
              >
                {LINKAGES.map((m) => (
                  <option key={m} value={m}>
                    {LINKAGE_NAMES[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row" role="radiogroup" aria-label="Разрез дерева">
            <label>
              <input type="radio" checked={config.mode === "k"} onChange={() => onChange({ ...config, mode: "k" })} />
              На k кластеров
            </label>
            <label>
              <input type="radio" checked={config.mode === "h"} onChange={() => onChange({ ...config, mode: "h" })} />
              По порогу расстояния h
            </label>
          </div>
        </>
      )}

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          onCluster();
        }}
      >
        {byK ? (
          <label>
            Кластеры (k)
            <input
              type="number"
              min={1}
              max={MAX_CLUSTERS}
              value={kText}
              onChange={(e) => changeK(e.target.value)}
              style={{ width: "4.5em" }}
            />
          </label>
        ) : (
          <label>
            Порог h
            <input
              type="number"
              min={0}
              step={0.5}
              value={hText}
              onChange={(e) => changeH(e.target.value)}
              style={{ width: "6em" }}
            />
          </label>
        )}
        <button type="submit">Кластеризовать</button>
        {summary && (
          <button type="button" className="secondary" onClick={onReset}>
            Сбросить
          </button>
        )}
      </form>

      <p className="hint">
        Расстояние между величинами:{" "}
        <Tex tex={String.raw`d(A, B) = \sqrt{(x_0^A - x_0^B)^2 + (s^A - s^B)^2}`} />.
        {hierarchical ? (
          config.mode === "k" ? (
            " Дерево режется так, чтобы осталось k ветвей."
          ) : (
            " Кластеры — ветви, слитые на расстоянии не больше h (разбиение по критерию)."
          )
        ) : (
          <>
            {" "}
            k-means минимизирует <Tex tex={String.raw`J = \sum_j \sum_{A \in K_j} d(A, c_j)^2`} />.
          </>
        )}{" "}
        После первого запуска изменения k, h и метода применяются сразу.
      </p>

      {summary && (
        <div className="cluster-summary">
          <ul>
            {summary.sizes.map((size, j) => (
              <li key={j}>
                <span style={{ color: theme.series[j] }}>{POINT_SYMBOLS[j]}</span> Кластер {j + 1}: <b>{size}</b> вел.,
                центр ({fmt(summary.centroids[j][0], 2)}; {fmt(summary.centroids[j][1], 2)})
              </li>
            ))}
          </ul>
          <p className="hint">
            k = {summary.sizes.length} · J = {fmt(summary.inertia, 3)}
            {summary.threshold !== undefined && ` · срез h = ${fmt(summary.threshold, 3)}`}
            {summary.rootHeight !== undefined && ` · высота корня ${fmt(summary.rootHeight, 3)}`}
            {summary.iterations !== undefined && ` · итераций ${summary.iterations}`}
          </p>
        </div>
      )}
    </section>
  );
}
