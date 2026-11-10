"""Lista de espera da UFV: lê as páginas oficiais e gera data/fontes/ufv_espera.csv.

A UFV publica, em cada edição do SISU, duas páginas que interessam aqui
(https://www2.pse.ufv.br, "Processos Seletivos Anteriores"):

  * "Primeira Chamada": os classificados na chamada regular, com pontos e modalidade;
  * "Lista de Espera" (versão final): cada candidato da lista, seus pontos e a situação
    ("Convocado na Nª chamada pela modalidade X" ou "Espera").

Daí saem, para cada curso e modalidade:

  corte_regular      menor pontuação entre os classificados na 1ª chamada
  corte_final        menor pontuação entre os convocados da lista de espera (2ª chamada em diante)
  convocados_espera  quantos foram convocados da lista de espera por aquela modalidade
  tamanho_lista      quantos candidatos estavam na lista daquela modalidade
  lista_esgotada     1 se todos os candidatos daquela lista acabaram convocados

Nenhum nome ou número de inscrição é gravado: só os agregados acima.

As páginas mudaram de formato em 2024 (uma tabela por curso, com uma coluna por modalidade,
em vez de uma tabela por modalidade); este módulo lê os dois.

Uso:
  python -m pipeline.ufv             baixa as páginas e regrava data/fontes/ufv_espera.csv
  python -m pipeline.ufv --conferir  baixa as páginas e só compara com o arquivo existente
"""
from __future__ import annotations

import csv
import json
import math
import re
import sys
import urllib.request
from html.parser import HTMLParser

from .sources import ROOT

FONTES_DIR = ROOT / "data" / "fontes"
CSV_UFV = FONTES_DIR / "ufv_espera.csv"
RESUMO_UFV = FONTES_DIR / "ufv_espera_resumo.json"

BASE_URL = "https://www2.pse.ufv.br/wp-content/uploads/"
INDICE_URL = "https://www2.pse.ufv.br/?resultados_psa_sisu={ano}"

#: ano -> (página da 1ª chamada, página final da lista de espera)
PAGINAS: dict[int, tuple[str, str]] = {
    2022: ("2022/02/sisu2022-chamada-1.htm", "2022/05/sisu2022-espera-7.htm"),
    2023: ("2023/02/sisu2023-chamada-1.htm", "2023/04/sisu2023-espera-5.htm"),
    2024: ("2024/02/sisu2024-chamada-1.htm", "2024/05/sisu2024-espera-11.htm"),
    2025: ("2025/01/sisu2025-chamada-1.htm", "2025/03/sisu2025-espera-14.htm"),
    2026: ("2026/01/sisu2026-chamada-1.htm", "2026/03/sisu2026-espera-5.htm"),
}

#: Modalidades gravadas. As antigas "PcD + PPI" (extintas em 2024) ficam de fora.
MODALIDADES = ["AC", "LI_EP", "LI_PPI", "LI_PCD", "LI_Q", "LB_EP", "LB_PPI", "LB_PCD", "LB_Q"]
COLUNAS = ["ano", "campus", "curso", "modalidade", "corte_regular", "corte_final",
           "convocados_espera", "tamanho_lista", "lista_esgotada"]

_RE_CODIGO = re.compile(r"^[A-Z]{2}(_[A-Z]+)?$")
_RE_SITUACAO = re.compile(r"Convocado na (\d+)ª chamada pela modalidade (\S+)", re.I)
_RE_MODALIDADE = re.compile(r"^Modalidade\s+(\S+)")


def codigo_modalidade(chave: str, descricao: str) -> str:
    """Código atual (AC, LB_PPI…) a partir da legenda da página.

    Até 2024 as páginas numeravam as modalidades de 1 a 9; a descrição diz qual é qual.
    """
    if _RE_CODIGO.match(chave):
        return chave
    t = descricao.lower()
    if "ampla" in t:
        return "AC"
    renda = "LB" if "igual ou inferior" in t else "LI"
    if "quilombola" in t:
        return f"{renda}_Q"
    pcd, ppi = "defici" in t, "pretos" in t
    return f"{renda}_{'PPIPCD' if pcd and ppi else 'PCD' if pcd else 'PPI' if ppi else 'EP'}"


def numero(txt: str) -> float | None:
    """'1.234,56' -> 1234.56; texto que não é número -> None."""
    try:
        return float(txt.strip().replace(".", "").replace(",", "."))
    except ValueError:
        return None


def arredonda1(v: float) -> float:
    """Uma casa decimal, com meio para cima (mesma conta da extração original)."""
    return math.floor(v * 10 + 0.5) / 10


