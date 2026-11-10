# Dados

Todos os dados são relatórios públicos. Nenhum número da plataforma é inventado ou simulado: o que
não existe em fonte pública aparece como ausente, e as aproximações estão listadas no fim deste arquivo.

## Fontes

| Chave | Relatório | Origem oficial | Uso |
|---|---|---|---|
| `cortes_2010_2018` | Sisu 2010 a 2018 – Nota de corte | MEC/SISU | Séries de 2014 a 2018 |
| `cortes_2019` … `cortes_2026` | Sisu AAAA – Inscrições e notas de corte | MEC/SISU | Nota de corte da chamada regular, vagas e inscritos por modalidade |
| `oferta_2019` … `oferta_2025` | Sisu AAAA – Vagas ofertadas (termo de adesão) | MEC/SISU | Pesos das provas, notas mínimas e vagas por curso |
| `ufmg_chamadas` | SISU/UFMG – notas máximas e mínimas por chamada | UFMG | Evidência sobre a lista de espera |

- Origem oficial dos relatórios do SISU: <https://sisu.mec.gov.br/#/relatorio> (catalogados também em <https://dadosabertos.mec.gov.br/sisu>).
- Origem oficial das chamadas da UFMG: <https://www.ufmg.br/sisu/repositorio/>.

### Por que o download vem de espelhos

O portal do MEC não oferece endereços estáveis para download automático. Por isso o pipeline baixa
**cópias** dos arquivos oficiais guardadas em repositórios públicos no GitHub, cada uma fixada em um
commit específico (`pipeline/sources.py`):

| Espelho | Conteúdo |
|---|---|
| `maiakanegae/sisu-data` | Relatórios do SISU de 2010 a 2025 (arquivos XLSX originais do MEC) |
| `gabrielhenriquekkj/ingressouniteste` | Relatório do SISU 2026 em CSV |
| `AndreIsraelAO/sisu-ufmg-notas-de-corte` | Transcrição dos PDFs da UFMG para CSV |

`pipeline/fetch_raw.py` grava em `data/raw/MANIFESTO.json` o tamanho e o SHA-256 de cada arquivo.

**Como auditar.** Baixe o relatório na origem oficial, calcule o SHA-256 e compare com o manifesto.
Para os XLSX de 2010 a 2025 a comparação é direta. Dois arquivos merecem atenção especial, porque
passaram por conversão de formato feita por terceiros: o CSV de 2026 e a transcrição da UFMG. Nesses
casos, confira uma amostra de linhas contra o relatório/PDF oficial. Se preferir não depender de
espelho algum, coloque os arquivos oficiais em `data/raw/` com os nomes do manifesto e rode o
pipeline a partir do ETL (`python -m pipeline.etl`).

## Tabelas geradas

`data/processed/` (intermediárias, fora do Git):

| Arquivo | Conteúdo |
|---|---|
| `painel.csv.gz` | 548.753 linhas: uma por oferta × modalidade × ano (2014–2026), com nota de corte, vagas e inscritos |
| `ofertas.csv.gz` | Catálogo de 2026: 7.390 ofertas (curso + turno + campus) com pesos, notas mínimas e área |
| `previsoes.csv.gz` | 46.996 previsões para 2027 (centro, escala, quantis, confiança) |
| `backtest.csv.gz` | 225.705 previsões fora da amostra (2019–2026) com o valor real |
| `relatorio_modelo.json` | Métricas, calibração, cenários e importâncias |
| `espera.json` | Distribuição da queda da nota mínima entre chamadas (UFMG) |

`web/public/data/` (o que o site carrega, versionado):

| Arquivo | Tamanho | Conteúdo |
|---|---|---|
| `base.json` | 4,5 MB (≈ 1 MB com gzip) | Catálogo, séries, previsões e parâmetros do modelo, em formato colunar |
| `hist/<UF>.json` | 7,8 MB no total | Histórico completo das séries, carregado por estado sob demanda |
| `relatorio.json` | 12 kB | Conteúdo da página Metodologia |
| `descricoes.json` | 24 kB | Descrição completa das modalidades |

## Tratamento

1. **Leitura** (`leitura.py`): padroniza nomes de coluna, que mudam de ano para ano. Não altera valores.
2. **Chave da oferta** (`etl.py`): código do curso na instituição + turno. É o que liga o mesmo curso
   entre edições.
3. **Modalidades** (`modalidades.py`): o SISU teve três formas de registrar a modalidade (texto até
   2018; letra + descrição de 2019 a 2023; código oficial a partir de 2024). As descrições antigas da
   Lei de Cotas são mapeadas para os códigos atuais (`LB_PPI`, `LI_EP`…). Ações afirmativas próprias
   das instituições recebem um código derivado da descrição.
4. **Pesos e notas mínimas**: vêm do termo de adesão mais recente de cada curso.
5. **Área do curso**: classificação heurística por nome, usada só para filtros e sugestões.

## Limitações conhecidas

- **Pesos de 2026.** Não havia relatório público de “Vagas ofertadas” de 2026 quando os dados foram
  gerados. Dos 7.390 cursos, 6.954 usam pesos de um termo de adesão anterior (6.626 deles o de 2025);
  132 herdam os pesos do mesmo curso em outro campus/turno da instituição; **304 ficam sem pesos e
  são tratados com média simples**. A tela do curso mostra de onde vieram os pesos. Confirme sempre
  no termo de adesão de 2027.
- **Continuidade das cotas.** Em 2024 a renda da Lei de Cotas passou de 1,5 para 1 salário mínimo,
  surgiu a cota para quilombolas e as modalidades “PcD + PPI” deixaram de existir. Ligar as séries
  antes e depois dessa mudança é uma aproximação; séries novas têm histórico curto e recebem
  confiança baixa.
- **Só a chamada regular.** O MEC publica a nota de corte da chamada regular. O que acontece na
  lista de espera só é conhecido, de forma sistemática, para a UFMG.
- **Sem microdados.** A plataforma não usa dados individuais de candidatos (os microdados do SISU não
  estavam acessíveis para o pipeline). Por isso não há modelo de taxa de matrícula nem de posição na fila.
- **Bônus regionais.** Nas modalidades com bônus, a nota é multiplicada pelo percentual do relatório.
  Quem tem direito ao bônus depende de regras de cada instituição, que a plataforma não verifica.
- **SISU 2027.** As previsões assumem a oferta e as regras de 2026. Cursos podem entrar, sair ou
  mudar pesos e vagas no termo de adesão de 2027.

## Atualizar para uma nova edição

1. Acrescente o relatório em `FONTES` (`pipeline/sources.py`).
2. `python -m pipeline.run_all`
3. `python -m pytest pipeline/tests && (cd web && npm test)`
4. Faça commit de `web/public/data/` e de `data/raw/MANIFESTO.json`.
