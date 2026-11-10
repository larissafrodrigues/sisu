"""Evidência sobre a lista de espera: quanto a nota mínima cai depois da chamada regular.

O MEC só publica a nota de corte da chamada regular. A única série pública que encontramos
com a nota mínima de CADA chamada é a da UFMG (PDFs oficiais de "notas máximas e mínimas",
transcritos em https://github.com/AndreIsraelAO/sisu-ufmg-notas-de-corte). Para 2022–2026 ela
traz todas as chamadas, o que permite medir:

    queda = nota mínima da chamada regular − nota mínima da última chamada

A distribuição dessa queda, por grupo de modalidade, é usada pela plataforma como evidência
de quanto a lista de espera costuma "andar". É uma universidade só: serve como referência,
não como previsão para outras instituições — e a interface diz isso.

Uso: python -m pipeline.espera
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from .sources import POR_CHAVE, PROCESSED, RAW

PROBS = [round(p, 2) for p in np.linspace(0.05, 0.95, 19)]
ANOS = (2022, 2026)  # edições com todas as chamadas publicadas


def grupo(cota: str) -> str:
    if cota == "AC":
        return "AC"
    if "PCD" in cota:
        return "PCD"
    if cota.endswith("_Q"):
        return "Q"
    if "PPI" in cota or cota.endswith(("_PP", "_I")):
        return "PPI"
    return "EP"


def calcular() -> dict:
    d = pd.read_csv(RAW / POR_CHAVE["ufmg_chamadas"].arquivo)
    d = d[(d["edicao"] == 1) & d["ano"].between(*ANOS)]
    chave = ["ano", "curso_id", "campus", "turno", "cota_padrao"]
    regular = d[d["chamada"] == 0].groupby(chave)["nota_min"].min().rename("regular")
    final = d[d["is_final"]].groupby(chave)["nota_min"].min().rename("final")
    chamadas = d.groupby(chave)["chamada"].max().rename("chamadas")
    j = pd.concat([regular, final, chamadas], axis=1).dropna().reset_index()
    j["queda"] = (j["regular"] - j["final"]).clip(lower=0)
    j["grupo"] = j["cota_padrao"].map(grupo)

    grupos = {}
    for g, sub in j.groupby("grupo"):
        grupos[g] = {
            "n": int(len(sub)),
            "sem_queda": round(float((sub["queda"] == 0).mean()), 3),
            "mediana": round(float(sub["queda"].median()), 1),
            "quantis": [round(float(q), 1) for q in np.quantile(sub["queda"], PROBS)],
        }
    return {
        "fonte": "SISU/UFMG – notas mínimas por chamada (PDFs oficiais), edições 2022 a 2026",
        "origem": POR_CHAVE["ufmg_chamadas"].origem,
        "anos": list(ANOS),
        "probs": PROBS,
        "chamadas_mediana": int(j["chamadas"].median()),
        "n": int(len(j)),
        "grupos": grupos,
    }


def main() -> None:
    r = calcular()
    (PROCESSED / "espera.json").write_text(json.dumps(r, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Lista de espera (UFMG {ANOS[0]}–{ANOS[1]}, {r['n']} séries, mediana de {r['chamadas_mediana']} chamadas):")
    for g, v in r["grupos"].items():
        print(f"  {g:4s} n={v['n']:5d}  sem queda {v['sem_queda']:.0%}  mediana {v['mediana']:5.1f}  "
              f"P25 {v['quantis'][4]:5.1f}  P75 {v['quantis'][14]:5.1f}")


if __name__ == "__main__":
    main()
