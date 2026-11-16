import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface Props {
  /** Формула в LaTeX. */
  tex: string;
  /** Отдельной строкой по центру (display) или внутри текста. */
  block?: boolean;
}

/** Формула LaTeX, отрисованная KaTeX. */
export function Tex({ tex, block = false }: Props) {
  const html = useMemo(
    () => katex.renderToString(tex, { throwOnError: false, displayMode: block, strict: "ignore" }),
    [tex, block],
  );
  return block ? (
    <div className="tex-block" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="tex" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
