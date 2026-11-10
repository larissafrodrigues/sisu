"""Padronização das modalidades de concorrência ao longo das eras do SISU.

Eras:
  * 2014–2018: tipo em texto ("Ampla Concorrência", "Lei de Cotas", "Ações Afirmativas").
  * 2019–2023: tipo em texto ou letra (A, L, B, V); a cota é identificada só pela descrição.
  * 2024+    : código oficial em TIPO_CONCORRENCIA (AC, LB_PPI, LI_EP, …), já no regime da
               Lei nº 14.723/2023 (renda de até 1 salário mínimo, cota para quilombolas,
               cotistas disputam primeiro a ampla concorrência).

Para ligar as séries, as descrições antigas da Lei de Cotas são mapeadas para os códigos
de 2024+. É uma aproximação declarada: o corte de renda mudou de 1,5 para 1 salário
mínimo e as cotas "PcD + PPI" (antigas L10/L14) deixaram de existir.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata

import pandas as pd

ROTULOS = {
    "AC": "Ampla concorrência",
    "LB_EP": "Escola pública, renda até 1 SM",
    "LI_EP": "Escola pública, qualquer renda",
    "LB_PPI": "Pretos, pardos ou indígenas, escola pública, renda até 1 SM",
    "LI_PPI": "Pretos, pardos ou indígenas, escola pública, qualquer renda",
    "LB_PP": "Pretos ou pardos, escola pública, renda até 1 SM",
    "LI_PP": "Pretos ou pardos, escola pública, qualquer renda",
    "LB_I": "Indígenas, escola pública, renda até 1 SM",
    "LI_I": "Indígenas, escola pública, qualquer renda",
    "LB_Q": "Quilombolas, escola pública, renda até 1 SM",
    "LI_Q": "Quilombolas, escola pública, qualquer renda",
    "LB_PCD": "Pessoas com deficiência, escola pública, renda até 1 SM",
    "LI_PCD": "Pessoas com deficiência, escola pública, qualquer renda",
}
LEI_DE_COTAS = [k for k in ROTULOS if k != "AC"]


def sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def _norm_desc(texto: str) -> str:
    t = sem_acento(str(texto)).lower()
    t = re.sub(r"\((as|a|os|o)\)", "", t)
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _tipo(tp: str, bonus: float) -> str:
    t = sem_acento(str(tp)).lower().strip()
    if t in ("a",) or t.startswith("ampla"):
        return "A"
    if t in ("l",) or t.startswith("lei"):
        return "L"
    if t in ("b",) or "bonus" in t:
        return "B"
    if t in ("v",) or "reserva" in t:
        return "V"
    # 2014–2018: "Ações Afirmativas" cobre bônus e reservas próprias
    return "B" if (bonus or 0) > 0 else "V"


def _cota_por_descricao(desc: str) -> str:
    d = sem_acento(str(desc)).lower()
    renda = "LB" if "igual ou inferior" in d else "LI"
    pcd = "deficiencia" in d
    if "pardos ou indigenas" in d:
        grupo = "PPI"
    elif "pretos ou pardos" in d:
        grupo = "PP"
    elif "indigenas" in d:
        grupo = "I"
    elif "quilombola" in d:
        grupo = "Q"
    else:
        grupo = "EP"
    if pcd:
        # PcD "puro" tem equivalente em 2024+; PcD + raça não tem (código legado, fora do catálogo)
        return f"{renda}_PCD" if grupo == "EP" else f"{renda}_{grupo}_PCD"
    return f"{renda}_{grupo}"


def classificar(df: pd.DataFrame) -> pd.DataFrame:
    """Acrescenta `tipo` (A/L/B/V) e `mod` (código padronizado, chave da série)."""
    df = df.copy()
    bonus = df["bonus"].fillna(0)
    df["tipo"] = [_tipo(t, b) for t, b in zip(df["tp_mod"], bonus)]
    oficial = df["tipo_conc"].astype("string").str.strip()
    mods = []
    for tipo, cod, desc, b in zip(df["tipo"], oficial, df["ds_mod"], bonus):
        if tipo == "A":
            mods.append("AC")
        elif tipo == "L":
            mods.append(cod if isinstance(cod, str) and cod.startswith("L") else _cota_por_descricao(desc))
        elif tipo == "B":
            mods.append(f"B{int(round(b))}")
        else:
            h = hashlib.md5(_norm_desc(desc).encode()).hexdigest()[:8]
            mods.append(f"V:{h}")
    df["mod"] = mods
    return df
