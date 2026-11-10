import { useMemo, useState } from "react";
import { semAcento } from "../core/texto";
import { AREAS, NOME_AREA, NOME_CURTO, type EdicaoEnem, type Notas } from "../core/tipos";

export function CamposNotas({ edicao, onChange }: { edicao: EdicaoEnem; onChange: (n: Notas) => void }) {
  return (
    <div className="notas-grade">
      {AREAS.map((a) => (
        <label className="campo" key={a}>
          <span title={NOME_AREA[a]}>{NOME_CURTO[a]}</span>
          <input type="number" inputMode="decimal" min={0} max={1000} step="0.1" placeholder="0" aria-label={NOME_AREA[a]}
            value={edicao.notas[a] || ""}
            onChange={(e) => onChange({ ...edicao.notas, [a]: Math.min(1000, Math.max(0, Number(e.target.value) || 0)) })} />
        </label>
      ))}
    </div>
  );
}

export function Chips({ opcoes, valor, onChange }: { opcoes: string[]; valor: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {opcoes.map((o) => (
        <button type="button" key={o} className="chip" aria-pressed={valor.includes(o)}
          onClick={() => onChange(valor.includes(o) ? valor.filter((x) => x !== o) : [...valor, o])}>{o}</button>
      ))}
    </div>
  );
}

/** Seleção múltipla com busca, para listas longas (os 650+ nomes de curso). */
export function BuscaMulti({ opcoes, valor, onChange, placeholder }: { opcoes: string[]; valor: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const norm = useMemo(() => opcoes.map((o) => [semAcento(o), o] as const), [opcoes]);
  const sugestoes = useMemo(() => {
    const t = semAcento(q.trim());
    if (t.length < 2) return [];
    const ini = norm.filter(([n, o]) => n.startsWith(t) && !valor.includes(o));
    const meio = norm.filter(([n, o]) => !n.startsWith(t) && n.includes(t) && !valor.includes(o));
    return [...ini, ...meio].slice(0, 8).map(([, o]) => o);
  }, [q, norm, valor]);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input className="entrada" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); if (sugestoes[0]) { onChange([...valor, sugestoes[0]]); setQ(""); } }} />
      {sugestoes.length > 0 && (
        <div className="chips">
          {sugestoes.map((s) => <button type="button" key={s} className="chip" onClick={() => { onChange([...valor, s]); setQ(""); }}>+ {s}</button>)}
        </div>
      )}
      {valor.length > 0 && (
        <div className="chips">
          {valor.map((v) => <button type="button" key={v} className="chip" aria-pressed="true" onClick={() => onChange(valor.filter((x) => x !== v))} title="Remover">{v} ×</button>)}
        </div>
      )}
    </div>
  );
}
