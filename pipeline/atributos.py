"""Atributos (features) do modelo de nota de corte.

Cada exemplo é uma transição: "o que se sabia da série até o ano t" -> "nota de corte em t+1".
Só entram informações disponíveis ANTES das inscrições de t+1 (nada do futuro).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .sources import PROCESSED

ATRIBUTOS = [
    "c0",          # última nota de corte (ano t)
    "d1", "d2",    # variação em relação a t-1 e t-2
    "m3",          # média das últimas 3 notas menos c0 (reversão à média)
    "dp",          # desvio-padrão do histórico
    "n_hist",      # nº de edições com nota de corte até t
    "lacuna",      # anos desde a observação anterior (1 = série contínua)
    "lvagas", "linscr", "lconc",  # log de vagas, inscritos e inscritos/vaga em t
    "dvagas",      # variação do log de vagas entre t-1 e t
    "gap_ac",      # c0 menos o corte da ampla concorrência da mesma oferta em t
    "d1_ac",       # variação recente da ampla concorrência da mesma oferta
    "desv_curso",  # c0 menos a mediana nacional do mesmo curso/modalidade em t
    "d1_curso",    # variação mediana nacional do curso entre t-1 e t
    "tipo_cod", "renda", "ppi", "pcd", "quil",
    "grau_cod", "turno_cod", "regiao_cod", "estadual",
]


def carregar() -> tuple[pd.DataFrame, pd.DataFrame]:
    painel = pd.read_csv(PROCESSED / "painel.csv.gz")
    cat = pd.read_csv(PROCESSED / "ofertas.csv.gz")
    return painel, cat


def _largo(painel: pd.DataFrame, valor: str) -> pd.DataFrame:
    return painel.pivot(index=["oferta", "mod"], columns="ano", values=valor)


def montar(painel: pd.DataFrame, cat: pd.DataFrame, anos_t: list[int]) -> pd.DataFrame:
    """Uma linha por (série, ano t) com atributos em t e alvo `y` = corte em t+1 (NaN se desconhecido)."""
    C = _largo(painel, "corte")
    V = _largo(painel, "vagas")
    N = _largo(painel, "inscritos")
    anos = sorted(C.columns)
    meta = painel.drop_duplicates(["oferta", "mod"]).set_index(["oferta", "mod"])[["tipo"]]
    info = cat.set_index("oferta")[["curso", "grau", "turno", "regiao", "cat_adm"]]

    # nome do curso por oferta ao longo do tempo: usa o catálogo atual; séries extintas ficam sem grupo
    curso = C.index.get_level_values("oferta").map(info["curso"])
    mod_idx = C.index.get_level_values("mod")
    blocos = []
    for t in anos_t:
        if t not in C.columns:
            continue
        c0 = C[t]
        tem = c0.notna()
        if not tem.any():
            continue
        ant = [a for a in anos if a < t]
        hist = C[ant + [t]]
        # última observação anterior a t (não exige série contínua)
        prev = C[ant].ffill(axis=1).iloc[:, -1] if ant else pd.Series(np.nan, index=C.index)
        prev2 = C[ant[:-1]].ffill(axis=1).iloc[:, -1] if len(ant) > 1 else pd.Series(np.nan, index=C.index)
        ult_ano = C[ant].notna().mul(ant, axis=1).max(axis=1).replace(0, np.nan) if ant else pd.Series(np.nan, index=C.index)
        f = pd.DataFrame(index=C.index)
        f["ano_t"] = t
        f["c0"] = c0
        f["d1"] = c0 - (C[t - 1] if (t - 1) in C.columns else np.nan)
        f["d2"] = c0 - (C[t - 2] if (t - 2) in C.columns else np.nan)
        f["m3"] = hist.iloc[:, -3:].mean(axis=1) - c0
        f["dp"] = hist.std(axis=1)
        f["n_hist"] = hist.notna().sum(axis=1)
        f["lacuna"] = t - ult_ano
        f["prev"] = prev
        f["prev2"] = prev2
        v = V[t] if t in V.columns else pd.Series(np.nan, index=C.index)
        n = N[t] if t in N.columns else pd.Series(np.nan, index=C.index)
        f["lvagas"] = np.log1p(v)
        f["linscr"] = np.log1p(n)
        f["lconc"] = np.log1p(n / v.where(v > 0))
        f["dvagas"] = np.log1p(v) - (np.log1p(V[t - 1]) if (t - 1) in V.columns else np.nan)
        ac = c0.xs("AC", level="mod") if "AC" in mod_idx else pd.Series(dtype=float)
        ac_ant = C[t - 1].xs("AC", level="mod") if (t - 1) in C.columns else pd.Series(dtype=float)
        of = C.index.get_level_values("oferta")
        f["gap_ac"] = c0.values - of.map(ac).values
        f["d1_ac"] = of.map(ac).values - of.map(ac_ant).values
        grp = pd.DataFrame({"curso": curso, "mod": mod_idx, "c0": c0.values, "d1": f["d1"].values})
        g = grp.groupby(["curso", "mod"])
        f["desv_curso"] = c0.values - g["c0"].transform("median").values
        f["d1_curso"] = g["d1"].transform("median").values
        f["y"] = C[t + 1] if (t + 1) in C.columns else np.nan
        blocos.append(f[tem])
    X = pd.concat(blocos).reset_index()

    tipo = X.set_index(["oferta", "mod"]).index.map(meta["tipo"])
    X["tipo"] = tipo
    X["tipo_cod"] = pd.Series(tipo).map({"A": 0, "L": 1, "V": 2, "B": 3}).values
    m = X["mod"]
    X["renda"] = m.str.startswith("LB").astype(int)
    X["ppi"] = m.str.contains(r"_PPI|_PP|_I$").astype(int)
    X["pcd"] = m.str.contains("PCD").astype(int)
    X["quil"] = m.str.endswith("_Q").astype(int)
    inf = info.reindex(X["oferta"].values)
    X["grau_cod"] = pd.Categorical(inf["grau"].values, categories=sorted(cat["grau"].dropna().unique())).codes
    X["turno_cod"] = pd.Categorical(inf["turno"].values, categories=sorted(cat["turno"].dropna().unique())).codes
    X["regiao_cod"] = pd.Categorical(inf["regiao"].values, categories=sorted(cat["regiao"].dropna().unique())).codes
    X["estadual"] = (inf["cat_adm"].values != "Pública Federal").astype(int)
    for c in ("grau_cod", "turno_cod", "regiao_cod"):
        X[c] = X[c].where(X[c] >= 0, np.nan)
    X["alvo"] = X["y"] - X["c0"]  # o modelo prevê a VARIAÇÃO da nota de corte
    return X
