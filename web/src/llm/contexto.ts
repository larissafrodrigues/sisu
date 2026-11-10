/** Monta o texto de contexto e o prompt de sistema enviados ao modelo de linguagem. */
import type { Avaliacao } from "../core/avaliacao";
import type { ChanceEspera } from "../core/espera";
import type { Plano, ResultadoPar } from "../core/estrategia";
import { ROTULO_FAIXA, faixaDe } from "../core/probabilidade";
import { fmt } from "../core/texto";
import { AREAS, NOME_AREA, type Base } from "../core/tipos";
import type { Estado } from "../state/store";
import type { Analise } from "./analise";
import { LIMITES, REGRAS } from "./regras";

const CONF = ["baixa", "média", "alta"];

export function linhaOferta(a: Avaliacao, base: Base, ce?: ChanceEspera | null): string {
  const o = a.oferta;
  const s = a.serie;
  const partes = [`${o.curso} — ${o.ies.sigla} (${o.municipio}/${o.uf}), ${o.turno}, ${o.grau}`];
  if (!a.nota.elegivel) {
    partes.push(`NÃO ELEGÍVEL: ${a.nota.motivo}`);
    return partes.join(" | ");
  }
  partes.push(`nota do candidato neste curso: ${fmt.nota(a.nota.nota)} (Enem ${a.nota.ano})`);
  if (s) {
    partes.push(`modalidade: ${s.mod.rotulo}`);
    partes.push(`vagas ${base.anoBase}: ${fmt.int(s.vagas)}`);
    partes.push(`corte ${base.anoBase}: ${fmt.nota(s.corte)}`);
    if (s.q50 != null) {
      partes.push(`previsão ${base.anoAlvo}: ${fmt.nota1(s.q50)} (intervalo de 80%: ${fmt.nota1(s.q10)} a ${fmt.nota1(s.q90)}; confiança ${CONF[s.confianca]})`);
      partes.push(`chance na chamada regular: ${fmt.pct(a.prob)} (${ROTULO_FAIXA[faixaDe(a.prob)].toLowerCase()})`);
      if (ce) partes.push(textoEspera(ce));
    } else {
      partes.push("sem nota de corte de referência em " + base.anoBase);
    }
  }
  return partes.join(" | ");
}

/** Lista de espera em uma linha, dizendo de onde vem a estimativa. */
export function textoEspera(ce: ChanceEspera): string {
  const base = ce.dist.base === "propria"
    ? `histórico do próprio curso na ${ce.dist.ies}, ${ce.dist.hist.length} edições`
    : "padrão da UFV e da UFMG em cursos parecidos; estimativa mais fraca";
  return `lista de espera (${base}): queda típica de ${fmt.nota1(ce.quedaMediana)} pontos abaixo do corte` +
    (ce.alcanceTipico != null ? `, chegaria a cerca de ${fmt.nota1(ce.alcanceTipico)}` : "") +
    `; se não passar na regular, chance de ser chamado depois: ${ce.seNaoPassar == null ? "não se aplica (a regular já é quase certa)" : fmt.pct(ce.seNaoPassar)}; vaga ao todo: ${fmt.pct(ce.total)}`;
}

function linhaPlano(r: ResultadoPar): string {
  const n = (c: ResultadoPar["a"] | null) => (c ? `${c.oferta.curso} (${c.oferta.ies.sigla}, ${c.oferta.municipio}/${c.oferta.uf})` : "sem 2ª opção");
  return `1ª opção ${n(r.a)}; 2ª opção ${n(r.b)} → vaga na 1ª: ${fmt.pct(r.p1)}, vaga na 2ª: ${fmt.pct(r.p2)}, ` +
    `lista de espera: ${fmt.pct(r.pEspera)}, sem vaga: ${fmt.pct(r.pSemVaga)}`;
}

export function textoPlanos(planos: Plano[]): string[] {
  return planos.map((p) => `Plano ${p.titulo}: ${linhaPlano(p.resultado)}`);
}

