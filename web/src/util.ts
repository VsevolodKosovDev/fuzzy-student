/** Разбор числа из поля ввода: допускается запятая как десятичный разделитель. */
export function parseNum(text: string): number {
  const t = text.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}

/** Склонение по числу: plural(2, "кластер", "кластера", "кластеров") → "кластера". */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «7 кластеров», «2 кластера», «1 кластер». */
export function clustersText(k: number): string {
  return `${k} ${plural(k, "кластер", "кластера", "кластеров")}`;
}

/** Сообщение об ошибке из исключения. */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
