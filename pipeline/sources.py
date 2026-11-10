"""Registro das fontes de dados brutos.

Todos os arquivos são relatórios públicos. A ORIGEM é sempre oficial (MEC/SISU ou
UFMG); o ESPELHO é um repositório público no GitHub que guarda uma cópia do arquivo
oficial, fixado em um commit específico para garantir reprodutibilidade.

Origem oficial dos relatórios do SISU: https://sisu.mec.gov.br/#/relatorio
(também catalogados em https://dadosabertos.mec.gov.br/sisu).
Para auditar, baixe o arquivo na origem oficial e compare com a cópia do espelho.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB_DATA = ROOT / "web" / "public" / "data"

OFICIAL_SISU = "https://sisu.mec.gov.br/#/relatorio"
OFICIAL_UFMG = "https://www.ufmg.br/sisu/repositorio/"

_SISU_DATA = (
    "https://raw.githubusercontent.com/maiakanegae/sisu-data/"
    "308fe33838aecf22634de68c52d8b05d9434bd40/data/relatorios/"
)
_SISU_2026 = (
    "https://raw.githubusercontent.com/gabrielhenriquekkj/ingressouniteste/"
    "f704e58c11fdeb3d3920e38267af8e2f3c37d2e3/doc/"
)
_UFMG = (
    "https://raw.githubusercontent.com/AndreIsraelAO/sisu-ufmg-notas-de-corte/"
    "a72d2642a4be02835e7905de620af6e7aed29427/data/"
)


@dataclass(frozen=True)
class Fonte:
    chave: str  # identificador interno
    arquivo: str  # nome do arquivo em data/raw
    tipo: str  # "cortes" | "oferta" | "cortes_2010_2018" | "ufmg_chamadas"
    ano: int | None
    titulo: str  # nome do relatório na origem
    origem: str  # página oficial onde o relatório é publicado
    espelho: str  # URL fixada de onde o pipeline baixa
    espelho_nome: str  # nome do arquivo no espelho


def _f(chave, tipo, ano, nome_espelho, titulo, base=_SISU_DATA, origem=OFICIAL_SISU, ext=None):
    ext = ext or Path(nome_espelho).suffix
    return Fonte(
        chave=chave,
        arquivo=f"{chave}{ext}",
        tipo=tipo,
        ano=ano,
        titulo=titulo,
        origem=origem,
        espelho=base + quote(nome_espelho),
        espelho_nome=nome_espelho,
    )


FONTES: list[Fonte] = [
    # --- Notas de corte da chamada regular + inscrições + vagas por modalidade ---
    _f("cortes_2010_2018", "cortes_2010_2018", None, "PORTAL_Sisu 2010 a 2018_Nota de corte.xlsx",
       "Sisu 2010 a 2018 – Nota de corte"),
    _f("cortes_2019", "cortes", 2019, "Portal Sisu_Inscrições e notas de corte_Sisu 2019-1.xlsx",
       "Sisu 2019/1 – Inscrições e notas de corte"),
    _f("cortes_2020", "cortes", 2020, "Portal Sisu_Sisu 2020-1_Inscrições e notas de corte.xlsx",
       "Sisu 2020/1 – Inscrições e notas de corte"),
    _f("cortes_2021", "cortes", 2021, "Portal Sisu_Sisu 2021-1_Inscrições e nota de corte.xlsx",
       "Sisu 2021/1 – Inscrições e notas de corte"),
    _f("cortes_2022", "cortes", 2022, "Portal Sisu_Inscrições e notas de corte_Sisu 2022-1.xlsx",
       "Sisu 2022/1 – Inscrições e notas de corte"),
    _f("cortes_2023", "cortes", 2023, "Portal Sisu_Sisu 2023-1_Inscrições e notas de corte.xlsx",
       "Sisu 2023/1 – Inscrições e notas de corte"),
    _f("cortes_2024", "cortes", 2024, "Portal Sisu_Sisu 2024_Inscrições e notas de corte.xlsx",
       "Sisu 2024 – Inscrições e notas de corte"),
    _f("cortes_2025", "cortes", 2025, "Portal Sisu_Sisu 2025_Inscrições e notas de corte.xlsx",
       "Sisu 2025 – Inscrições e notas de corte"),
    _f("cortes_2026", "cortes", 2026, "Sisu2026.csv.csv",
       "Sisu 2026 – Inscrições e notas de corte", base=_SISU_2026, ext=".csv"),
    # --- Termo de adesão: vagas, pesos e notas mínimas por curso ---
    _f("oferta_2019", "oferta", 2019, "Portal Sisu_Sisu 2019-1_Vagas ofertadas.xlsx", "Sisu 2019/1 – Vagas ofertadas"),
    _f("oferta_2020", "oferta", 2020, "Portal Sisu_Sisu 2020-1_Vagas ofertadas.xlsx", "Sisu 2020/1 – Vagas ofertadas"),
    _f("oferta_2021", "oferta", 2021, "Portal SIsu_Sisu 2021-1_Vagas ofertadas.xlsx", "Sisu 2021/1 – Vagas ofertadas"),
    _f("oferta_2022", "oferta", 2022, "Portal Sisu_Vagas ofertadas_2022_1.xlsx", "Sisu 2022/1 – Vagas ofertadas"),
    _f("oferta_2023", "oferta", 2023, "Portal Sisu_Sisu 2023-1_Vagas ofertadas.xlsx", "Sisu 2023/1 – Vagas ofertadas"),
    _f("oferta_2024", "oferta", 2024, "Portal_Sisu 2024_Vagas ofertadas.xlsx", "Sisu 2024 – Vagas ofertadas"),
    _f("oferta_2025", "oferta", 2025, "Portal_Sisu 2025_Vagas ofertadas.xlsx", "Sisu 2025 – Vagas ofertadas"),
    # --- Notas mínimas por chamada (lista de espera) – UFMG ---
    _f("ufmg_chamadas", "ufmg_chamadas", None, "notas_corte.csv",
       "SISU/UFMG – notas máximas e mínimas por chamada, 2014–2026", base=_UFMG, origem=OFICIAL_UFMG),
]

POR_CHAVE = {f.chave: f for f in FONTES}

# Última edição com resultado publicado e edição que queremos prever.
ULTIMO_ANO = max(f.ano for f in FONTES if f.tipo == "cortes")
ANO_ALVO = ULTIMO_ANO + 1
PRIMEIRO_ANO = 2014  # início das séries usadas no modelo (2ª edição após a Lei de Cotas)
