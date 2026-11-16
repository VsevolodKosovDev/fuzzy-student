import { useEffect, useRef } from "react";

interface Props {
  lines: string[];
  file: string | null;
  onSave: () => void;
  onLoad: () => void;
}

/** Журнал действий (fuzzy_log.txt) и работа с файлом множества. */
export function LogPanel({ lines, file, onSave, onLoad }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines]);

  return (
    <section className="panel log-panel">
      <div className="panel-head">
        <h2>Журнал</h2>
        <span className="hint" title={file ?? undefined}>
          {file ?? "fuzzy_log.txt"}
        </span>
        <div className="row push-right">
          <button onClick={onSave}>Сохранить в файл</button>
          <button onClick={onLoad}>Загрузить из файла</button>
        </div>
      </div>
      <div className="log" ref={ref}>
        {lines.length === 0 ? (
          <div className="muted">Записей пока нет</div>
        ) : (
          lines.map((l, i) => <div key={i}>{l}</div>)
        )}
      </div>
    </section>
  );
}
