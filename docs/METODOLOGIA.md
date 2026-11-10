# Como a Bússola SISU calcula

Versão curta, sem termos técnicos. A descrição completa do modelo está em [MODELO.md](MODELO.md).

## Em poucas palavras

Comparamos a nota do estudante com a nota de corte que esperamos para 2027 em cada curso. Essa
expectativa vem do histórico oficial do SISU, de 2014 a 2026.

Como a nota de corte muda de um ano para o outro, a plataforma não mostra um número só: mostra uma
**faixa provável** e a **chance** de a nota ser suficiente.

## Três passos

1. **A nota no curso.** Cada curso dá pesos diferentes às provas do Enem. Calculamos a média com os
   pesos daquele curso e conferimos as notas mínimas exigidas.
2. **A nota de corte esperada.** Olhamos o histórico do curso: a última nota de corte, se ela vinha
   subindo ou caindo, quantas vagas e quantos inscritos teve. Com isso estimamos a de 2027.
3. **A chance.** Ninguém sabe se a próxima edição será mais ou menos disputada. Por isso testamos
   vários cenários, baseados no que já aconteceu em anos anteriores. A chance é a parte dos cenários
   em que a nota alcança o corte.

## Como ler a chance

Chance de 70% quer dizer: em 10 situações parecidas, a nota foi suficiente em 7. **Não é garantia
de vaga.**

| Faixa | Chance |
|---|---|
| Alta | 80% ou mais |
| Moderada | de 50% a 79% |
| Baixa | de 20% a 49% |
| Remota | menos de 20% |

Cada previsão traz também um selo de **confiança** (alta, média ou baixa). Ele diz o quanto o
histórico daquele curso ajuda a prever. Cursos com uma ou duas vagas e cotas criadas há pouco tempo
costumam ter confiança baixa.

## Dá para confiar?

Testamos o método no passado: com os dados até um ano, previmos o ano seguinte e comparamos com o
que aconteceu de verdade (2019 a 2026).

- **Metade das previsões errou menos de 16 pontos.**
- **Em 8 de cada 10 casos**, a nota de corte real ficou dentro da faixa prevista.
- **Uma em cada 10 previsões errou mais de 54 pontos.**

O ganho sobre simplesmente repetir a última nota de corte é pequeno (erro médio de 23,7 pontos
contra 25,9). O que a plataforma acrescenta é mostrar o tamanho da incerteza.

Em anos fora do comum o erro é maior. Em 2026, quando o SISU passou a aceitar três edições do Enem,
as notas de corte subiram mais do que o previsto em quase todos os cursos.

## As duas opções

A plataforma segue as regras do edital de 2026: quem é selecionado em qualquer uma das duas opções
não pode entrar na lista de espera. Por isso uma 2ª opção "garantida" protege contra ficar sem
vaga, mas tira a chance de ser chamado depois na 1ª. A tela Estratégia calcula essa troca para cada
combinação e sugere três planos: equilibrado, seguro e ousado.

## O que a plataforma não sabe

- **As regras, vagas e pesos de 2027.** Até o MEC publicar, usamos os das edições anteriores.
- **A lista de espera.** O MEC não divulga essas notas. A estimativa usa só dados da UFMG e é uma
  referência fraca para outras instituições.
- **O que acontece durante a inscrição.** A nota de corte parcial do próprio SISU, que muda todo
  dia, é informação melhor do que qualquer previsão.

## De onde vêm os dados

Dos relatórios públicos do MEC com as notas de corte, vagas e inscritos do SISU. Para a lista de
espera, dos relatórios da UFMG. A lista de arquivos está em [DADOS.md](DADOS.md).

## O consultor

O consultor não faz contas: ele recebe os números calculados pela plataforma e os explica em
texto. Em cada resposta dá para abrir os dados que ele usou.
