/**
 * Сервер журнала и файлов.
 *
 * Браузер не может сам писать файлы на диск, поэтому веб-интерфейс отправляет
 * сюда записи журнала и множество величин, а сервер делает то же, что gui.py
 * в примере:
 *   - дописывает строки в fuzzy_log.txt (через Logger из fuzzy-lib);
 *   - сохраняет / загружает множество в fuzzy_set.json.
 * Если собран веб-интерфейс (web/dist), сервер раздаёт и его.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FuzzySet, Logger, type FuzzyStudentDict } from "fuzzy-lib";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..", "..");
const dataDir = resolve(process.env.DATA_DIR ?? join(projectRoot, "data"));
const webDist = join(projectRoot, "web", "dist");
const LOG_FILE = join(dataDir, "fuzzy_log.txt");
const SET_FILE = join(dataDir, "fuzzy_set.json");
const PORT = Number(process.env.PORT ?? 3001);

mkdirSync(dataDir, { recursive: true });

const logger = new Logger((line) => appendFileSync(LOG_FILE, line + "\n", "utf-8"));

const app = express();
app.use(express.json({ limit: "5mb" }));

/** Дописать запись в журнал. Тело: { message: string }. */
app.post("/api/log", (req: Request, res: Response) => {
  const message = req.body?.message;
  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "Нужно поле message (строка)" });
    return;
  }
  const line = logger.log(message.trim().replace(/\r?\n/g, " | "));
  res.json({ line });
});

/** Последние строки журнала. Параметр ?limit=N (по умолчанию 500). */
app.get("/api/log", (req: Request, res: Response) => {
  const limit = Math.max(1, Math.min(5000, Number(req.query.limit) || 500));
  const lines = existsSync(LOG_FILE)
    ? readFileSync(LOG_FILE, "utf-8").split(/\r?\n/).filter(Boolean)
    : [];
  res.json({ lines: lines.slice(-limit), file: LOG_FILE });
});

/** Сохранить множество в fuzzy_set.json. Тело: массив { x0, s, nu, name }. */
app.post("/api/save", (req: Request, res: Response) => {
  let list: FuzzyStudentDict[];
  try {
    // Проверка данных: каждая запись должна создавать корректную величину.
    list = FuzzySet.fromList(req.body as FuzzyStudentDict[]).toList();
  } catch (e) {
    res.status(400).json({ error: `Некорректные данные: ${(e as Error).message}` });
    return;
  }
  writeFileSync(SET_FILE, JSON.stringify(list, null, 2), "utf-8");
  res.json({ count: list.length, file: SET_FILE });
});

/** Загрузить множество из fuzzy_set.json. */
app.get("/api/load", (_req: Request, res: Response) => {
  if (!existsSync(SET_FILE)) {
    res.status(404).json({ error: "Файл fuzzy_set.json ещё не создан — сначала сохраните множество" });
    return;
  }
  try {
    const list = FuzzySet.fromList(JSON.parse(readFileSync(SET_FILE, "utf-8"))).toList();
    res.json({ items: list, file: SET_FILE });
  } catch (e) {
    res.status(500).json({ error: `Файл повреждён: ${(e as Error).message}` });
  }
});

if (existsSync(webDist)) {
  app.use(express.static(webDist));
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Сервер: http://localhost:${PORT}`);
  console.log(`Журнал: ${LOG_FILE}`);
  console.log(`Множество: ${SET_FILE}`);
  if (existsSync(webDist)) console.log(`Интерфейс: http://localhost:${PORT}/`);
});
