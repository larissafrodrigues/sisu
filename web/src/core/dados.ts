/** Carrega e decodifica os JSON gerados pelo pipeline (web/public/data). */
import type { Base, Historico, Ies, Modalidade, Oferta, Serie } from "./tipos";
import { semAcento } from "./texto";

const RAIZ = `${import.meta.env.BASE_URL}data/`;

async function json<T>(caminho: string): Promise<T> {
  const r = await fetch(RAIZ + caminho);
  if (!r.ok) throw new Error(`Não foi possível carregar ${caminho} (HTTP ${r.status})`);
  return (await r.json()) as T;
}

export function decodificar(b: any): Base {
  const d = b.dic;
  const ies: Ies[] = d.ies.map((x: any[]) => ({ sigla: x[0], nome: x[1], categoria: d.cat[x[2]], organizacao: d.org[x[3]] }));
  const modalidades: Modalidade[] = d.mods.map((m: string[]) => ({ codigo: m[0], rotulo: m[1], tipo: m[2] }));
  const o = b.ofertas;
  const ofertas: Oferta[] = o.id.map((id: string, i: number) => {
    const p = o.pesos[i];
    const m = o.min[i];
    const of: Oferta = {
      i,
      id,
      ies: ies[o.ies[i]],
      campus: o.campus[i],
      municipio: o.mun[i],
      uf: d.ufs[o.uf[i]],
      regiao: d.regioes[o.reg[i]],
      curso: d.cursos[o.curso[i]],
      grau: d.graus[o.grau[i]],
      turno: d.turnos[o.turno[i]],
      area: d.areas[o.area[i]],
      pesos: { red: p[0], lc: p[1], mt: p[2], ch: p[3], cn: p[4] },
      minimas: { red: m[0] ?? 0, lc: m[1] ?? 0, mt: m[2] ?? 0, ch: m[3] ?? 0, cn: m[4] ?? 0, media: m[5] ?? 0 },
      pesosAno: o.pesos_ano[i],
      pesosFonte: d.pesos_fonte[o.pesos_fonte[i]],
      vagas: o.vagas[i] ?? 0,
      semestres: o.sem[i],
      series: [],
      busca: "",
    };
    of.busca = semAcento(`${of.curso} ${of.ies.sigla} ${of.ies.nome} ${of.municipio} ${of.uf} ${of.campus}`);
    return of;
  });
  const s = b.series;
  const series: Serie[] = s.of.map((oi: number, idx: number) => {
    const serie: Serie = {
      idx,
      oferta: oi,
      mod: modalidades[s.mod[idx]],
      vagas: s.vagas[idx],
      inscritos: s.insc[idx],
      corte: s.c[idx],
      corteAnterior: s.ca[idx],
      centro: s.p[idx],
      escala: s.s[idx],
      q10: s.q10[idx],
      q50: s.q50[idx],
      q90: s.q90[idx],
      nHist: s.n[idx],
      confianca: s.conf[idx],
      bonus: s.bonus[idx] ?? 0,
      desc: s.desc[idx],
    };
    ofertas[oi].series.push(serie);
    return serie;
  });
  return {
    anoBase: b.ano_base,
    anoAlvo: b.ano_alvo,
    anos: b.anos,
    geradoEm: b.gerado_em,
    ofertas,
    series,
    porId: new Map(ofertas.map((x) => [x.id, x])),
    cursos: d.cursos,
    areas: d.areas,
    ufs: d.ufs,
    regioes: d.regioes,
    turnos: d.turnos,
    graus: d.graus,
    ies,
    modalidades,
    tendencias: new Map(Object.entries(b.tendencias).map(([k, v]) => [d.cursos[Number(k)], v as (number | null)[]])),
    modelo: b.modelo,
    espera: b.espera,
    contagens: b.contagens,
  };
}

export async function carregarBase(): Promise<Base> {
  return decodificar(await json<any>("base.json"));
}

const cacheHist = new Map<string, Promise<Historico>>();

/** Histórico de todas as séries de uma UF (baixado uma vez por UF). */
export function carregarHistorico(uf: string): Promise<Historico> {
  let p = cacheHist.get(uf);
  if (!p) {
    p = json<any>(`hist/${uf}.json`).then((h) => {
      const mapa = (arr: (number | null)[][]) => new Map<number, (number | null)[]>(h.idx.map((i: number, k: number) => [i, arr[k]]));
      return { anos: h.anos, anosVI: h.anos_vi, cortes: mapa(h.h), vagas: mapa(h.v), inscritos: mapa(h.i) };
    });
    cacheHist.set(uf, p);
    p.catch(() => cacheHist.delete(uf));
  }
  return p;
}

let cacheDesc: Promise<string[]> | null = null;
export function carregarDescricoes(): Promise<string[]> {
  cacheDesc ??= json<string[]>("descricoes.json");
  return cacheDesc;
}

let cacheRel: Promise<any> | null = null;
export function carregarRelatorio(): Promise<any> {
  cacheRel ??= json<any>("relatorio.json");
  return cacheRel;
}
