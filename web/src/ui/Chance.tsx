import { ROTULO_FAIXA, faixaDe, type Faixa } from "../core/probabilidade";
import { fmt } from "../core/texto";

export const COR_FAIXA: Record<Faixa, string> = {
  alta: "var(--bom)", moderada: "var(--aviso)", baixa: "var(--serio)", remota: "var(--critico)", indefinida: "var(--mudo)",
};

/** Glifo da faixa: o preenchimento do círculo cresce com a chance (não depende só da cor). */
export function Glifo({ faixa, t = 14 }: { faixa: Faixa; t?: number }) {
  const cor = COR_FAIXA[faixa];
  const fracao = { alta: 1, moderada: 0.5, baixa: 0.25, remota: 0, indefinida: 0 }[faixa];
  const r = 6;
  const ang = fracao * 2 * Math.PI;
  const x = 8 + r * Math.sin(ang);
  const y = 8 - r * Math.cos(ang);
  return (
    <svg width={t} height={t} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke={cor} strokeWidth="2" strokeDasharray={faixa === "indefinida" ? "2 2.5" : undefined} />
      {fracao === 1 && <circle cx="8" cy="8" r="6" fill={cor} />}
      {fracao > 0 && fracao < 1 && <path d={`M8 8 L8 2 A6 6 0 ${fracao > 0.5 ? 1 : 0} 1 ${x} ${y} Z`} fill={cor} />}
    </svg>
  );
}

export function Chance({ p, grande = false, rotulo = false }: { p: number | null; grande?: boolean; rotulo?: boolean }) {
  const f = faixaDe(p);
  return (
    <span className={`chance${grande ? " grande" : ""}`} title={ROTULO_FAIXA[f]}>
      <Glifo faixa={f} t={grande ? 22 : 14} />
      <span className="pc">{fmt.pct(p)}</span>
      {rotulo && <span className="rt">{ROTULO_FAIXA[f]}</span>}
      {!rotulo && <span className="sr">{ROTULO_FAIXA[f]}</span>}
    </span>
  );
}
