/**
 * Журнал (лог) действий — аналог Logger из примера.
 * Библиотека не привязана к файловой системе: куда писать строки, решает
 * «приёмник» (sink). Сервер передаёт приёмник, дописывающий строки в
 * fuzzy_log.txt; по умолчанию строки выводятся в консоль.
 */

// Библиотека собирается без типов DOM и Node; console есть в обеих средах.
declare const console: { log(...args: unknown[]): void };

export type LogSink = (line: string) => void;

/** Метка времени вида 2026-11-07 14:03:12. */
export function timestamp(date: Date = new Date()): string {
  const p = (v: number) => String(v).padStart(2, "0");
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}

export class Logger {
  constructor(private readonly sink: LogSink = (line) => console.log(line)) {}

  /** Записать сообщение с меткой времени; возвращает записанную строку. */
  log(message: string): string {
    const line = `[${timestamp()}] ${message}`;
    this.sink(line);
    return line;
  }
}
