import { describe, expect, it } from "vitest";
import { avaliarTudo } from "../src/core/avaliacao";
import { chanceEspera, distribuicaoQueda, faixaEspera, quantilQueda, vetoresEspera } from "../src/core/espera";
import { Motor } from "../src/core/probabilidade";
import { analisar } from "../src/llm/analise";
import { montarContexto } from "../src/llm/contexto";
import { responderOffline } from "../src/llm/offline";
import type { Estado } from "../src/state/store";
import { base, perfil } from "./apoio";

const b = base();
const motor = new Motor(b.modelo);
const oferta = (sigla: string, curso: string, municipio?: string) => {
  const o = b.ofertas.find((x) => x.ies.sigla === sigla && x.curso === curso && (!municipio || x.municipio === municipio));
  if (!o) throw new Error(`${curso} ${sigla} não encontrado`);
  return o;
};
const serie = (o: ReturnType<typeof oferta>, cod: string) => o.series.find((s) => s.mod.codigo === cod)!;

describe("dados de lista de espera", () => {
  it("traz UFV e UFMG com histórico ligado ao catálogo", () => {
    expect(Object.keys(b.espera.ies).sort()).toEqual(["UFMG", "UFV"]);
    expect(b.espera.ies.UFV.cursos_no_catalogo).toBe(69);
    expect(b.espera.series.size).toBeGreaterThan(1000);
    expect(b.espera.peso_perfil).toBe(4);
  });

  it("guarda o histórico conferido nas páginas da UFV (Medicina, ampla concorrência)", () => {
    const med = oferta("UFV", "Medicina");
    const h = b.espera.series.get(`${med.id}#AC`)!;
    expect(h.ies).toBe("UFV");
    expect(h.hist.map((x) => [x.ano, x.regular, x.final, x.convocados, x.lista])).toEqual([
      [2022, 801.8, 800.6, 3, 856], [2023, 796.6, 795.9, 2, 953], [2024, 801.1, 793, 8, 994],
      [2025, 797.6, 796.4, 8, 1034], [2026, 805, 796.5, 12, 1179],
    ]);
  });
});

describe("distribuição da queda", () => {
  it("mistura o histórico do curso (peso 1 por ano) com o perfil (peso 4)", () => {
    const med = oferta("UFV", "Medicina");
    const d = distribuicaoQueda(b.espera, med, serie(med, "AC"));
    expect(d.base).toBe("propria");
    expect(d.valores.slice(0, 5).map((v) => +v.toFixed(1))).toEqual([1.2, 0.7, 8.1, 1.2, 8.5]);
    expect(d.pesos[0]).toBeCloseTo(1 / 9);
    expect(d.pesos.reduce((s, w) => s + w, 0)).toBeCloseTo(1);
    // a Medicina da UFV quase não abre vaga na lista: a queda típica é pequena
    expect(quantilQueda(d, 0.5)).toBeLessThan(20);
  });

  it("sem histórico próprio, usa o perfil do grupo e da faixa de nota de corte", () => {
    const o = oferta("UFJF", "Direito");
    const s = serie(o, "AC");
    const d = distribuicaoQueda(b.espera, o, s);
    expect(d.base).toBe("perfil");
    expect(d.faixa).toBe(faixaEspera(b.espera, s.q50!));
    expect(d.valores).toEqual(b.espera.perfis.AC[d.faixa].quantis);
  });

  it("a faixa segue a mesma regra do Python (o limite pertence à faixa de cima)", () => {
    expect(faixaEspera(b.espera, 549.9)).toBe(0);
    expect(faixaEspera(b.espera, 550)).toBe(1);
    expect(faixaEspera(b.espera, 800)).toBe(5);
  });
});

describe("chance de ser chamado depois", () => {
  const agro = oferta("UFV", "Agronomia", "Viçosa");
  const ac = serie(agro, "AC");

  it("é zero de lista quando a regular é certa, e cresce perto do corte", () => {
    const longe = chanceEspera(motor, b.espera, agro, ac, ac.q50! + 120)!;
    expect(longe.regular).toBeGreaterThan(0.99);
    expect(longe.seNaoPassar).toBeNull();
    const perto = chanceEspera(motor, b.espera, agro, ac, ac.q50! - 25)!;
    expect(perto.regular).toBeLessThan(0.5);
    expect(perto.espera).toBeGreaterThan(0.1);
    expect(perto.total).toBeCloseTo(perto.regular + perto.espera);
    expect(perto.seNaoPassar!).toBeGreaterThan(0);
    expect(perto.seNaoPassar!).toBeLessThanOrEqual(1);
  });

  it("é monotônica na nota", () => {
    let ant = -1;
    for (let d = -150; d <= 60; d += 15) {
      const c = chanceEspera(motor, b.espera, agro, ac, ac.q50! + d)!;
      expect(c.total).toBeGreaterThanOrEqual(ant - 1e-9);
      ant = c.total;
    }
  });

  it("para cotista, considera também a lista da ampla concorrência", () => {
    const cota = serie(agro, "LI_PPI");
    const nota = cota.q50! - 10;
    const v = vetoresEspera(motor, b.espera, agro, cota, nota);
    v.regular.forEach((r, k) => {
      expect(v.espera[k]).toBeGreaterThanOrEqual(0);
      expect(r + v.espera[k]).toBeLessThanOrEqual(1 + 1e-9);
    });
  });
});

describe("consultor", () => {
  it("responde sobre lista de espera com os números do curso e a fonte", () => {
    const estado: Estado = {
      perfil: perfil({ edicoes: [{ ano: 2026, notas: { red: 760, lc: 640, mt: 660, ch: 650, cn: 640 } }] }),
      lista: [], comparar: [], llm: { provedor: "vllm", url: "", chave: "", modelo: "", ativo: false },
    };
    const avals = avaliarTudo(b, motor, estado.perfil);
    const por = new Map(avals.map((a) => [a.oferta.id, a]));
    const q = "Tenho chance de ser chamado na lista de espera de Agronomia na UFV?";
    const an = analisar(b, motor, estado, avals, por, q);
    expect(an.sobreEspera).toBe(true);
    const off = responderOffline(b, estado, an, true, q);
    expect(off).toContain("Agronomia — UFV");
    expect(off).toContain("histórico do curso na UFV");
    expect(montarContexto(b, estado, an, true)).toContain("lista de espera (histórico do próprio curso na UFV");
  });
});