class _Leitor(HTMLParser):
    """Transforma a página em uma sequência de eventos: ('h2', texto), ('h3', texto), ('tabela', linhas)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.eventos: list[tuple] = []
        self._ignorar = 0        # profundidade dentro da tabela de índice
        self._titulo: str | None = None
        self._texto: list[str] = []
        self._linhas: list[list[str]] | None = None
        self._linha: list[str] | None = None
        self._celula: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if self._ignorar:
            if tag == "table":
                self._ignorar += 1
            return
        if tag == "table":
            if "indice" in (dict(attrs).get("class") or ""):
                self._ignorar = 1
            else:
                self._linhas = []
        elif tag in ("h2", "h3"):
            self._titulo, self._texto = tag, []
        elif tag == "tr" and self._linhas is not None:
            self._linha = []
        elif tag in ("td", "th") and self._linha is not None:
            self._celula = []

    def handle_endtag(self, tag):
        if self._ignorar:
            if tag == "table":
                self._ignorar -= 1
            return
        if tag in ("h2", "h3") and self._titulo == tag:
            self.eventos.append((tag, " ".join("".join(self._texto).split())))
            self._titulo = None
        elif tag in ("td", "th") and self._celula is not None and self._linha is not None:
            self._linha.append(" ".join("".join(self._celula).split()))
            self._celula = None
        elif tag == "tr" and self._linha is not None and self._linhas is not None:
            self._linhas.append(self._linha)
            self._linha = None
        elif tag == "table" and self._linhas is not None:
            self.eventos.append(("tabela", self._linhas))
            self._linhas = None

    def handle_data(self, data):
        if self._ignorar:
            return
        if self._celula is not None:
            self._celula.append(data)
        elif self._titulo is not None:
            self._texto.append(data)


def nome_curso(nome: str) -> str:
    """Em alguns anos o mesmo curso aparece com e sem o sufixo ' - BACHARELADO'."""
    return re.sub(r" - BACHARELADO$", "", nome)


def ler_pagina(html: str) -> tuple[dict[str, str], list[tuple[str, str, list[list[list[str]]]]]]:
    """Devolve (legenda das modalidades, [(campus, curso, tabelas)])."""
    leitor = _Leitor()
    leitor.feed(html)
    legenda: dict[str, str] = {}
    secoes: list[tuple[str, str, list]] = []
    campus, atual = "", None
    primeira = True
    for ev in leitor.eventos:
        if ev[0] == "tabela" and primeira:
            primeira = False
            for linha in ev[1]:
                if len(linha) == 2 and linha[0] not in ("Código", ""):
                    legenda[linha[0]] = codigo_modalidade(linha[0], linha[1])
        elif ev[0] == "h2":
            campus = ev[1].replace("CAMPUS ", "")
        elif ev[0] == "h3":
            atual = (campus, nome_curso(ev[1]), [])
            secoes.append(atual)
        elif ev[0] == "tabela" and atual is not None:
            atual[2].append(ev[1])
    return legenda, secoes


def resumo_chamada(html: str) -> dict[tuple[str, str], dict[str, dict]]:
    """Classificados de uma chamada: por curso e modalidade, quantos e a menor pontuação."""
    legenda, secoes = ler_pagina(html)
    saida: dict[tuple[str, str], dict[str, dict]] = {}
    for campus, curso, tabelas in secoes:
        mods: dict[str, dict] = {}
        for linhas in tabelas:
            i_pontos = None
            for c in linhas:
                if "Pontos" in c:
                    i_pontos = c.index("Pontos")
                    continue
                if i_pontos is None or len(c) <= i_pontos:
                    continue
                pontos = numero(c[i_pontos])
                if pontos is None:
                    continue
                mod = legenda.get(c[-1], c[-1])  # última coluna: modalidade pela qual foi convocado
                a = mods.setdefault(mod, {"n": 0, "min": math.inf})
                a["n"] += 1
                a["min"] = min(a["min"], pontos)
        saida[(campus, curso)] = mods
    return saida


def resumo_espera(html: str) -> tuple[dict[tuple[str, str], dict[str, dict]], int]:
    """Lista de espera final: por curso e modalidade, tamanho da lista, convocados e menor pontuação convocada.

    Devolve também o número da última chamada registrada na página.
    """
    legenda, secoes = ler_pagina(html)
    saida: dict[tuple[str, str], dict[str, dict]] = {}
    ultima = 0
    for campus, curso, tabelas in secoes:
        candidatos: dict[str, dict] = {}
        for linhas in tabelas:
            cab: list[str] | None = None
            mod_tabela: str | None = None  # formato antigo: uma tabela por modalidade
            for c in linhas:
                if len(c) == 1:
                    m = _RE_MODALIDADE.match(c[0])
                    if m:
                        mod_tabela = legenda.get(m.group(1), m.group(1))
                    continue
                if "Pontos" in c:
                    cab = c
                    continue
                if cab is None or len(c) < len(cab):
                    continue
                i_insc, i_pontos, i_sit = cab.index("Inscrição"), cab.index("Pontos"), len(cab) - 1
                pontos = numero(c[i_pontos])
                if pontos is None:
                    continue
                cand = candidatos.setdefault(c[i_insc], {"pontos": pontos, "listas": set(), "chamada": 0, "via": None})
                if mod_tabela:
                    cand["listas"].add(mod_tabela)
                else:  # formato novo: uma coluna de posição por modalidade
                    for k in range(i_pontos + 1, i_sit):
                        if c[k] != "":
                            cand["listas"].add(legenda.get(cab[k], cab[k]))
                m = _RE_SITUACAO.search(c[i_sit])
                if m:
                    cand["chamada"] = int(m.group(1))
                    cand["via"] = legenda.get(m.group(2), m.group(2))
                    ultima = max(ultima, cand["chamada"])
        mods: dict[str, dict] = {}

        def acum(mod: str) -> dict:
            return mods.setdefault(mod, {"lista": 0, "convocados": 0, "min": math.inf, "restantes": 0})

        for cand in candidatos.values():
            for mod in cand["listas"]:
                a = acum(mod)
                a["lista"] += 1
                if not cand["chamada"]:
                    a["restantes"] += 1
            if cand["chamada"]:
                a = acum(cand["via"])
                a["convocados"] += 1
                a["min"] = min(a["min"], cand["pontos"])
        saida[(campus, curso)] = mods
    return saida, ultima


def montar(ano: int, html_chamada: str, html_espera: str) -> tuple[list[dict], dict]:
    """Linhas do CSV e resumo de uma edição."""
    regular = resumo_chamada(html_chamada)
    espera, ultima = resumo_espera(html_espera)
    linhas = []
    for chave in sorted(set(regular) | set(espera)):
        for mod in MODALIDADES:
            r, e = regular.get(chave, {}).get(mod), espera.get(chave, {}).get(mod)
            if not r and not e:
                continue
            convocados = e["convocados"] if e else 0
            lista = e["lista"] if e else 0
            linhas.append({
                "ano": ano, "campus": chave[0], "curso": chave[1], "modalidade": mod,
                "corte_regular": arredonda1(r["min"]) if r else "",
                "corte_final": arredonda1(e["min"]) if convocados else "",
                "convocados_espera": convocados,
                "tamanho_lista": lista,
                "lista_esgotada": int(bool(e) and lista > 0 and e["restantes"] == 0),
            })
    resumo = {
        "chamadas": ultima,
        "convocados_regular": sum(m["n"] for mods in regular.values() for m in mods.values()),
        "convocados_espera": sum(m["convocados"] for mods in espera.values() for m in mods.values()),
        "paginas": [BASE_URL + p for p in PAGINAS[ano]],
    }
    return linhas, resumo


def _texto_csv(linhas: list[dict]) -> str:
    import io
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLUNAS, lineterminator="\n")
    w.writeheader()

    def fmt(v):
        return f"{v:g}" if isinstance(v, float) else v

    for linha in linhas:
        w.writerow({k: fmt(v) for k, v in linha.items()})
    return buf.getvalue()


def baixar(caminho: str) -> str:
    req = urllib.request.Request(BASE_URL + caminho, headers={"User-Agent": "bussola-sisu (dados públicos; pesquisa)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8", errors="replace")


def main(argv: list[str] | None = None) -> int:
    conferir = "--conferir" in (argv if argv is not None else sys.argv[1:])
    linhas: list[dict] = []
    resumo: dict[str, dict] = {}
    for ano, (p_chamada, p_espera) in PAGINAS.items():
        print(f"SISU/UFV {ano}: baixando {p_chamada} e {p_espera}…")
        l, r = montar(ano, baixar(p_chamada), baixar(p_espera))
        linhas += l
        resumo[str(ano)] = r
        print(f"  {len(l)} linhas; {r['chamadas']} chamadas; {r['convocados_regular']} convocados na chamada regular, "
              f"{r['convocados_espera']} na lista de espera")
    texto = _texto_csv(linhas)
    if conferir:
        atual = CSV_UFV.read_text(encoding="utf-8") if CSV_UFV.exists() else ""
        if texto == atual:
            print(f"OK: {CSV_UFV.name} confere com as páginas oficiais ({len(linhas)} linhas).")
            return 0
        a, b = atual.splitlines(), texto.splitlines()
        dif = [(x, y) for x, y in zip(a, b) if x != y]
        print(f"DIFERENTE: {len(dif)} linhas mudaram; {len(a)} linhas no arquivo, {len(b)} nas páginas.")
        for x, y in dif[:10]:
            print(f"  arquivo: {x}\n  páginas: {y}")
        return 1
    FONTES_DIR.mkdir(parents=True, exist_ok=True)
    CSV_UFV.write_text(texto, encoding="utf-8")
    RESUMO_UFV.write_text(json.dumps(resumo, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Gravado {CSV_UFV} ({len(linhas)} linhas) e {RESUMO_UFV.name}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
