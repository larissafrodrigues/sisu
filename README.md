# Bússola SISU — piloto gratuito

A Bússola SISU ajuda estudantes a explorar cursos, calcular suas notas ponderadas, comparar possíveis notas de corte, estimar chances de seleção, organizar duas opções de inscrição e entender a lista de espera.

O **Consultor** oferece respostas automáticas a perguntas comuns usando regras e resultados calculados pela plataforma. Ele não é um chatbot generativo: algumas perguntas fora dos temas previstos podem não receber respostas específicas.

**Tudo funciona no navegador**, com os dados já incluídos em `web/public/data/`. Não é necessário servidor de IA, API, Cloudflare, banco de dados nem conta dos estudantes. O perfil e a lista de interesse são guardados no armazenamento do navegador. A página pode ser hospedada gratuitamente no GitHub Pages.

> **Aviso:** as previsões são estimativas e não garantem vaga. Confira o edital e as notas de corte parciais na plataforma oficial do SISU.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie os arquivos deste projeto para a raiz, incluindo `web/` e `.github/workflows/pages.yml`.
2. Em **Settings → Pages**, selecione **GitHub Actions** como fonte de publicação.
3. Envie as alterações para a branch `main`. O workflow instala as dependências, executa os testes e publica o site.
4. Abra a URL informada na seção **Pages** do repositório (geralmente `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`).

Não é necessário criar `CONSULTOR_WORKER_URL` nem configurar nenhuma chave de API.

## Executar no seu computador

Requisitos: Node.js 20 ou superior.

```bash
cd web
npm ci
npm run dev
```

Acesse `http://127.0.0.1:5173`.

Para executar a bateria de testes e gerar a versão de produção:

```bash
cd web
npm test
npm run build
```

## Atualizar os dados

Os dados para visualização já acompanham o projeto. Para regenerá-los, use Python 3.11 ou superior:

```bash
pip install -r pipeline/requirements.txt
python -m pipeline.run_all
```

A atualização pode exigir downloads de fontes externas; ela não é necessária para publicar o piloto com os dados disponíveis.

## Como são feitas as estimativas?

A plataforma calcula a nota do estudante usando os pesos do curso; considera os resultados anteriores para estimar a nota de corte; e avalia diferentes situações para mostrar uma faixa de corte e uma chance aproximada. Consulte [a explicação simples](docs/METODOLOGIA.md) e [os detalhes técnicos](docs/MODELO.md).

Os dados provêm de relatórios públicos do MEC e de listas de espera publicadas pela UFV e pela UFMG. As estimativas da lista de espera fora dessas universidades são menos confiáveis.

## Estrutura

- `web/`: interface React/Vite, catálogo pré-processado e cálculos no navegador.
- `web/src/consultoria/`: interpretação de perguntas frequentes e respostas automáticas baseadas em regras.
- `pipeline/`: processamento das fontes e atualização dos resultados.
- `docs/`: dados, arquitetura, descrição simples e especificação técnica.
- `.github/workflows/pages.yml`: publicação automática no GitHub Pages.

A versão atual não envia perguntas nem perfil a serviços de IA externos.
