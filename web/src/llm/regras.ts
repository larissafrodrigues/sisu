/**
 * Base de conhecimento curta sobre as regras do SISU, com a fonte de cada afirmação.
 * Entra no contexto do assistente (LLM ou modo offline) para que ele não precise "lembrar"
 * de regras — e para que a pessoa possa conferir.
 */
export interface Regra {
  id: string;
  texto: string;
  fonte: string;
}

export const REGRAS: Regra[] = [
  { id: "opcoes", texto: "Cada candidato escolhe até 2 opções de curso, em ordem de preferência, e pode alterá-las durante o período de inscrição; vale a última inscrição confirmada.", fonte: "Edital SESu/MEC nº 29/2025 (SISU 2026), itens 1.5 e 1.6" },
  { id: "enem", texto: "Valem as três edições mais recentes do Enem. Para cada opção, o sistema usa automaticamente a edição com a melhor média ponderada; não se misturam notas de edições diferentes. Edições feitas como treineiro ou com redação zerada não contam.", fonte: "Edital nº 29/2025, itens 1.4 a 1.4.3" },
  { id: "selecao", texto: "Na chamada regular o candidato é selecionado em apenas uma opção: na 1ª, se a nota alcançar; senão, na 2ª.", fonte: "Edital nº 29/2025, item 3.5" },
  { id: "espera", texto: "Só entra na lista de espera quem NÃO foi selecionado em nenhuma das duas opções na chamada regular, e apenas para UMA delas. Quem foi selecionado na 2ª opção não pode esperar pela 1ª.", fonte: "Edital nº 29/2025, itens 6.2 e 6.3" },
  { id: "cotas", texto: "Quem se inscreve por cota concorre primeiro às vagas de ampla concorrência e, se não alcançar, às vagas reservadas. A renda considerada é de até 1 salário mínimo per capita e há reserva para quilombolas.", fonte: "Lei nº 14.723/2023 (atualiza a Lei nº 12.711/2012)" },
  { id: "pesos", texto: "Cada curso define pesos para as cinco provas e pode exigir notas mínimas. A nota do candidato naquele curso é a média ponderada.", fonte: "Termo de adesão de cada instituição (relatório 'Vagas ofertadas' do MEC)" },
  { id: "corte", texto: "A nota de corte é a nota do último selecionado na chamada regular. As parciais divulgadas durante a inscrição são apenas referência e mudam todos os dias.", fonte: "Edital nº 29/2025, item 1.10" },
  { id: "desempate", texto: "Desempate, nesta ordem: redação, linguagens, matemática, ciências da natureza, ciências humanas.", fonte: "Edital nº 29/2025, item 3.3" },
  { id: "2027", texto: "As regras do SISU 2027 dependem de edital próprio do MEC, que ainda não tinha sido publicado quando estes dados foram gerados. A plataforma assume as regras de 2026.", fonte: "Aviso da plataforma" },
];

export const LIMITES = [
  "As previsões se baseiam nas notas de corte da chamada regular de 2014 a 2026 publicadas pelo MEC. Não são garantia de vaga.",
  "A incerteza é grande: metade das previsões erra por mais de ~16 pontos, e uma edição inteira pode subir ou descer 10 a 20 pontos (em 2026, as notas baixas subiram mais de 30).",
  "Vagas e pesos de 2027 só são conhecidos quando o MEC publica a oferta. Até lá valem os de 2026 (vagas) e os do último termo de adesão disponível (pesos).",
  "A estimativa de lista de espera usa só dados da UFMG (2022–2026). É uma referência fraca para outras instituições.",
  "Notas parciais de corte, divulgadas durante a inscrição, são informação melhor que qualquer previsão: acompanhe-as.",
];
