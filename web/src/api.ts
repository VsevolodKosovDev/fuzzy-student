import type { FuzzyStudentDict } from "fuzzy-lib";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Ошибка сервера (HTTP ${response.status})`);
  }
  return data as T;
}

/** Обращения к серверу журнала и файлов. */
export const api = {
  log: (message: string) =>
    request<{ line: string }>("/api/log", { method: "POST", body: JSON.stringify({ message }) }),
  getLog: () => request<{ lines: string[]; file: string }>("/api/log?limit=500"),
  save: (items: FuzzyStudentDict[]) =>
    request<{ count: number; file: string }>("/api/save", {
      method: "POST",
      body: JSON.stringify(items),
    }),
  load: () => request<{ items: FuzzyStudentDict[]; file: string }>("/api/load"),
};
