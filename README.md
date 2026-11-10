# Bússola SISU

Plataforma de apoio à decisão para o SISU. O estudante informa as notas do Enem e recebe, para cada
curso de instituição pública, a **chance de ser selecionado**, a **previsão da nota de corte com
intervalo de incerteza**, uma **estratégia para as duas opções** de inscrição e um **consultor
conversacional** (LLM servido localmente pelo vLLM ou pelo Ollama) que explica e compara tudo isso.

Tudo roda no navegador. O site é estático: funciona no GitHub Pages e em qualquer servidor de arquivos.

| | |
|---|---|
| Dados | Relatórios oficiais do SISU/MEC, 2014–2026 (≈ 549 mil linhas), mais as listas de espera da UFV e da UFMG (2022–2026) |
| Catálogo | 7.390 ofertas, 136 instituições, 587 municípios, 274.133 vagas (SISU 2026) |
| Modelo | Gradient boosting + cenários de choque de edição + calibração empírica; avaliado fora da amostra |
| Erro | 23,7 pontos de erro absoluto médio (repetir a última nota de corte: 25,9); intervalos de 80% cobrem 79% em média |
| LLM | vLLM (padrão) ou Ollama, servido pelo próprio usuário; modo offline determinístico quando não há servidor |

> **Aviso.** Previsão não é garantia de vaga. As regras do SISU 2027 dependem de edital do MEC que
> ainda não existia quando os dados foram gerados (nov/2026); a plataforma assume as regras de 2026.

## Rodar localmente

Requisitos: Node 20+ (site) e, se quiser regenerar os dados, Python 3.11+.

```bash
cd web
npm install
npm run dev          # http://127.0.0.1:5173
```

Os dados já processados estão em `web/public/data/`, então o site funciona sem rodar o pipeline.

### Consultor com IA (opcional)

O consultor fala com um servidor de LLM que você mesmo roda. O padrão é o **vLLM**; o **Ollama**
continua disponível no seletor “Servidor” da tela Consultor.

**vLLM** (requer placa de vídeo NVIDIA com CUDA):

```bash
conda create -n vllm python=3.12 -y && conda activate vllm
pip install vllm
vllm serve Qwen/Qwen2.5-7B-Instruct-AWQ \
  --host 127.0.0.1 --port 8000 --max-model-len 8192 --gpu-memory-utilization 0.85
```

Quando aparecer `Application startup complete`, abra a tela **Consultor**: ela detecta o servidor
em `http://127.0.0.1:8000` e o modelo servido. Se iniciar o vLLM com `--api-key`, preencha o campo
“Chave de API” (fica só no seu navegador). Qualquer servidor com API compatível com OpenAI
(`/v1/models` e `/v1/chat/completions`) funciona da mesma forma.

| VRAM | Modelo sugerido |
|---|---|
| 8 GB | `Qwen/Qwen2.5-7B-Instruct-AWQ` |
| 16 GB ou mais | `Qwen/Qwen2.5-7B-Instruct` |
| 24 GB ou mais | `Qwen/Qwen2.5-14B-Instruct-AWQ` |

**Ollama** (roda também só com CPU): `ollama pull qwen2.5:7b`, depois escolha “Ollama” no seletor.

Sem servidor algum, o consultor responde no **modo offline**, montando as respostas diretamente dos dados.

### Regenerar os dados e o modelo

```bash
pip install -r pipeline/requirements.txt
python -m pipeline.run_all        # baixa (~130 MB), limpa, treina, valida e exporta (≈ 5 min)
python -m pipeline.ufv --conferir # confere a lista de espera da UFV com o site oficial
python -m pytest pipeline/tests   # testes do pipeline
cd web && npm test                # testes do motor e do consultor (usam os dados reais)
```

## Publicar no GitHub Pages

1. Suba este repositório para o GitHub.
2. Em *Settings → Pages → Build and deployment*, escolha **GitHub Actions**.
3. A cada push na `main`, `.github/workflows/pages.yml` testa, compila e publica `web/dist`.

O build usa caminhos relativos (`base: "./"`) e rotas por hash, então funciona em
`https://usuario.github.io/repositorio/` sem configuração extra.

**Limitações da hospedagem estática, e como foram tratadas**

