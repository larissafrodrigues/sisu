import { describe, expect, it } from "vitest";
import { avaliarOferta, avaliarTudo, modalidadesElegiveis, probAprovacao, serieAC } from "../src/core/avaliacao";
import { avaliarPar, recomendar, vetores, type Candidato } from "../src/core/estrategia";
import { mediaPonderada, notaNaOferta } from "../src/core/notas";
import { Motor, faixaDe, interp } from "../src/core/probabilidade";
import { base, perfil } from "./apoio";

const b = base();
const motor = new Motor(b.modelo);
const comPrevisao = b.series.filter((s) => s.centro != null);

describe("dados", () => {
  it("catálogo bate com os totais oficiais do SISU 2026", () => {
    expect(b.anoBase).toBe(2026);
    expect(b.contagens.vagas).toBe(274133); // 274,1 mil vagas divulgadas pelo MEC
    expect(b.ies.length).toBe(136);
    expect(b.contagens.municipios).toBe(587);
  });
  it("valores conferidos contra o relatório do MEC noticiado pela imprensa", () => {
    const psi = b.ofertas.filter((o) => o.curso === "Psicologia" && o.ies.sigla === "UFRGS");
    const cortes = psi.map((o) => serieAC(o)?.corte).sort();
    expect(cortes).toEqual([779.94, 790.62]);
  });
});

describe("notas", () => {
  it("média ponderada segue os pesos do termo de adesão", () => {
    const n = { red: 900, lc: 600, mt: 800, ch: 600, cn: 700 };
    expect(mediaPonderada(n, { red: 1, lc: 1, mt: 1, ch: 1, cn: 1 })).toBeCloseTo(720);
    expect(mediaPonderada(n, { red: 2, lc: 1, mt: 3, ch: 1, cn: 2 })).toBeCloseTo((1800 + 600 + 2400 + 600 + 1400) / 9);
  });
  it("usa a melhor edição do Enem para cada oferta e respeita as mínimas", () => {
    const o = b.ofertas.find((x) => x.minimas.red >= 500 && x.pesos.mt > x.pesos.lc)!;
    const p = perfil({ edicoes: [
      { ano: 2025, notas: { red: 400, lc: 900, mt: 900, ch: 900, cn: 900 } }, // melhor média, mas redação abaixo da mínima
      { ano: 2026, notas: { red: 700, lc: 600, mt: 650, ch: 600, cn: 600 } },
    ] });
    const r = notaNaOferta(p, o);
    expect(r.elegivel).toBe(true);
    expect(r.ano).toBe(2026);
  });
  it("edição com redação zerada não vale", () => {
    const p = perfil({ edicoes: [{ ano: 2026, notas: { red: 0, lc: 700, mt: 700, ch: 700, cn: 700 } }] });
    expect(notaNaOferta(p, b.ofertas[0]).elegivel).toBe(false);
  });
});

describe("motor de probabilidade", () => {
  it("interp satura nas pontas", () => {
    expect(interp(-1, [0, 1], [10, 20])).toBe(10);
    expect(interp(0.5, [0, 1], [10, 20])).toBe(15);
    expect(interp(9, [0, 1], [10, 20])).toBe(20);
  });
  it("reproduz os quantis calculados pelo pipeline em Python", () => {
    const amostra = comPrevisao.filter((_, i) => i % 97 === 0);
    expect(amostra.length).toBeGreaterThan(300);
    for (const s of amostra) {
      expect(Math.abs(motor.quantil(s, 0.1)! - s.q10!)).toBeLessThan(0.6);
      expect(Math.abs(motor.quantil(s, 0.5)! - s.q50!)).toBeLessThan(0.6);
      expect(Math.abs(motor.quantil(s, 0.9)! - s.q90!)).toBeLessThan(0.6);
    }
  });
  it("probabilidade cresce com a nota e fica entre 0 e 1", () => {
    for (const s of comPrevisao.filter((_, i) => i % 503 === 0)) {
      let ant = -1;
      for (let x = s.centro! - 200; x <= s.centro! + 200; x += 10) {
        const p = motor.cdf(s, x)!;
        expect(p).toBeGreaterThanOrEqual(ant - 1e-12);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
        ant = p;
      }
    }
  });
  it("cenário pessimista (cortes sobem) reduz a chance", () => {
    const s = comPrevisao[1000];
    expect(motor.cdf(s, s.centro!, { choque: 20 })!).toBeLessThan(motor.cdf(s, s.centro!, { choque: -20 })!);
  });
  it("faixas de chance", () => {
    expect(faixaDe(0.9)).toBe("alta");
    expect(faixaDe(0.5)).toBe("moderada");
    expect(faixaDe(0.2)).toBe("baixa");
    expect(faixaDe(0.05)).toBe("remota");
    expect(faixaDe(null)).toBe("indefinida");
  });
});

