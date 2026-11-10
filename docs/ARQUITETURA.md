# Arquitetura

## Princípios

1. **Estático primeiro.** Tudo que o navegador precisa é pré-calculado. Não há servidor de aplicação.
2. **Uma fonte de verdade por conta.** A matemática de probabilidade existe em Python (calibração) e em
   TypeScript (uso). Um teste (`web/tests/motor.test.ts`) confere que o TypeScript reproduz os quantis
   exportados pelo Python.
3. **O LLM não calcula.** Ele recebe fatos prontos e redige. Qualquer número citado tem de estar no contexto.
4. **Incerteza é dado de primeira classe.** Toda série carrega previsão central, escala de erro e
   rótulo de confiança; toda tela que mostra chance mostra também o intervalo.

## Módulos

### `pipeline/` (Python)

| Arquivo | Papel |
|---|---|
| `sources.py` | Registro das fontes: origem oficial, espelho fixado por commit, nome local |
| `fetch_raw.py` | Download e manifesto com SHA-256 |
| `leitura.py` | Lê XLSX/CSV do MEC e padroniza nomes de coluna e formatos numéricos |
| `modalidades.py` | Converte as modalidades de cada era do SISU em códigos comuns |
| `etl.py` | Monta o painel (oferta × modalidade × ano) e o catálogo com pesos e mínimas |
| `atributos.py` | Atributos do modelo, só com informação disponível antes de cada edição |
| `modelo.py` | Backtest temporal, modelo central, escala, cenários, calibração, previsões |
| `espera.py` | Distribuição da queda da nota mínima entre chamadas (UFMG) |
| `exportar.py` | Gera os JSON do site |
| `run_all.py` | Orquestra tudo |

### `web/src/core/` (TypeScript, sem React)

| Arquivo | Papel |
|---|---|
| `dados.ts` | Carrega e decodifica os JSON; histórico por UF sob demanda |
| `notas.ts` | Média ponderada, notas mínimas, melhor edição do Enem por curso |
| `probabilidade.ts` | `Motor`: CDF de mistura sobre cenários, quantis, faixas de chance |
| `avaliacao.ts` | Elegibilidade a cotas, regra “ampla concorrência primeiro”, afinidade com preferências |
| `estrategia.ts` | Desfechos de um par ordenado de opções, lista de espera, três planos |
| `lista.ts` | Ponte entre a lista salva e os candidatos da estratégia |

### `web/src/llm/`

```
pergunta ──▶ analise.ts ──▶ fatos estruturados ──┬──▶ contexto.ts ──▶ provedores.ts ──▶ resposta em streaming
             (entidades,     (ofertas, planos,   │     (prompt + contexto)   ├ openai.ts (vLLM)
              recuperação)    panorama)          │                           └ ollama.ts
                                                 └──▶ offline.ts ──▶ resposta determinística
```

- `analise.ts` reconhece cursos, siglas de instituições, estados e cidades na pergunta e recupera as
  ofertas correspondentes já avaliadas para o perfil.
- `regras.ts` guarda as regras do SISU com a fonte de cada uma.
- `provedores.ts` escolhe o servidor configurado. `openai.ts` fala com o vLLM (ou qualquer servidor
  compatível com OpenAI) por `/v1/models` e `/v1/chat/completions` com streaming SSE; `ollama.ts` usa
  `/api/tags` e `/api/chat` (NDJSON). Acrescentar um servidor é implementar `verificar` e `conversar`
  e registrá-lo em `PROVEDORES`.

### Estado

`state/store.tsx` mantém perfil, lista de interesse, comparação e configuração do LLM (servidor, endereço, chave, modelo) em um contexto
React, persistido em `localStorage` (com `try/catch`: se o armazenamento falhar, o app segue em memória).
As avaliações de todas as ofertas são recalculadas quando o perfil muda (≈ 50 ms para 7.390 ofertas).

### Tema

`tema/tema.ts` guarda a preferência (claro, escuro ou sistema) e escreve o tema em uso no atributo
`data-tema` do `<html>`; o CSS troca as variáveis de cor a partir dele. Um script curto no
`index.html` aplica o atributo antes da primeira pintura, para a página não piscar no tema errado.

## Formato dos dados

`base.json` é colunar: dicionários (`dic`) + vetores paralelos para ofertas e séries. Cada série
(oferta × modalidade) traz `p` (centro), `s` (escala), `q10/q50/q90`, vagas, inscritos e os dois
últimos cortes. Os parâmetros globais do modelo (`cenarios`, distribuição `z`) vão no mesmo arquivo.
`hist/<UF>.json` traz as séries completas, indexadas pelo mesmo índice de série.

## Como estender

- **Nova edição do SISU:** acrescente a fonte em `sources.py` e rode `python -m pipeline.run_all`.
  `ULTIMO_ANO` e `ANO_ALVO` são derivados da lista de fontes.
- **Termo de adesão de 2027 (vagas e pesos):** acrescente como fonte do tipo `oferta`; o ETL usa o
  termo mais recente de cada curso.
- **Outro provedor de LLM** (por exemplo, WebLLM no navegador): implemente `verificar` e `conversar`
  e registre em `web/src/llm/provedores.ts`.
- **Lista de espera de outras instituições:** some séries no mesmo formato em `espera.py`.
