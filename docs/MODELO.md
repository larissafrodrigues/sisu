# Modelo: descrição técnica

Para quem vai mexer no código ou auditar os números. A versão curta, sem termos técnicos, está em
[METODOLOGIA.md](METODOLOGIA.md).

Este documento explica como a plataforma transforma notas de corte passadas em chances, o quanto
essas chances erram e o que elas não sabem. Os números abaixo saem de
`data/processed/relatorio_modelo.json` e aparecem também na página **Metodologia** do site.

## 1. O que é previsto

Para cada série (oferta × modalidade) com nota de corte em 2026, a nota de corte da **chamada
regular** do SISU 2027: 46.996 séries.

A chance mostrada ao estudante é `P(nota de corte de 2027 ≤ nota do estudante naquele curso)`.

## 2. A nota do estudante

`web/src/core/notas.ts`:

- média ponderada pelos pesos do termo de adesão do curso;
- eliminação se alguma nota mínima (por prova ou da média) não for atingida;
- quando o estudante informa mais de uma edição do Enem, vale a edição que dá a melhor média
  **naquele curso**, sem misturar provas de edições diferentes (regra do SISU 2026).

## 3. Modelo

```
corte(t+1) = corte(t) + f(atributos em t)  +  choque da edição  +  ruído da série
             └────── previsão central ────┘   └─ incerteza comum ┘  └ incerteza própria ┘
```

**Previsão central.** Gradient boosting (`HistGradientBoostingRegressor`, perda absoluta) treinado
em 318.797 transições de 2014 a 2026. O alvo é a variação da nota de corte **relativa à mediana do
ano**: o modelo aprende o que é previsível (reversão à média, distância para a ampla concorrência,
tamanho da turma, tipo de cota) e não tenta adivinhar se a edição inteira vai subir ou descer.

Atributos (24), todos conhecidos antes das inscrições: última nota de corte, variações em 1 e 2
anos, distância da média de 3 anos, volatilidade, anos de histórico, vagas, inscritos, inscritos
por vaga, variação de vagas, distância e variação recente da ampla concorrência do mesmo curso,
posição em relação à mediana nacional do curso, tipo de modalidade, grau, turno, região e
categoria da instituição.

**Choque da edição.** Em cada ano, quase todas as notas de corte se movem juntas (Enem mais fácil
ou mais difícil, mudança de regra, mais ou menos candidatos). Esse movimento não é previsível com
os dados disponíveis. Em vez de escondê-lo, o modelo guarda os choques observados em cada ano do
backtest, em quatro faixas de nota (500, 600, 700 e 800), e trata cada um como um cenário possível
para 2027. Dois ajustes:

- *simetria*: cada choque entra com os dois sinais, porque o sentido do choque de uma edição não
  se mostrou previsível a partir das anteriores;
- *inflação de 25%*: com poucos anos observados, a amplitude real tende a ser subestimada.

São 8 anos × 2 sinais = 16 cenários. Choques medianos observados (pontos):

| Faixa | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|
| 500 | −15,9 | −2,8 | −23,5 | −20,0 | +22,2 | +11,0 | −8,4 | +36,1 |
| 600 | −0,5 | −6,0 | −16,6 | −11,8 | +10,5 | +8,6 | −4,0 | +19,0 |
| 700 | +8,7 | −11,6 | −3,2 | −5,8 | −4,6 | +7,7 | −4,0 | +9,4 |
| 800 | +13,3 | −14,9 | +10,8 | −3,3 | −11,7 | +7,5 | −9,4 | +7,6 |

**Ruído da série.** Um segundo boosting prevê o tamanho típico do erro de cada série (escala `s`,
com piso de 3 pontos; mediana de 16,3). A forma da distribuição vem dos erros padronizados
observados no backtest (distribuição empírica, sem supor normalidade).

**Probabilidade.** A distribuição final é uma mistura: média, sobre os 16 cenários, da distribuição
empírica deslocada pelo choque do cenário. O Python exporta `p`, `s`, os cenários e a distribuição
de `z`; o navegador refaz a conta (`web/src/core/probabilidade.ts`). Um teste confere que os dois
lados dão os mesmos quantis.

## 4. Avaliação fora da amostra

Backtest temporal: para prever o ano T só se usa o que existia antes de T. Anos de teste: 2019 a
2026 (225.705 previsões).

| Método | Erro absoluto médio | Mediana | P90 |
|---|---|---|---|
| **Modelo (boosting)** | **23,7** | 16,3 | 53,5 |
| Média dos 2 últimos anos | 25,1 | 16,6 | 57,3 |
| Média dos 3 últimos anos | 25,4 | 17,3 | 57,5 |
| Repetir a última nota | 25,9 | 16,7 | 59,9 |
| Extrapolar tendência | 30,5 | 19,7 | 69,9 |

