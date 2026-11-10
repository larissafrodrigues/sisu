import { describe, expect, it } from "vitest";
import { avaliarTudo } from "../src/core/avaliacao";
import { Motor } from "../src/core/probabilidade";
import { analisar, extrairEntidades } from "../src/consultoria/analise";
import { montarContexto } from "../src/consultoria/contexto";
import { responderOffline } from "../src/consultoria/offline";
import type { Estado } from "../src/state/store";
import { base, perfil } from "./apoio";

const b = base();
const motor = new Motor(b.modelo);

function cenario(parcial: Partial<Estado["perfil"]> = {}, lista: Estado["lista"] = []) {
  const estado: Estado = { perfil: perfil(parcial), lista, comparar: [] };
  const avals = avaliarTudo(b, motor, estado.perfil);
  const porOferta = new Map(avals.map((a) => [a.oferta.id, a]));
  const perguntar = (q: string) => {
    const an = analisar(b, motor, estado, avals, porOferta, q);
    return { an, ctx: montarContexto(b, estado, an, true), off: responderOffline(b, estado, an, true, q) };
  };
  return { estado, avals, perguntar };
}

describe("recuperação de contexto", () => {
  it("reconhece curso, instituição, estado e cidade na pergunta", () => {
    const e = extrairEntidades(b, "Quais minhas chances em Medicina Veterinária na UFMG ou em Pernambuco?");
    expect(e.cursos).toEqual(["Medicina Veterinária"]); // não confunde com Medicina
    expect(e.siglas).toEqual(["UFMG"]);
    expect(e.ufs).toEqual(["PE"]);
    expect(extrairEntidades(b, "direito em Recife").municipios).toContain("Recife");
    expect(extrairEntidades(b, "quero computação").cursos).toContain("Computação");
    expect(extrairEntidades(b, "algo com geologia?").cursos.length).toBeGreaterThan(0); // palavra solta
  });
  it("traz só ofertas que existem, com os números do motor", () => {
    const { an, ctx } = cenario().perguntar("Compare Direito na UFPE e na UFC");
    expect(an.encontradas.length).toBeGreaterThan(0);
    for (const a of an.encontradas) {
      expect(a.oferta.curso).toBe("Direito");
      expect(["UFPE", "UFC"]).toContain(a.oferta.ies.sigla);
      expect(ctx).toContain(`${a.oferta.curso} — ${a.oferta.ies.sigla}`);
    }
    expect(ctx).toContain("Regras do SISU");
    expect(ctx).toContain("Limites das previsões");
  });
  it("sem lugar na pergunta, prioriza os estados preferidos do perfil", () => {
    const { an } = cenario({ ufs: ["BA"] }).perguntar("minhas chances em enfermagem");
    expect(an.encontradas[0].oferta.uf).toBe("BA");
  });
});

describe("consultor com regras locais", () => {
  it("responde chance com intervalo e sem prometer", () => {
    const { off } = cenario().perguntar("Quais minhas chances em Direito na UFMG?");
    expect(off).toMatch(/Direito — UFMG/);
    expect(off).toMatch(/80% de chance de ficar entre/);
    expect(off).not.toMatch(/garantid|com certeza|impossível/i);
  });
  it("explica a regra da lista de espera citando a fonte", () => {
    const { off } = cenario().perguntar("como funciona a lista de espera?");
    expect(off).toMatch(/Edital nº 29\/2025, itens 6\.2 e 6\.3/);
    expect(off).toMatch(/UFMG/);
  });
  it("monta estratégia a partir da lista", () => {
    const id = (curso: string, sigla: string) => b.ofertas.find((o) => o.curso === curso && o.ies.sigla === sigla)!.id;
    const c = cenario({}, [
      { id: id("Engenharia Civil", "UFMG"), interesse: 5, mod: null },
      { id: id("Matemática", "UFMT"), interesse: 2, mod: null },
    ]);
    const { off, an } = c.perguntar("qual a melhor ordem para as minhas duas opções?");
    expect(an.planos.length).toBe(3);
    expect(off).toMatch(/Equilibrada/);
    expect(off).toMatch(/Engenharia Civil \(UFMG\)/);
  });
  it("pede notas quando não há", () => {
    const estado: Estado = { perfil: perfil({ edicoes: [] }), lista: [], comparar: [] };
    const avals = avaliarTudo(b, motor, estado.perfil);
    const an = analisar(b, motor, estado, avals, new Map(), "onde eu passo?");
    expect(responderOffline(b, estado, an, false, "onde eu passo?")).toMatch(/preciso das suas notas/);
  });
});