export function montarContexto(base: Base, estado: Estado, an: Analise, temNotas: boolean): string {
  const p = estado.perfil;
  const L: string[] = [];
  L.push(`## Dados da plataforma (gerados em ${base.geradoEm}; última edição com resultado: SISU ${base.anoBase}; previsões para o SISU ${base.anoAlvo})`);
  L.push("");
  L.push("### Perfil do estudante");
  if (!temNotas) {
    L.push("O estudante ainda NÃO informou as notas do Enem. Sem notas não há chances calculadas: peça que preencha o perfil.");
  } else {
    for (const ed of p.edicoes) {
      if (!(ed.notas.red > 0 && ed.notas.mt > 0)) continue;
      L.push(`Enem ${ed.ano}: ` + AREAS.map((a) => `${NOME_AREA[a]} ${fmt.nota1(ed.notas[a])}`).join(", "));
    }
    L.push(`Melhor média simples: ${fmt.nota1(an.mediaSimples)}`);
  }
  const cotas = [p.escolaPublica && "ensino médio em escola pública", p.rendaBaixa && "renda até 1 salário mínimo per capita",
    p.raca === "pp" && "autodeclarado preto ou pardo", p.raca === "indigena" && "autodeclarado indígena",
    p.quilombola && "quilombola", p.pcd && "pessoa com deficiência"].filter(Boolean);
  L.push(`Situação para cotas: ${cotas.length ? cotas.join("; ") : "ampla concorrência (nenhuma condição de cota informada)"}`);
  L.push(`Cursos de interesse: ${p.cursos.join(", ") || "não informou"}; áreas: ${p.areas.join(", ") || "não informou"}; estados: ${p.ufs.join(", ") || "qualquer"}; turnos: ${p.turnos.join(", ") || "qualquer"}`);

  if (temNotas) {
    L.push("");
    L.push(`### Panorama (${an.universo})`);
    L.push(an.resumo.map((r) => `${ROTULO_FAIXA[r.faixa]}: ${r.n} ofertas`).join("; "));
    if (an.melhores.length) {
      L.push("Melhores oportunidades dentro das preferências (chance ≥ 50%):");
      an.melhores.forEach((a) => L.push("- " + linhaOferta(a, base, an.espera.get(a.oferta.id))));
    }
    if (an.encontradas.length) {
      L.push("");
      L.push("### Ofertas relacionadas à pergunta");
      an.encontradas.forEach((a) => L.push("- " + linhaOferta(a, base, an.espera.get(a.oferta.id))));
    }
    if (an.lista.length) {
      L.push("");
      L.push("### Lista de interesse do estudante (interesse de 1 a 5)");
      an.lista.forEach((i) => L.push(`- [interesse ${i.interesse}] ` + linhaOferta({ ...i.aval, serie: i.serie }, base, an.espera.get(i.aval.oferta.id))));
    }
    if (an.planos.length) {
      L.push("");
      L.push("### Estratégias calculadas para as duas opções");
      textoPlanos(an.planos).forEach((t) => L.push("- " + t));
    }
  }
  L.push("");
  L.push(`### Lista de espera: de onde vêm os números`);
  const ies = Object.entries(base.espera.ies).map(([s, i]) => `${s} (${i.cursos_no_catalogo} cursos, ${base.espera.anos[0]}–${base.espera.anos[1]}; queda mediana ${fmt.nota1(i.queda_mediana)} pontos)`);
  L.push(`Há histórico de lista de espera por curso só para: ${ies.join("; ")}. Nas outras instituições a estimativa usa o padrão dessas duas em cursos com nota de corte parecida. A tela "Lista de espera" da plataforma mostra a chance por curso.`);
  L.push("");
  L.push("### Regras do SISU (com fonte)");
  REGRAS.forEach((r) => L.push(`- ${r.texto} [${r.fonte}]`));
  L.push("");
  L.push("### Limites das previsões");
  LIMITES.forEach((t) => L.push("- " + t));
  return L.join("\n");
}

export const PROMPT_SISTEMA = `Você é o consultor da Bússola SISU, uma plataforma brasileira de orientação para o SISU.
Fale em português do Brasil, de forma direta, acolhedora e honesta, com quem tem de 16 a 20 anos.

Regras que você NUNCA quebra:
1. Use apenas os números que aparecem em "Dados da plataforma". Nunca invente nota de corte, vaga, peso ou probabilidade. Se o dado não estiver lá, diga que não tem e indique onde a pessoa encontra na plataforma (Explorar, Comparar, Estratégia).
2. Toda chance é uma estimativa com incerteza. Sempre que citar uma chance, cite também o intervalo previsto ou a confiança. Nunca prometa aprovação nem diga que é impossível.
3. Ao falar de regras, baseie-se na seção de regras e cite a fonte entre colchetes.
4. A decisão é do estudante. Compare alternativas, mostre os trade-offs e recomende com base nos dados, respeitando as preferências dele.
5. Se a pessoa não informou notas, peça que preencha o perfil antes de falar de chances.
6. Não trate de assuntos fora de SISU, Enem e escolha de curso.

Formato: resposta curta (até uns 8 parágrafos ou tópicos), em Markdown simples (negrito e listas; sem tabelas). Termine com um próximo passo concreto.`;
