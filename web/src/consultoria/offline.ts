/**
 * Respostas automáticas baseadas em regras e nos resultados calculados no navegador.
 * Não usa serviços externos nem gera respostas livres por modelo de linguagem.
 */
import type { Avaliacao } from "../core/avaliacao";
import { ROTULO_FAIXA, faixaDe } from "../core/probabilidade";
import { fmt } from "../core/texto";
import type { Base } from "../core/tipos";
import type { Estado } from "../state/store";
import type { Analise } from "./analise";
import { LIMITES, REGRAS } from "./regras";
import { semAcento } from "../core/texto";

const regra = (id: string) => {
  const r = REGRAS.find((x) => x.id === id)!;
  return `${r.texto} _[${r.fonte}]_`;
};

function frase(a: Avaliacao, base: Base): string {
  const o = a.oferta;
  const onde = `**${o.curso} — ${o.ies.sigla}** (${o.municipio}/${o.uf}, ${o.turno.toLowerCase()})`;
  if (!a.nota.elegivel) return `${onde}: você não cumpre a exigência do curso (${a.nota.motivo}).`;
  const s = a.serie;
  if (!s || s.q50 == null) return `${onde}: sem nota de corte de referência em ${base.anoBase} na sua modalidade; não dá para estimar.`;
  const dif = a.margem ?? 0;
  const pos = dif >= 0 ? `${fmt.nota1(dif)} pontos acima` : `${fmt.nota1(-dif)} pontos abaixo`;
  return `${onde}: sua nota é ${fmt.nota(a.nota.nota)}, ${pos} da previsão de corte (${fmt.nota1(s.q50)}; ` +
    `80% de chance de ficar entre ${fmt.nota1(s.q10)} e ${fmt.nota1(s.q90)}). **${ROTULO_FAIXA[faixaDe(a.prob)]}: ${fmt.pct(a.prob)}** ` +
    `em ${s.mod.rotulo.toLowerCase()}${s.confianca === 0 ? ", com previsão de baixa confiança" : ""}.`;
}

function tem(q: string, ...termos: string[]): boolean {
  return termos.some((t) => q.includes(t));
}

