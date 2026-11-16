import { useEffect, useState } from "react";
import type { PointStyle } from "chart.js";

/** Цвета для графиков (светлая и тёмная тема). */
export interface ChartTheme {
  dark: boolean;
  surface: string;
  text: string;
  textSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  /** Категориальные цвета — фиксированный порядок, без повторов по кругу. */
  series: string[];
}

const LIGHT: ChartTheme = {
  dark: false,
  surface: "#fcfcfb",
  text: "#0b0b0b",
  textSecondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
};

const DARK: ChartTheme = {
  dark: true,
  surface: "#1a1a19",
  text: "#f0efec",
  textSecondary: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};

/**
 * Форма маркера для каждого кластера — различие не только по цвету.
 * «✕» (crossRot) не используется: им обозначены центры кластеров.
 */
export const POINT_STYLES: { style: PointStyle; rotation: number }[] = [
  { style: "circle", rotation: 0 },
  { style: "rect", rotation: 0 },
  { style: "triangle", rotation: 0 },
  { style: "rectRot", rotation: 0 },
  { style: "triangle", rotation: 180 },
  { style: "star", rotation: 0 },
  { style: "cross", rotation: 0 },
  { style: "rectRounded", rotation: 0 },
];

/** Маркеры, которые рисуются только контуром (заливки нет). */
export function isStrokeOnly(style: PointStyle): boolean {
  return style === "star" || style === "cross" || style === "crossRot" || style === "line" || style === "dash";
}

/** Подписи формы маркера для таблицы. */
export const POINT_SYMBOLS = ["●", "■", "▲", "◆", "▼", "✶", "+", "▢"];

const query = "(prefers-color-scheme: dark)";

/** Текущая тема графиков, следит за настройкой системы. */
export function useChartTheme(): ChartTheme {
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return dark ? DARK : LIGHT;
}

/** #rrggbb → rgba(r, g, b, a). */
export function withAlpha(hex: string, alpha: number): string {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
}

/** Оформление линейной оси. */
export function linearAxis(theme: ChartTheme, title: string, extra: Record<string, unknown> = {}) {
  return {
    type: "linear" as const,
    title: { display: true, text: title, color: theme.textSecondary },
    ticks: { color: theme.muted },
    grid: { color: theme.grid },
    border: { color: theme.axis },
    ...extra,
  };
}

/** Общие настройки графиков. */
export function baseOptions(theme: ChartTheme) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    color: theme.textSecondary,
    plugins: {
      legend: {
        labels: { color: theme.textSecondary, boxWidth: 14, boxHeight: 2 },
      },
      tooltip: {
        backgroundColor: theme.dark ? "#2c2c2a" : "#ffffff",
        titleColor: theme.text,
        bodyColor: theme.textSecondary,
        borderColor: theme.axis,
        borderWidth: 1,
      },
    },
  };
}