Leitura honesta: o ganho sobre “repetir a última nota” é de 2,2 pontos (8%). Notas de corte são
difíceis de prever, e a maior parte do valor da plataforma está em **medir bem a incerteza**, não
em reduzir o erro central. Extrapolar tendência é o pior método: nota que subiu tende a voltar.

Onde o erro é maior e menor (erro mediano depois de descontado o choque do ano):

| Grupo | Mediana | P90 |
|---|---|---|
| Corte anterior de 750 ou mais | 7,7 | 34,2 |
| Mais de 10 vagas na modalidade | 10,7 | 34,7 |
| Ampla concorrência | 11,1 | 37,7 |
| Lei de Cotas | 15,2 | 51,6 |
| Ações afirmativas próprias | 20,0 | 65,7 |
| Até 2 vagas na modalidade | 22,3 | 71,7 |
| Corte anterior abaixo de 550 | 24,6 | 76,3 |

## 5. Calibração dos intervalos

Para cada ano T de 2021 a 2026, a incerteza é calibrada só com anos anteriores a T e a cobertura é
medida em T.

| Ano | Intervalo de 50% | de 80% | de 90% | Real abaixo do P10 | Real acima do P90 |
|---|---|---|---|---|---|
| 2021 | 42,3% | 70,3% | 82,3% | 26,4% | 3,4% |
| 2022 | 53,5% | 81,8% | 90,3% | 15,2% | 3,0% |
| 2023 | 53,3% | 84,2% | 92,9% | 4,5% | 11,3% |
| 2024 | 49,6% | 79,8% | 89,4% | 6,8% | 13,4% |
| 2025 | 62,0% | 86,2% | 92,7% | 10,8% | 3,0% |
| 2026 | 40,6% | 73,1% | 86,3% | 2,0% | 24,9% |
| **Média** | **50,2%** | **79,2%** | **89,0%** | 10,9% | 9,8% |

Na média os intervalos estão corretos. **Dentro de um ano específico, não**: em 2026 (primeira
edição que aceitou três edições do Enem) as notas subiram mais do que quase todos os cenários
previam, e um quarto das notas de corte ficou acima do P90. Uma chance de 80% significa “80% na
média de muitas edições”; em uma edição ruim, o erro atinge quase todos os cursos de uma vez.
É por isso que a estratégia avalia as duas opções **no mesmo cenário** (seção 7) e que o simulador
permite fixar um cenário pessimista.

A inflação de 25% e a simetria dos cenários foram escolhidas olhando esta mesma tabela, de modo
que a cobertura média é parcialmente ajustada aos dados e pode ser um pouco otimista.

## 6. Rótulo de confiança

| Rótulo | Critério | Séries |
|---|---|---|
| Alta | escala ≤ 12 pontos e 4 ou mais anos de histórico | 12.627 |
| Média | escala ≤ 22 pontos e 2 ou mais anos | 13.140 |
| Baixa | demais | 21.229 |

Quase metade das séries tem confiança baixa, principalmente cotas criadas em 2024 e modalidades
com 1 ou 2 vagas.

## 7. Estratégia das duas opções

`web/src/core/estrategia.ts`. Regras modeladas (Edital SESu/MEC nº 29/2025, SISU 2026):

1. até duas opções, em ordem de preferência;
2. quem alcança o corte da 1ª opção é selecionado nela; senão, tenta a 2ª;
3. quem é selecionado em qualquer opção não participa da lista de espera;
4. quem não foi selecionado escolhe uma das duas opções para a lista de espera.

Para cada par ordenado da lista do estudante, e em cada um dos 16 cenários, calcula-se a chance de
quatro desfechos: vaga na 1ª, vaga na 2ª, vaga pela lista de espera, sem vaga. As duas opções
compartilham o cenário: se a edição sobe, sobe para as duas. Tratar as opções como independentes
subestimaria a chance de ficar sem vaga.

Três planos:

- **Equilibrado**: maior valor esperado, pesando o interesse declarado (1 a 5) pela chance.
- **Seguro**: maior chance de sair da chamada regular com vaga.
- **Ousado**: na 1ª opção, o curso mais disputado entre os de maior interesse (desde que tenha ao
  menos 3% de chance); na 2ª, a opção que mais agrega a partir daí.

## 8. Lista de espera

`pipeline/ufv.py`, `pipeline/espera.py` e `web/src/core/espera.ts`.

**Dados.** O MEC não publica notas da lista de espera. Duas universidades publicam o suficiente:

- **UFV**: para cada edição, a página da 1ª chamada (classificados, pontos e modalidade) e a lista de
  espera final (cada candidato, pontos e situação: "Convocado na Nª chamada pela modalidade X" ou
  "Espera"). `pipeline/ufv.py` lê as duas versões de formato das páginas e grava só agregados por
  curso e modalidade em `data/fontes/ufv_espera.csv` (nenhum nome ou inscrição).
