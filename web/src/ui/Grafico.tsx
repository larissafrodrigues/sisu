/** Gráfico de linhas para séries anuais de nota de corte, com previsão e incerteza. */
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "../core/texto";

export interface SerieGrafico {
  nome: string;
  cor: string;
  valores: (number | null)[]; // alinhado com `anos`
  previsao?: { q10: number; q50: number; q90: number } | null;
}

function useLargura(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(280, Math.round(e[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function passoBonito(amplitude: number): number {
  for (const p of [10, 20, 25, 50, 100, 200]) if (amplitude / p <= 5) return p;
  return 250;
}

export function GraficoHistorico({ anos, anoAlvo, series, nota, altura = 250, descricao }: {
  anos: number[]; anoAlvo?: number; series: SerieGrafico[]; nota?: number | null; altura?: number; descricao: string;
}) {
  const [ref, W] = useLargura();
  const [foco, setFoco] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);

  const g = useMemo(() => {
    const temPrev = anoAlvo != null && series.some((s) => s.previsao);
    // começa no primeiro ano em que alguma série tem dado
    let ini = anos.findIndex((_, i) => series.some((s) => s.valores[i] != null));
    if (ini < 0) ini = 0;
    const xs = anos.slice(ini);
    if (temPrev) xs.push(anoAlvo!);
    const todos: number[] = [];
    for (const s of series) {
      for (const v of s.valores) if (v != null) todos.push(v);
      if (s.previsao) todos.push(s.previsao.q10, s.previsao.q90);
    }
    if (nota != null && nota > 0) todos.push(nota);
    let lo = Math.min(...todos), hi = Math.max(...todos);
    if (!Number.isFinite(lo)) { lo = 500; hi = 700; }
    const passo = passoBonito(hi - lo || 50);
    lo = Math.floor((lo - passo * 0.15) / passo) * passo;
    hi = Math.ceil((hi + passo * 0.15) / passo) * passo;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + 1e-9; v += passo) ticks.push(v);
    return { ini, xs, lo, hi, ticks, temPrev };
  }, [anos, anoAlvo, series, nota]);

  const rotDireto = series.length <= 3;
  const M = { e: 38, d: rotDireto ? 58 : 16, t: 10, b: 24 };
  const iw = W - M.e - M.d;
  const ih = altura - M.t - M.b;
  const X = (i: number) => M.e + (g.xs.length > 1 ? (i / (g.xs.length - 1)) * iw : iw / 2);
  const Y = (v: number) => M.t + (1 - (v - g.lo) / (g.hi - g.lo)) * ih;
  const nHist = g.xs.length - (g.temPrev ? 1 : 0);
  const pulaRotulo = Math.ceil(g.xs.length / Math.max(2, Math.floor(iw / 44)));

  const mover = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = Math.round(((x - M.e) / iw) * (g.xs.length - 1));
    setFoco(Math.min(g.xs.length - 1, Math.max(0, i)));
  };

  // rótulos diretos no fim de cada linha, afastados quando colidem
  const rotulos = series.map((s, k) => {
    const v = s.previsao && g.temPrev ? s.previsao.q50 : [...s.valores].reverse().find((x) => x != null) ?? null;
    return { k, v, y: v != null ? Y(v) : 0 };
  }).filter((r) => r.v != null).sort((a, b) => a.y - b.y);
  for (let i = 1; i < rotulos.length; i++) if (rotulos[i].y - rotulos[i - 1].y < 13) rotulos[i].y = rotulos[i - 1].y + 13;

  return (
    <div>
      <div className="linha-flex" style={{ marginBottom: 4 }}>
        {series.length > 1 && (
          <div className="graf-leg">
            {series.map((s) => <span key={s.nome}><i style={{ background: s.cor }} />{s.nome}</span>)}
          </div>
        )}
        <button className="bt mini fantasma empurra" onClick={() => setTabela((t) => !t)}>{tabela ? "Ver gráfico" : "Ver tabela"}</button>
      </div>
      {tabela ? (
        <div className="tab-wrap">
          <table>
            <thead><tr><th>Edição</th>{series.map((s) => <th key={s.nome} className="num">{s.nome}</th>)}</tr></thead>
            <tbody>
              {g.xs.slice(0, nHist).map((ano, i) => (
                <tr key={ano}><td>{ano}</td>{series.map((s) => <td key={s.nome} className="num">{fmt.nota(s.valores[g.ini + i])}</td>)}</tr>
              ))}
              {g.temPrev && (
                <tr className="destaque"><td>{anoAlvo} (previsão, 80%)</td>{series.map((s) => (
                  <td key={s.nome} className="num">{s.previsao ? `${fmt.nota1(s.previsao.q50)} (${fmt.nota1(s.previsao.q10)}–${fmt.nota1(s.previsao.q90)})` : "—"}</td>
                ))}</tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="graf" ref={ref}>
          <svg width={W} height={altura} role="img" aria-label={descricao} onMouseMove={mover} onMouseLeave={() => setFoco(null)}>
            {g.ticks.map((t) => (
              <g key={t}>
                <line x1={M.e} x2={W - M.d} y1={Y(t)} y2={Y(t)} stroke="var(--linha)" strokeWidth="1" />
                <text x={M.e - 8} y={Y(t) + 4} textAnchor="end">{t}</text>
              </g>
            ))}
            {g.xs.map((ano, i) => (i % pulaRotulo === 0 || i === g.xs.length - 1) && (
              <text key={ano} x={X(i)} y={altura - 6} textAnchor="middle" className={g.temPrev && i === g.xs.length - 1 ? "dir" : undefined}>{ano}</text>
            ))}
            {g.temPrev && <rect x={X(nHist - 1) + (X(nHist) - X(nHist - 1)) / 2} y={M.t} width={W - M.d - (X(nHist - 1) + (X(nHist) - X(nHist - 1)) / 2) + 8} height={ih} fill="var(--sup2)" opacity="0.6" />}
            {nota != null && nota > 0 && nota >= g.lo && nota <= g.hi && (
              <g>
                <line x1={M.e} x2={W - M.d} y1={Y(nota)} y2={Y(nota)} stroke="var(--tinta)" strokeWidth="1.5" strokeDasharray="2 4" />
                <text x={M.e + 4} y={Y(nota) - 6} className="dir halo">sua nota {fmt.nota1(nota)}</text>
              </g>
            )}
            {foco != null && <line x1={X(foco)} x2={X(foco)} y1={M.t} y2={M.t + ih} stroke="var(--mudo)" strokeWidth="1" />}
            {series.map((s, k) => {
              const dx = g.temPrev ? (k - (series.filter((x) => x.previsao).length - 1) / 2) * 12 : 0;
              const pts = g.xs.slice(0, nHist).map((_, i) => ({ i, v: s.valores[g.ini + i] }));
              const segs: string[] = [];
              let atual: string[] = [];
              for (const p of pts) {
                if (p.v == null) { if (atual.length > 1) segs.push(atual.join(" ")); atual = []; continue; }
                atual.push(`${atual.length ? "L" : "M"}${X(p.i).toFixed(1)} ${Y(p.v).toFixed(1)}`);
              }
              if (atual.length > 1) segs.push(atual.join(" "));
              const ult = [...pts].reverse().find((p) => p.v != null);
              return (
                <g key={s.nome}>
                  {segs.map((d, i) => <path key={i} d={d} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
                  {pts.map((p) => p.v != null && <circle key={p.i} cx={X(p.i)} cy={Y(p.v)} r={foco === p.i ? 5 : 3.5} fill={s.cor} stroke="var(--sup)" strokeWidth="2" />)}
                  {g.temPrev && s.previsao && (
                    <g>
                      {ult && <line x1={X(ult.i)} y1={Y(ult.v!)} x2={X(nHist) + dx} y2={Y(s.previsao.q50)} stroke={s.cor} strokeWidth="2" strokeDasharray="3 4" />}
                      <rect x={X(nHist) + dx - 5} y={Y(s.previsao.q90)} width="10" height={Math.max(2, Y(s.previsao.q10) - Y(s.previsao.q90))} rx="4" fill={s.cor} opacity="0.3" />
                      <circle cx={X(nHist) + dx} cy={Y(s.previsao.q50)} r="4.5" fill="var(--sup)" stroke={s.cor} strokeWidth="2.5" />
                    </g>
                  )}
                </g>
              );
            })}
            {rotDireto && rotulos.map((r) => (
              <text key={r.k} x={W - M.d + 10} y={r.y + 4} className="dir">{fmt.nota1(r.v)}</text>
            ))}
          </svg>
          {foco != null && (
            <div className="dica" style={{ left: Math.min(W - 90, Math.max(90, X(foco))), top: M.t + 8 }}>
              <b>{g.xs[foco]}{g.temPrev && foco === g.xs.length - 1 ? " · previsão" : ""}</b>
              {series.map((s) => {
                const prev = g.temPrev && foco === g.xs.length - 1;
                const txt = prev ? (s.previsao ? `${fmt.nota1(s.previsao.q50)} (${fmt.nota1(s.previsao.q10)}–${fmt.nota1(s.previsao.q90)})` : "—") : fmt.nota(s.valores[g.ini + foco]);
                return <div key={s.nome}><i style={{ background: s.cor }} />{series.length > 1 ? `${s.nome}: ` : ""}{txt}</div>;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
