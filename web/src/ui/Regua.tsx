/**
 * Régua de chance: a nota do estudante contra o que se espera da nota de corte.
 *   faixa  = intervalo em que a nota de corte deve cair em 80% dos cenários (P10–P90)
 *   traço  = previsão central
 *   círculo = nota de corte da última edição
 *   losango = nota do estudante neste curso
 */
import { fmt } from "../core/texto";
import type { Serie } from "../core/tipos";

export type Dominio = [number, number];

export function dominioDe(itens: { serie: Serie | null; nota: number | null }[]): Dominio {
  let lo = Infinity;
  let hi = -Infinity;
  for (const { serie, nota } of itens) {
    for (const v of [serie?.q10, serie?.q90, serie?.corte, nota]) {
      if (v == null || !Number.isFinite(v) || v <= 0) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  if (!Number.isFinite(lo)) return [450, 850];
  const folga = Math.max(12, (hi - lo) * 0.06);
  lo -= folga; hi += folga;
  if (hi - lo < 120) { const m = (hi + lo) / 2; lo = m - 60; hi = m + 60; }
  return [Math.floor(lo / 10) * 10, Math.ceil(hi / 10) * 10];
}

const pos = (v: number, [a, b]: Dominio) => `${Math.min(100, Math.max(0, ((v - a) / (b - a)) * 100))}%`;

export function Regua({ serie, nota, dominio, anoBase }: { serie: Serie | null; nota: number | null; dominio: Dominio; anoBase: number }) {
  const partes: string[] = [];
  if (nota != null) partes.push(`sua nota ${fmt.nota(nota)}`);
  if (serie?.q50 != null) partes.push(`previsão ${fmt.nota1(serie.q50)} (80%: ${fmt.nota1(serie.q10)} a ${fmt.nota1(serie.q90)})`);
  if (serie?.corte != null) partes.push(`corte ${anoBase} ${fmt.nota(serie.corte)}`);
  const titulo = partes.join(" · ");
  return (
    <div className="regua" role="img" aria-label={titulo || "sem dados"} title={titulo}>
      <div className="trilha" />
      {serie?.q10 != null && serie.q90 != null && (
        <div className="banda" style={{ left: pos(serie.q10, dominio), width: `calc(${pos(serie.q90, dominio)} - ${pos(serie.q10, dominio)})` }} />
      )}
      {serie?.corte != null && <div className="ult" style={{ left: pos(serie.corte, dominio) }} />}
      {serie?.q50 != null && <div className="prev" style={{ left: pos(serie.q50, dominio) }} />}
      {nota != null && nota > 0 && <div className="eu" style={{ left: pos(nota, dominio) }} />}
    </div>
  );
}

export function EixoRegua({ dominio }: { dominio: Dominio }) {
  const [a, b] = dominio;
  const passo = b - a > 320 ? 100 : b - a > 160 ? 50 : 25;
  const marcas: number[] = [];
  for (let v = Math.ceil(a / passo) * passo; v <= b; v += passo) marcas.push(v);
  return (
    <div className="regua-eixo" aria-hidden="true">
      {marcas.map((v) => <span key={v} style={{ left: pos(v, dominio) }}>{v}</span>)}
    </div>
  );
}

export function LegendaRegua({ anoBase, anoAlvo }: { anoBase: number; anoAlvo: number }) {
  return (
    <div className="legenda">
      <span><i className="lg-eu" />sua nota no curso</span>
      <span><i className="lg-banda" />onde o corte de {anoAlvo} deve cair (80% dos cenários)</span>
      <span><i className="lg-prev" />previsão central</span>
      <span><i className="lg-ult" />corte de {anoBase}</span>
    </div>
  );
}