| Limitação | Solução |
|---|---|
| Não há servidor para rodar modelo | O pipeline pré-calcula previsão e escala por série; o navegador só faz a conta de probabilidade (`web/src/core`) |
| Não há banco de dados | JSON colunar: `base.json` (≈ 1 MB comprimido) ao abrir; histórico por UF sob demanda |
| Não há backend para o LLM | O navegador fala direto com o vLLM (ou Ollama) do usuário; sem ele, modo offline |
| Site em HTTPS chamando `http://127.0.0.1` | Permitido pelos navegadores para endereços locais. O vLLM aceita qualquer origem por padrão (`--allowed-origins`); o Ollama precisa liberar a origem: `OLLAMA_ORIGINS="https://usuario.github.io" ollama serve` |
| Não há contas de usuário | Perfil, lista e tema ficam no `localStorage` do navegador; nada é enviado |

## Arquitetura

```
pipeline/  (Python, offline)                          web/  (TypeScript + React, no navegador)
┌───────────┐  ┌──────┐  ┌────────┐  ┌──────────┐     ┌──────────────────────────────────────────┐
│ fetch_raw │→ │ etl  │→ │ modelo │→ │ exportar │ ──▶ │ public/data/*.json                       │
└───────────┘  └──────┘  └────────┘  └──────────┘     │ core/   notas · probabilidade · estratégia│
 relatórios     séries    backtest     JSON           │ llm/    análise → contexto → vLLM/offline │
 MEC/UFMG       limpas    calibração   compacto       │ views/  painel · explorar · comparar · …  │
                └────────── espera ──────────┘        └──────────────────────────────────────────┘
```

- `pipeline/` — tudo que precisa de dados brutos e aprendizado de máquina. Detalhes em [docs/DADOS.md](docs/DADOS.md) e [docs/MODELO.md](docs/MODELO.md).
- `web/src/core/` — regras do SISU e matemática, sem dependência de interface (testável em Node).
- `web/src/llm/` — recuperação de fatos, montagem de contexto, clientes vLLM/Ollama e consultor offline.
- `web/src/views/` e `web/src/ui/` — telas e componentes.

Mais em [docs/ARQUITETURA.md](docs/ARQUITETURA.md). Para entender os cálculos sem termos técnicos, leia [docs/METODOLOGIA.md](docs/METODOLOGIA.md).

## Tema claro e escuro

O seletor fica no menu lateral (no celular, na barra do topo): **Claro**, **Escuro** ou **Auto**, que
segue o tema do aparelho. A escolha fica salva no navegador.

## O que a plataforma faz

1. **Descoberta** — Painel e Explorar ordenam as 7.390 ofertas pelas preferências e pela chance; o Painel sugere cursos vizinhos da mesma área com chance alta.
2. **Análise preditiva** — cada modalidade de cada curso tem previsão central, intervalo de 80%, rótulo de confiança e histórico desde 2014. A página Metodologia mostra o erro do modelo e a cobertura real dos intervalos.
3. **Lista de espera** — chance de ser chamado depois da chamada regular, curso a curso: histórico próprio para os cursos da UFV e da UFMG, padrão dessas duas para as demais instituições.
4. **Estratégia** — avalia todas as combinações ordenadas da lista do estudante sob as regras do edital (seleção em uma única opção; lista de espera só para quem não foi selecionado) e devolve planos equilibrado, seguro e ousado, com simulador de “e se”.
5. **Consultor** — LLM fundamentado: a cada pergunta recebe só os fatos calculados pela plataforma e as regras com fonte, e a resposta mostra os dados usados.

## Fontes

Relatórios “Inscrições e notas de corte” e “Vagas ofertadas” do SISU, publicados pelo MEC em
<https://sisu.mec.gov.br/#/relatorio>, e “notas máximas e mínimas por chamada” da UFMG
(<https://www.ufmg.br/sisu/repositorio/>), e listas de espera da UFV (<https://www2.pse.ufv.br>). O pipeline baixa cópias desses arquivos de espelhos
públicos fixados por commit e grava o SHA-256 de cada um em `data/raw/MANIFESTO.json`; a lista
completa, com links, aparece na página Metodologia e em [docs/DADOS.md](docs/DADOS.md).

Regras: Edital SESu/MEC nº 29/2025 (SISU 2026) e Lei nº 14.723/2023.

## Licença

Código sob licença MIT. Os dados são públicos e pertencem às suas fontes.