describe("avaliação", () => {
  it("cotas habilitadas pelo perfil", () => {
    expect([...modalidadesElegiveis(perfil())]).toEqual(["AC"]);
    const el = modalidadesElegiveis(perfil({ escolaPublica: true, rendaBaixa: true, raca: "pp" }));
    for (const c of ["AC", "LI_EP", "LB_EP", "LI_PPI", "LB_PPI", "LB_PP"]) expect(el.has(c)).toBe(true);
    expect(el.has("LI_PCD")).toBe(false);
  });
  it("cotista nunca tem chance menor que na ampla concorrência (Lei 14.723/2023)", () => {
    const cot = perfil({ escolaPublica: true, rendaBaixa: true, raca: "pp" });
    const elC = modalidadesElegiveis(cot);
    const elA = modalidadesElegiveis(perfil());
    for (const o of b.ofertas.filter((_, i) => i % 41 === 0)) {
      const a = avaliarOferta(motor, perfil(), elA, o);
      const c = avaliarOferta(motor, cot, elC, o);
      if (a.prob != null && c.prob != null) expect(c.prob).toBeGreaterThanOrEqual(a.prob - 1e-9);
    }
  });
  it("avalia o catálogo inteiro rapidamente", () => {
    const t = performance.now();
    const r = avaliarTudo(b, motor, perfil({ escolaPublica: true, raca: "pp" }));
    expect(r.length).toBe(b.ofertas.length);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});

describe("estratégia", () => {
  const p = perfil();
  const cand = (curso: string, sigla: string, interesse: number): Candidato => {
    const oferta = b.ofertas.find((o) => o.curso === curso && o.ies.sigla === sigla && serieAC(o)?.centro != null)!;
    return { oferta, serie: serieAC(oferta)!, nota: notaNaOferta(p, oferta).nota, interesse };
  };
  const sonho = cand("Medicina", "UFMG", 5);
  const meio = cand("Engenharia Civil", "UFMG", 4);
  const seguro = cand("Matemática", "UFMT", 2);

  it("os desfechos somam 100%", () => {
    for (const [x, y] of [[sonho, meio], [meio, seguro], [seguro, sonho]] as const) {
      const r = avaliarPar(x, vetores(motor, b.espera, x), y, vetores(motor, b.espera, y));
      expect(r.p1 + r.p2 + r.pEspera + r.pSemVaga).toBeCloseTo(1, 6);
      expect(r.p1).toBeCloseTo(probAprovacao(motor, x.oferta, x.serie, x.nota)!, 6);
    }
  });
  it("uma 2ª opção garantida consome a lista de espera da 1ª", () => {
    const va = vetores(motor, b.espera, meio);
    const sozinha = avaliarPar(meio, va, null, null);
    const comSegura = avaliarPar(meio, va, seguro, vetores(motor, b.espera, seguro));
    expect(comSegura.pEsperaA).toBeLessThanOrEqual(sozinha.pEsperaA + 1e-12);
    expect(comSegura.custoDaSegunda).toBeGreaterThanOrEqual(0);
    expect(comSegura.pSemVaga).toBeLessThanOrEqual(sozinha.pSemVaga + 1e-12);
  });
  it("recomenda três planos coerentes", () => {
    const planos = recomendar(motor, b.espera, [sonho, meio, seguro]);
    expect(planos.map((x) => x.perfil)).toEqual(["equilibrada", "segura", "ousada"]);
    const [eq, seg, ous] = planos.map((x) => x.resultado);
    expect(seg.p1 + seg.p2).toBeGreaterThanOrEqual(eq.p1 + eq.p2 - 1e-9);
    expect(eq.utilidade).toBeGreaterThanOrEqual(seg.utilidade - 1e-9);
    expect(ous.a).toBe(sonho);
  });
});