- **UFMG**: notas mínima e máxima de cada chamada (PDFs oficiais transcritos).

Para cada curso, modalidade e edição de 2022 a 2026 (5.096 casos; 2.008 da UFV, 3.088 da UFMG):

```
queda = corte da chamada regular − menor nota convocada na lista de espera   (0 se ninguém foi chamado)
```

**Ligação com o catálogo.** Os nomes não batem com os do MEC ("QUIMICA" na UFV é "ABI - QUÍMICA"),
mas o corte da chamada regular é o mesmo nas duas fontes. Cada curso é ligado à oferta da mesma
instituição com mais cortes iguais (mesmo ano e modalidade, diferença menor que 0,06; mínimo de 5).
Resultado: todas as 69 ofertas da UFV no SISU 2026 e 94 da UFMG.

**Perfis.** Quantis da queda por grupo de modalidade (ampla, escola pública, PPI, PcD, quilombola) e
faixa de nota de corte da regular, juntando as duas universidades. Medianas, em pontos:

| Grupo | até 550 | 550–600 | 600–650 | 650–700 | 700–750 | acima de 750 |
|---|---|---|---|---|---|---|
| Ampla concorrência | 58,7 | 96,7 | 104,8 | 37,1 | 26,8 | 26,4 |
| Escola pública | 0,0 | 82,9 | 79,1 | 34,0 | 20,3 | 13,7 |
| PPI | 52,1 | 103,7 | 73,6 | 47,5 | 35,3 | 29,9 |

Cursos muito disputados quase não abrem vaga na lista; os de corte intermediário são os que mais
descem. Células com menos de 30 casos usam as faixas vizinhas.

**Distribuição de cada curso.** Para cursos da UFV e da UFMG, as quedas observadas do próprio curso
(peso 1 cada) misturadas ao perfil, que entra com peso de 4 anos. Para as demais, só o perfil. O peso
foi escolhido deixando um ano de fora por vez (3.726 previsões):

| Método | Erro (CRPS, pontos) | Faixa de 80% acertou |
|---|---|---|
| só o histórico do curso | 30,78 | 60,7% |
| histórico + perfil (peso 1) | 28,62 | 66,4% |
| histórico + perfil (peso 2) | 27,83 | 74,9% |
| histórico + perfil (peso 4) | 27,52 | 80,6% |
| só o perfil | 30,76 | 82,5% |

**Chance.** Em cada cenário da edição, a chance de ser alcançado pela lista é a média, sobre a
distribuição da queda, de `P(corte da regular ≤ nota + queda)`. Cotistas estão na lista da cota e na
da ampla concorrência: vale a maior das duas. A chance "se não passar na regular" é
`chance pela lista ÷ (1 − chance na regular)`, mostrada só quando a regular não é quase certa.

**Transferência para outras instituições.** Prevendo uma universidade só com o perfil da outra:

- perfil da UFV prevendo a UFMG: faixa de 80% acertou 84,6% (erro mediano 25,8 pontos);
- perfil da UFMG prevendo a UFV: faixa de 80% acertou 71,1% (erro mediano 37,2 pontos).

A UFV desce mais que a UFMG (queda mediana de 64,9 contra 42,7 pontos). Uma terceira
instituição pode se parecer com uma, com outra ou com nenhuma; por isso a interface marca essas
estimativas como "padrão geral".

**Limitações.**

- Em 48% das modalidades da UFV a lista zerou (todos os inscritos foram chamados). A queda
  observada é um piso; a estimativa fica conservadora.
- A queda depende de quantas chamadas a instituição faz e de quantos aprovados não se matriculam.
  Isso muda de ano para ano e de instituição para instituição.
- Vagas não preenchidas de uma modalidade são remanejadas para outras, o que mistura as listas.

## 9. Consultor

`web/src/consultoria/` apresenta respostas automáticas, sem modelo de linguagem remoto.
A cada pergunta, `analise.ts` identifica cursos, instituições, estados e cidades, e recupera os resultados já calculados. `offline.ts` seleciona a resposta adequada com base em regras; `regras.ts` registra as fontes; e `contexto.ts` organiza os dados usados para conferência.

As respostas estão limitadas aos temas implementados. Para verificações mais detalhadas, consulte as telas **Explorar**, **Comparar**, **Estratégia** e **Lista de espera**.

## 10. O que a plataforma não sabe

- As regras, a oferta e os pesos do SISU 2027 (assume os de 2026).
- A dificuldade do Enem 2026 e o comportamento dos candidatos em 2027.
- A nota parcial durante a semana de inscrições. Quando o SISU abrir, a nota de corte parcial do
  próprio sistema é informação melhor do que qualquer previsão feita antes.
- A situação individual de cada candidato quanto à documentação de cotas.
- O ritmo da lista de espera nas instituições que não publicam esses dados (todas menos UFV e UFMG).

Previsão não é garantia de vaga.
