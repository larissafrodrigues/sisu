/** Avalia cada oferta para um perfil: nota, modalidades possíveis, probabilidade e afinidade. */
import { notaNaOferta, type NotaNaOferta } from "./notas";
import { CENARIO_PADRAO, media, type Cenario, type Motor } from "./probabilidade";
import type { Base, Oferta, Perfil, Serie } from "./tipos";

/** Códigos da Lei de Cotas a que o perfil declarado dá direito (a ampla concorrência vale sempre). */
export function modalidadesElegiveis(p: Perfil): Set<string> {
  const s = new Set<string>(["AC"]);
  if (!p.escolaPublica) return s;
  const rendas = p.rendaBaixa ? ["LI", "LB"] : ["LI"];
  for (const r of rendas) {
    s.add(`${r}_EP`);
    if (p.raca === "pp") [`${r}_PPI`, `${r}_PP`].forEach((c) => s.add(c));
    if (p.raca === "indigena") [`${r}_PPI`, `${r}_I`].forEach((c) => s.add(c));
    if (p.quilombola) s.add(`${r}_Q`);
    if (p.pcd) s.add(`${r}_PCD`);
  }
  return s;
}

export function serieAC(oferta: Oferta): Serie | undefined {
  return oferta.series.find((s) => s.mod.codigo === "AC");
}

/** Nota efetiva na série: modalidades de bônus multiplicam a nota do candidato. */
export function notaEfetiva(nota: number, serie: Serie): number {
  return serie.bonus > 0 ? nota * (1 + serie.bonus / 100) : nota;
}

/**
 * P(ser selecionado na chamada regular) por cenário.
 *
 * Desde a Lei nº 14.723/2023, quem se inscreve em cota disputa primeiro a ampla concorrência
 * e só depois a vaga reservada. Então basta alcançar o MENOR dos dois cortes. Como os erros
 * das duas séries de um mesmo curso andam juntos, usamos o máximo das duas probabilidades em
 * cada cenário (hipótese conservadora de dependência total) em vez de somá-las.
 */
export function aprovacaoPorCenario(motor: Motor, oferta: Oferta, serie: Serie, nota: number, cen: Cenario = CENARIO_PADRAO, extra = 0): number[] {
  const x = notaEfetiva(nota, serie) + extra;
  const propria = motor.cdfPorCenario(serie, x, cen);
  if (serie.mod.tipo !== "L") return propria;
  const ac = serieAC(oferta);
  const viaAC = ac ? motor.cdfPorCenario(ac, nota + extra, cen) : [];
  if (!propria.length) return viaAC;
  if (!viaAC.length) return propria;
  return propria.map((v, k) => Math.max(v, viaAC[k]));
}

export function probAprovacao(motor: Motor, oferta: Oferta, serie: Serie, nota: number, cen: Cenario = CENARIO_PADRAO): number | null {
  const v = aprovacaoPorCenario(motor, oferta, serie, nota, cen);
  return v.length ? media(v) : null;
}

export interface Avaliacao {
  oferta: Oferta;
  nota: NotaNaOferta;
  /** Melhor modalidade entre as que o perfil pode usar (maior probabilidade). */
  serie: Serie | null;
  prob: number | null;
  /** Nota do candidato menos a previsão central do corte da modalidade escolhida. */
  margem: number | null;
  afinidade: number; // 0..1, quanto a oferta combina com as preferências declaradas
  cursoPreferido: boolean;
}

export function afinidade(p: Perfil, o: Oferta): { valor: number; cursoPreferido: boolean } {
  const cursoPreferido = p.cursos.includes(o.curso);
  let v = 1;
  if (p.cursos.length || p.areas.length) v *= cursoPreferido ? 1 : p.areas.includes(o.area) ? 0.6 : 0.15;
  if (p.ufs.length) v *= p.ufs.includes(o.uf) ? 1 : 0.4;
  if (p.turnos.length) v *= p.turnos.includes(o.turno) ? 1 : 0.5;
  if (p.graus.length) v *= p.graus.includes(o.grau) ? 1 : 0.5;
  return { valor: v, cursoPreferido };
}

export function avaliarOferta(motor: Motor, perfil: Perfil, elegiveis: Set<string>, oferta: Oferta, cen: Cenario = CENARIO_PADRAO, deltaNota = 0): Avaliacao {
  const nota = notaNaOferta(perfil, oferta);
  const af = afinidade(perfil, oferta);
  let serie: Serie | null = null;
  let prob: number | null = null;
  if (nota.elegivel) {
    for (const s of oferta.series) {
      if (!elegiveis.has(s.mod.codigo) || !(s.vagas && s.vagas > 0)) continue;
      const p = probAprovacao(motor, oferta, s, nota.nota + deltaNota, cen);
      // em empate fica a primeira (a lista começa pela ampla concorrência)
      if (p != null && (prob == null || p > prob + 1e-9)) {
        prob = p;
        serie = s;
      } else if (serie == null) serie = s;
    }
  } else {
    serie = serieAC(oferta) ?? oferta.series[0] ?? null;
  }
  const ref = serie?.q50 ?? null;
  return {
    oferta,
    nota,
    serie,
    prob,
    margem: nota.elegivel && ref != null && serie ? notaEfetiva(nota.nota + deltaNota, serie) - ref : null,
    afinidade: af.valor,
    cursoPreferido: af.cursoPreferido,
  };
}

export function avaliarTudo(base: Base, motor: Motor, perfil: Perfil, cen: Cenario = CENARIO_PADRAO, deltaNota = 0): Avaliacao[] {
  const el = modalidadesElegiveis(perfil);
  return base.ofertas.map((o) => avaliarOferta(motor, perfil, el, o, cen, deltaNota));
}

export function perfilTemNotas(p: Perfil): boolean {
  return p.edicoes.some((e) => e.notas.red > 0 && e.notas.lc > 0 && e.notas.mt > 0 && e.notas.ch > 0 && e.notas.cn > 0);
}