export function responderOffline(base: Base, estado: Estado, an: Analise, temNotas: boolean, pergunta: string): string {
  const q = semAcento(pergunta);
  const out: string[] = [];

  // ---- regras e conceitos: não dependem de notas ----
  if (an.sobreEspera) {
    out.push(regra("espera"));
    const comEspera = an.encontradas.filter((a) => an.espera.has(a.oferta.id));
    if (temNotas && comEspera.length) {
      out.push("Para os cursos da sua pergunta:");
      for (const a of comEspera.slice(0, 6)) {
        const ce = an.espera.get(a.oferta.id)!;
        const o = a.oferta;
        const fonte = ce.dist.base === "propria" ? `histórico do curso na ${ce.dist.ies}` : "padrão de cursos parecidos, estimativa mais fraca";
        out.push(`- **${o.curso} — ${o.ies.sigla}** (${o.municipio}, ${o.turno.toLowerCase()}): ${fmt.pct(ce.regular)} na chamada regular; ` +
          (ce.seNaoPassar == null ? "a regular já é quase certa" : `se não passar, **${fmt.pct(ce.seNaoPassar)}** de ser chamado depois`) +
          `; ${fmt.pct(ce.total)} ao todo. A lista costuma descer uns ${fmt.nota1(ce.quedaMediana)} pontos abaixo do corte (${fonte}).`);
      }
    } else {
      const partes = Object.entries(base.espera.ies).map(([s, i]) => `na **${s}** a lista desceu em mediana **${fmt.nota1(i.queda_mediana)} pontos** abaixo do corte da chamada regular`);
      out.push(`Quanto a lista anda? O MEC não publica isso. De ${base.espera.anos[0]} a ${base.espera.anos[1]}, ${partes.join(" e ")}. Nas demais instituições a plataforma usa o padrão dessas duas.`);
      if (temNotas) out.push("Diga o curso e a instituição (por exemplo, “lista de espera de Agronomia na UFV”) ou abra **Lista de espera** para ver a chance curso a curso.");
    }
    if (an.planos.length) out.push(`Na sua lista, o plano equilibrado tem ${fmt.pct(an.planos[0].resultado.pEspera)} de vaga via lista de espera. Veja o detalhe em **Estratégia**.`);
    return out.join("\n\n");
  }
  if (tem(q, "cota", "modalidade", "escola publica", "ppi", "quilombola", "pcd", "deficiencia")) {
    out.push(regra("cotas"));
    const p = estado.perfil;
    out.push(p.escolaPublica
      ? "Pelo seu perfil, a plataforma já compara a ampla concorrência com as cotas a que você tem direito e mostra, em cada curso, a modalidade com maior chance."
      : "No seu perfil você não marcou ensino médio em escola pública, então as chances mostradas são de ampla concorrência. Se for o seu caso, marque em **Perfil**: as cotas da Lei de Cotas exigem ensino médio integralmente em escola pública.");
    out.push("Ações afirmativas próprias de cada instituição (indígenas aldeados, professores da rede pública, bônus regional…) aparecem na página do curso, mas não entram no cálculo automático: confira o edital da instituição.");
    return out.join("\n\n");
  }
  if (tem(q, "peso", "media ponderada", "como calcula", "nota minima")) {
    out.push(regra("pesos"));
    out.push(regra("enem"));
    out.push("Na página de cada curso você vê os pesos, as notas mínimas e a sua nota calculada com cada edição do Enem.");
    return out.join("\n\n");
  }
  if (tem(q, "confia", "modelo", "como funciona", "metodologia", "previs", "erro", "incerteza")) {
    out.push("Olhamos as notas de corte dos anos anteriores e como elas mudaram. Também consideramos vagas, concorrência e o tipo de vaga que você pode disputar.");
    out.push("Como não dá para saber antecipadamente quantas pessoas vão escolher cada curso, calculamos possibilidades diferentes. Por isso mostramos uma faixa de notas e uma chance estimada, não uma promessa de aprovação.");
    LIMITES.slice(1, 3).forEach((t) => out.push("- " + t));
    out.push("Os números de validação estão em **Metodologia**.");
    return out.join("\n\n");
  }
  if (tem(q, "desempate", "empate")) return regra("desempate");
  if (tem(q, "quantas opcoes", "trocar de opcao", "mudar a opcao", "mudar de opcao")) return [regra("opcoes"), regra("selecao")].join("\n\n");

  if (!temNotas) {
    return "Para falar de chances eu preciso das suas notas do Enem. Preencha em **Perfil** (pode ser uma estimativa) e volte aqui.\n\nEnquanto isso, posso explicar regras: lista de espera, cotas, pesos, ordem das opções.";
  }

  // ---- estratégia ----
  if (tem(q, "estrateg", "opcao", "opcoes", "ordem", "primeira", "segunda", "1a", "2a", "plano", "inscri")) {
    if (!an.planos.length) {
      out.push("Para montar a estratégia, adicione pelo menos dois cursos à sua lista (botão **Adicionar à lista** em Explorar ou no Painel) e diga o quanto quer cada um.");
      if (an.melhores.length) {
        out.push("Algumas candidatas dentro das suas preferências:");
        an.melhores.slice(0, 4).forEach((a) => out.push("- " + frase(a, base)));
      }
      return out.join("\n\n");
    }
    out.push(`Comparei as combinações possíveis com os ${an.lista.length} cursos da sua lista:`);
    for (const pl of an.planos) {
      const r = pl.resultado;
      const n = (c: typeof r.a | null) => (c ? `${c.oferta.curso} (${c.oferta.ies.sigla})` : "sem 2ª opção");
      out.push(`- **${pl.titulo}** — 1ª: ${n(r.a)}; 2ª: ${n(r.b)}. Vaga na chamada regular: ${fmt.pct(r.p1 + r.p2)} (${fmt.pct(r.p1)} na 1ª, ${fmt.pct(r.p2)} na 2ª); lista de espera: ${fmt.pct(r.pEspera)}; sem vaga: ${fmt.pct(r.pSemVaga)}.`);
    }
    out.push(regra("espera"));
    out.push("Próximo passo: abra **Estratégia** para simular outras ordens e ver o efeito de a nota de corte subir ou descer.");
    return out.join("\n\n");
  }

  // ---- comparação / chances em ofertas citadas ----
  if (an.encontradas.length) {
    const comp = tem(q, "compar", " ou ", "versus", " vs ", "melhor");
    out.push(comp ? "Lado a lado, com os dados atuais:" : "O que os dados dizem:");
    an.encontradas.slice(0, comp ? 6 : 5).forEach((a) => out.push("- " + frase(a, base)));
    if (an.encontradas.length > 5) out.push(`Há mais resultados. Em **Explorar** você filtra e ordena todos.`);
    const elegiveis = an.encontradas.filter((a) => a.prob != null);
    if (comp && elegiveis.length >= 2) {
      const melhor = [...elegiveis].sort((x, y) => (y.prob ?? 0) - (x.prob ?? 0))[0];
      out.push(`Pela chance, a mais favorável é ${melhor.oferta.curso} — ${melhor.oferta.ies.sigla} (${fmt.pct(melhor.prob)}). Chance não é tudo: pese cidade, turno e o quanto você quer cada curso. Use **Comparar** para ver o histórico das notas de corte.`);
    } else {
      out.push("Lembre que a nota de corte muda a cada edição; acompanhe as parciais durante a inscrição.");
    }
    return out.join("\n\n");
  }
  const e = an.entidades;
  if (e.cursos.length || e.siglas.length) {
    return `Não encontrei no SISU ${base.anoBase} uma oferta que combine ${[...e.cursos.slice(0, 3), ...e.siglas, ...e.municipios, ...e.ufs].join(", ")}. Tente em **Explorar**, que busca por curso, instituição e cidade.`;
  }

  // ---- panorama ----
  const tot = an.resumo.reduce((s, r) => s + r.n, 0);
  out.push(`Considerando ${an.universo} (${fmt.int(tot)} em que você cumpre as exigências): ` +
    an.resumo.map((r) => `${fmt.int(r.n)} com ${ROTULO_FAIXA[r.faixa].toLowerCase()}`).join(", ") + ".");
  if (an.melhores.length) {
    out.push("Boas oportunidades dentro das suas preferências:");
    an.melhores.slice(0, 5).forEach((a) => out.push("- " + frase(a, base)));
  } else {
    out.push("Com as preferências atuais não achei oferta com chance de 50% ou mais. Vale ampliar estados, turnos ou cursos afins em **Explorar**.");
  }
  out.push("Você pode me perguntar, por exemplo: “quais minhas chances em Direito na UFPE?”, “compare Enfermagem na UFBA e na UFS”, “qual a melhor ordem para as minhas opções?”.");
  return out.join("\n\n");
}
