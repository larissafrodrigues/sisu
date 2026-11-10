"""Leitura dos relatórios brutos do MEC em tabelas com colunas padronizadas.

Os relatórios mudam de nome de coluna de um ano para o outro (TP_MODALIDADE vs
TP_MOD_CONCORRENCIA, QT_VAGAS_CONCORRENCIA vs QT_VAGAS_OFERTADAS…). Este módulo
esconde essas diferenças; nada aqui altera valores.
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook

from .sources import FONTES, RAW, Fonte

COLS_CORTES = [
    "ano", "co_ies", "no_ies", "sg_ies", "org", "cat_adm", "campus", "municipio", "uf", "regiao",
    "co_curso", "curso", "grau", "turno", "tp_mod", "tipo_conc", "ds_mod", "bonus", "vagas", "corte", "inscritos",
]

_RENOMEAR = {
    "CO_IES": "co_ies", "NO_IES": "no_ies", "SG_IES": "sg_ies",
    "DS_ORGANIZACAO_ACADEMICA": "org", "DS_CATEGORIA_ADM": "cat_adm",
    "NO_CAMPUS": "campus", "NO_MUNICIPIO_CAMPUS": "municipio", "SG_UF_CAMPUS": "uf",
    "DS_REGIAO_CAMPUS": "regiao", "DS_REGIAO": "regiao",
    "CO_IES_CURSO": "co_curso", "NO_CURSO": "curso", "DS_GRAU": "grau", "DS_TURNO": "turno",
    "TP_MOD_CONCORRENCIA": "tp_mod", "TP_MODALIDADE": "tp_mod",
    "TIPO_CONCORRENCIA": "tipo_conc", "TP_COTA": "tipo_conc",
    "DS_MOD_CONCORRENCIA": "ds_mod", "NU_PERCENTUAL_BONUS": "bonus",
    "QT_VAGAS_CONCORRENCIA": "vagas", "QT_VAGAS_OFERTADAS": "vagas",
    "NU_NOTACORTE": "corte", "QT_INSCRICAO": "inscritos",
    "PESO_REDACAO": "p_red", "PESO_LINGUAGENS": "p_lc", "PESO_MATEMATICA": "p_mt",
    "PESO_CIENCIAS_HUMANAS": "p_ch", "PESO_CIENCIAS_NATUREZA": "p_cn",
    "NOTA_MINIMA_REDACAO": "m_red", "NOTA_MINIMA_LINGUAGENS": "m_lc", "NOTA_MINIMA_MATEMATICA": "m_mt",
    "NOTA_MINIMA_CIENCIAS_HUMANAS": "m_ch", "NOTA_MINIMA_CIENCIAS_NATUREZA": "m_cn",
    "NOTA_MINIMA_CIENCIAS_NATUREZ": "m_cn", "NU_MEDIA_MINIMA_ENEM": "m_media",
    "QT_SEMESTRE": "semestres", "NU_VAGAS_AUTORIZADAS": "vagas_autorizadas",
}


def _limpa_nome_coluna(nome: object) -> str:
    """Remove caracteres de controle que aparecem em alguns cabeçalhos (ex.: 'NOTA_MI\\x8dNIMA')."""
    s = "".join(ch for ch in str(nome) if unicodedata.category(ch)[0] != "C")
    return s.strip().upper()


def _ler_xlsx(caminho: Path, aba_prefixo: tuple[str, ...]) -> pd.DataFrame:
    wb = load_workbook(caminho, read_only=True)
    try:
        aba = next(ws for ws in wb.worksheets if ws.title.lower().lstrip("0123456789-_ ").startswith(aba_prefixo))
        linhas = aba.iter_rows(values_only=True)
        cab = [_limpa_nome_coluna(c) for c in next(linhas)]
        dados = [l for l in linhas if any(v is not None for v in l)]
    finally:
        wb.close()
    return pd.DataFrame(dados, columns=cab)


def _num(serie: pd.Series) -> pd.Series:
    """Converte textos numéricos nos dois formatos encontrados ('591.04' e '591,04')."""
    s = serie.astype("string").str.strip()
    tem_virgula = s.str.contains(",", na=False)
    s = s.where(~tem_virgula, s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False))
    return pd.to_numeric(s, errors="coerce")


def _contagem(serie: pd.Series) -> pd.Series:
    """Contagens inteiras; no CSV de 2026 '1.208' significa 1208 (separador de milhar)."""
    s = serie.astype("string").str.strip()
    milhar = s.str.fullmatch(r"\d{1,3}(\.\d{3})+", na=False)
    s = s.where(~milhar, s.str.replace(".", "", regex=False))
    return _num(s)


def _codigo(serie: pd.Series) -> pd.Series:
    """Códigos e-MEC como inteiros (o CSV de 2026 traz separador de milhar: '15.402')."""
    s = serie.astype("string").str.replace(r"[.\s]", "", regex=True)
    return pd.to_numeric(s, errors="coerce").astype("Int64")


def _texto(df: pd.DataFrame, colunas: list[str]) -> None:
    for c in colunas:
        if c in df:
            df[c] = df[c].astype("string").str.replace(r"\s+", " ", regex=True).str.strip()


def ler_cortes(f: Fonte) -> pd.DataFrame:
    caminho = RAW / f.arquivo
    if caminho.suffix == ".csv":
        df = pd.read_csv(caminho, sep=";", encoding="latin1", dtype=str)
        df.columns = [_limpa_nome_coluna(c) for c in df.columns]
    else:
        df = _ler_xlsx(caminho, ("inscricao",))
    df = df.rename(columns=_RENOMEAR)
    df["ano"] = f.ano
    if "tipo_conc" not in df:
        df["tipo_conc"] = pd.NA
    df = df[COLS_CORTES].copy()
    for c in ("co_ies", "co_curso"):
        df[c] = _codigo(df[c])
    for c in ("bonus", "corte"):
        df[c] = _num(df[c])
    for c in ("vagas", "inscritos"):
        df[c] = _contagem(df[c])
    _texto(df, ["no_ies", "sg_ies", "org", "cat_adm", "campus", "municipio", "uf", "regiao",
                "curso", "grau", "turno", "tp_mod", "tipo_conc", "ds_mod"])
    return df


def ler_cortes_2010_2018(f: Fonte, primeiro_ano: int) -> pd.DataFrame:
    """Relatório consolidado 2010–2018; mantemos só a 1ª edição de cada ano."""
    wb = load_workbook(RAW / f.arquivo, read_only=True)
    try:
        linhas = wb.worksheets[0].iter_rows(values_only=True)
        for l in linhas:
            if l and str(l[0]).strip().upper().startswith("EDI") and l[1] is not None:
                break
        dados = [l[:13] for l in linhas if l and l[0] is not None]
    finally:
        wb.close()
    df = pd.DataFrame(dados, columns=["edicao", "co_ies", "no_ies", "sg_ies", "campus", "co_curso", "curso",
                                      "grau", "turno", "tp_mod", "ds_mod", "bonus", "corte"])
    ed = df["edicao"].astype(str).str.extract(r"(\d{4})/(\d)")
    df["ano"] = pd.to_numeric(ed[0])
    df = df[(ed[1] == "1") & (df["ano"] >= primeiro_ano)].copy()
    for c in ("org", "cat_adm", "municipio", "uf", "regiao", "tipo_conc"):
        df[c] = pd.NA
    df["vagas"] = pd.NA
    df["inscritos"] = pd.NA
    df = df[COLS_CORTES].copy()
    for c in ("co_ies", "co_curso"):
        df[c] = _codigo(df[c])
    for c in ("bonus", "vagas", "corte", "inscritos"):
        df[c] = _num(df[c])
    _texto(df, ["no_ies", "sg_ies", "campus", "curso", "grau", "turno", "tp_mod", "ds_mod"])
    return df


COLS_OFERTA = ["ano", "co_curso", "turno", "p_red", "p_lc", "p_mt", "p_ch", "p_cn",
               "m_red", "m_lc", "m_mt", "m_ch", "m_cn", "m_media", "semestres"]


def ler_oferta(f: Fonte) -> pd.DataFrame:
    """Termo de adesão: pesos e notas mínimas (iguais para todas as modalidades de um curso)."""
    df = _ler_xlsx(RAW / f.arquivo, ("adesao", "adesão"))
    df = df.rename(columns={re.sub(r"\s+", "", k): v for k, v in _RENOMEAR.items()}).rename(columns=_RENOMEAR)
    df["ano"] = f.ano
    df = df[COLS_OFERTA].copy()
    df["co_curso"] = _codigo(df["co_curso"])
    for c in COLS_OFERTA[3:]:
        df[c] = _num(df[c])
    _texto(df, ["turno"])
    return df.drop_duplicates(["ano", "co_curso", "turno"])


def carregar_tudo(primeiro_ano: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    cortes, oferta = [], []
    for f in FONTES:
        if f.tipo == "cortes":
            cortes.append(ler_cortes(f))
        elif f.tipo == "cortes_2010_2018":
            cortes.append(ler_cortes_2010_2018(f, primeiro_ano))
        elif f.tipo == "oferta":
            oferta.append(ler_oferta(f))
        else:
            continue
        print(f"  lido {f.arquivo}")
    return pd.concat(cortes, ignore_index=True), pd.concat(oferta, ignore_index=True)
