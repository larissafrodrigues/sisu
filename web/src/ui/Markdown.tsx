/** Renderizador mínimo de Markdown (parágrafos, listas, **negrito**, _itálico_) sem HTML cru. */
import type { ReactNode } from "react";

function inline(txt: string, k: string): ReactNode[] {
  const partes = txt.split(/(\*\*[^*]+\*\*|_\[[^\]]+\]_|_[^_]+_)/g);
  return partes.filter(Boolean).map((p, i) => {
    if (p.startsWith("**")) return <strong key={k + i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={k + i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

export function Markdown({ texto }: { texto: string }) {
  const blocos: ReactNode[] = [];
  let lista: string[] = [];
  const fecha = () => {
    if (lista.length) {
      const itens = lista;
      blocos.push(<ul key={"u" + blocos.length}>{itens.map((t, i) => <li key={i}>{inline(t, `l${blocos.length}-${i}-`)}</li>)}</ul>);
      lista = [];
    }
  };
  for (const linha of texto.split("\n")) {
    const l = linha.trim();
    if (!l) { fecha(); continue; }
    const m = l.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) { lista.push(m[1]); continue; }
    fecha();
    blocos.push(<p key={"p" + blocos.length}>{inline(l.replace(/^#+\s*/, ""), `p${blocos.length}-`)}</p>);
  }
  fecha();
  return <>{blocos}</>;
}
