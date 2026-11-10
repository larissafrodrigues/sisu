"""Exporta os dados processados para JSON compacto consumido pela aplicação web.

Arquivos gerados em web/public/data:
  base.json          catálogo + previsões + parâmetros do modelo (carregado ao abrir o site)
  hist/<UF>.json     séries históricas por UF (carregadas sob demanda)
  descricoes.json    texto das modalidades próprias das instituições (sob demanda)
  relatorio.json     validação do modelo e manifesto das fontes (página de metodologia)

Uso: python -m pipeline.exportar
"""
from __future__ import annotations

import json
import math
import shutil
from datetime import date

import numpy as np
import pandas as pd

from .modalidades import ROTULOS
from .sources import ANO_ALVO, FONTES, PRIMEIRO_ANO, PROCESSED, RAW, ULTIMO_ANO, WEB_DATA


def _n(v, casas=2):
    """Número JSON: None para vazio; inteiros sem '.0'."""
    if v is None or (isinstance(v, float) and math.isnan(v)) or pd.isna(v):
        return None
    r = round(float(v), casas)
    return int(r) if r == int(r) else r


def _dic(valores) -> tuple[list, dict]:
    itens = sorted({v for v in valores if isinstance(v, str)})
    return itens, {v: i for i, v in enumerate(itens)}


def _grava(caminho, obj) -> int:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    caminho.write_text(txt, encoding="utf-8")
    return len(txt.encode())


def main() -> None:
    painel = pd.read_csv(PROCESSED / "painel.csv.gz")
    cat = pd.read_csv(PROCESSED / "ofertas.csv.gz").sort_values(["uf", "sg_ies", "curso_nome", "turno"]).reset_index(drop=True)
    prev = pd.read_csv(PROCESSED / "previsoes.csv.gz").set_index(["oferta", "mod"])
    relatorio = json.loads((PROCESSED / "relatorio_modelo.json").read_text(encoding="utf-8"))
    espera = json.loads((PROCESSED / "espera.json").read_text(encoding="utf-8"))
    manifesto = json.loads((RAW / "MANIFESTO.json").read_text(encoding="utf-8"))
    anos = list(range(PRIMEIRO_ANO, ULTIMO_ANO + 1))

    # ---------- dicionários ----------
    ies_tab = cat.drop_duplicates("co_ies").sort_values("sg_ies")
    cats, cat_i = _dic(cat["cat_adm"])
    orgs, org_i = _dic(cat["org"])
    ies_i = {int(c): i for i, c in enumerate(ies_tab["co_ies"])}
    ies = [[r.sg_ies, r.no_ies.title().replace(" De ", " de ").replace(" Do ", " do ").replace(" Da ", " da ")
            .replace(" E ", " e ").replace(" Dos ", " dos ").replace(" Das ", " das "), cat_i[r.cat_adm], org_i[r.org]]
           for r in ies_tab.itertuples()]
    cursos, curso_i = _dic(cat["curso_nome"])
    graus, grau_i = _dic(cat["grau"])
    turnos, turno_i = _dic(cat["turno"])
    areas, area_i = _dic(cat["area"])
    regioes, reg_i = _dic(cat["regiao"])
    ufs, uf_i = _dic(cat["uf"])
    fontes_p, fp_i = _dic(cat["pesos_fonte"])
    oferta_i = {k: i for i, k in enumerate(cat["oferta"])}

    ofertas = {
        "id": cat["oferta"].tolist(),
        "ies": [ies_i[int(c)] for c in cat["co_ies"]],
        "campus": cat["campus"].fillna("").tolist(),
        "mun": cat["municipio"].fillna("").tolist(),
        "uf": [uf_i[v] for v in cat["uf"]],
        "reg": [reg_i[v] for v in cat["regiao"]],
        "curso": [curso_i[v] for v in cat["curso_nome"]],
        "grau": [grau_i[v] for v in cat["grau"]],
        "turno": [turno_i[v] for v in cat["turno"]],
        "area": [area_i[v] for v in cat["area"]],
        "pesos": [[_n(getattr(r, c)) for c in ("p_red", "p_lc", "p_mt", "p_ch", "p_cn")] for r in cat.itertuples()],
        # mínimas de 0,01 = "nota maior que zero"; mantemos o valor oficial
        "min": [[_n(getattr(r, c)) for c in ("m_red", "m_lc", "m_mt", "m_ch", "m_cn", "m_media")] for r in cat.itertuples()],
        "pesos_ano": [_n(v) for v in cat["pesos_ano"]],
        "pesos_fonte": [fp_i[v] for v in cat["pesos_fonte"]],
        "vagas": [_n(v) for v in cat["vagas_total"]],
        "sem": [_n(v) for v in cat["semestres"]],
    }

    # ---------- séries ----------
    ult = painel[painel["ano"] == ULTIMO_ANO].copy()
    ult = ult[(ult["vagas"].fillna(0) > 0) | ult["corte"].notna()]
    ult["oi"] = ult["oferta"].map(oferta_i)
    ordem = {m: i for i, m in enumerate(ROTULOS)}
    ult["ord"] = ult["mod"].map(ordem).fillna(99)
    ult = ult.sort_values(["oi", "ord", "mod"]).reset_index(drop=True)

    mods = [[k, v, "A" if k == "AC" else "L"] for k, v in ROTULOS.items()]
    mod_i = {k: i for i, k in enumerate(ROTULOS)}
    mods.append(["V", "Ação afirmativa própria da instituição", "V"])
    mods.append(["B", "Ação afirmativa própria com bônus na nota", "B"])
    V_I, B_I = len(mods) - 2, len(mods) - 1

    descricoes, desc_i = [], {}
    larg = painel.pivot(index=["oferta", "mod"], columns="ano", values="corte").reindex(columns=anos)
    ant = larg[ULTIMO_ANO - 1]

    S = {k: [] for k in ("of", "mod", "vagas", "insc", "c", "ca", "p", "s", "q10", "q50", "q90", "n", "conf", "bonus", "desc")}
    for r in ult.itertuples():
        chave = (r.oferta, r.mod)
        if r.tipo in ("V", "B"):
            d = str(r.ds_mod).strip()
            if d not in desc_i:
                desc_i[d] = len(descricoes)
                descricoes.append(d)
            S["desc"].append(desc_i[d])
            S["mod"].append(V_I if r.tipo == "V" else B_I)
        else:
            S["desc"].append(-1)
            S["mod"].append(mod_i[r.mod])
        S["of"].append(int(r.oi))
        S["vagas"].append(_n(r.vagas))
        S["insc"].append(_n(r.inscritos))
        S["c"].append(_n(r.corte))
        S["ca"].append(_n(ant.get(chave, np.nan)))
        S["bonus"].append(_n(r.bonus) or 0)
        if chave in prev.index and pd.notna(r.corte):
            p = prev.loc[chave]
            S["p"].append(_n(p["p"], 1)); S["s"].append(_n(p["s"], 1))
            S["q10"].append(_n(p["q10"], 1)); S["q50"].append(_n(p["q50"], 1)); S["q90"].append(_n(p["q90"], 1))
            S["n"].append(int(p["n_hist"])); S["conf"].append(int(p["conf"]))
        else:
            for k in ("p", "s", "q10", "q50", "q90"):
                S[k].append(None)
            S["n"].append(0); S["conf"].append(0)

    # ---------- tendência nacional por curso (mediana da ampla concorrência) ----------
    ac = painel[(painel["mod"] == "AC") & painel["corte"].notna()].copy()
    ac["curso"] = ac["oferta"].map(cat.set_index("oferta")["curso_nome"])
    cont = ac[ac["ano"] == ULTIMO_ANO].groupby("curso").size()
    tend = ac[ac["curso"].isin(cont[cont >= 5].index)].pivot_table(index="curso", columns="ano", values="corte", aggfunc="median")
    tendencias = {str(curso_i[c]): [_n(tend.loc[c].get(a, np.nan), 1) for a in anos] for c in tend.index}

    fontes = [{"titulo": f.titulo, "tipo": f.tipo, "ano": f.ano, "origem": f.origem, "espelho": f.espelho,
               "sha256": manifesto[f.chave]["sha256"], "bytes": manifesto[f.chave]["bytes"]} for f in FONTES]

    base = {
        "versao": 1,
        "gerado_em": date.today().isoformat(),
        "ano_base": ULTIMO_ANO, "ano_alvo": ANO_ALVO, "anos": anos,
        "dic": {"ies": ies, "cursos": cursos, "graus": graus, "turnos": turnos, "areas": areas, "regioes": regioes,
                "ufs": ufs, "cat": cats, "org": orgs, "mods": mods, "pesos_fonte": fontes_p},
        "ofertas": ofertas,
        "series": S,
        "tendencias": tendencias,
        "modelo": {"cenarios": relatorio["cenarios"], "z": relatorio["z"],
                   "choques": relatorio["choques"]},
        "espera": espera,
        "contagens": {"ofertas": len(cat), "series": len(S["of"]), "ies": len(ies), "cursos": len(cursos),
                      "vagas": int(ult["vagas"].sum()), "municipios": int(cat["municipio"].nunique())},
    }

    if WEB_DATA.exists():
        shutil.rmtree(WEB_DATA)
    tam = {"base.json": _grava(WEB_DATA / "base.json", base)}
    tam["descricoes.json"] = _grava(WEB_DATA / "descricoes.json", descricoes)
    relatorio_web = {k: v for k, v in relatorio.items() if k not in ("z",)}
    relatorio_web["fontes"] = fontes
    relatorio_web["espera"] = espera
    tam["relatorio.json"] = _grava(WEB_DATA / "relatorio.json", relatorio_web)

    # ---------- históricos por UF ----------
    V = painel.pivot(index=["oferta", "mod"], columns="ano", values="vagas")
    N = painel.pivot(index=["oferta", "mod"], columns="ano", values="inscritos")
    anos_vi = [a for a in anos if a >= 2019]
    V, N = V.reindex(columns=anos_vi), N.reindex(columns=anos_vi)
    uf_da_oferta = cat["uf"].tolist()
    por_uf: dict[str, dict] = {u: {"anos": anos, "anos_vi": anos_vi, "idx": [], "h": [], "v": [], "i": []} for u in ufs}
    chaves = list(zip(ult["oferta"], ult["mod"]))
    H = larg.reindex(chaves).values
    Vv, Nv = V.reindex(chaves).values, N.reindex(chaves).values
    for idx, oi in enumerate(S["of"]):
        b = por_uf[uf_da_oferta[oi]]
        b["idx"].append(idx)
        b["h"].append([_n(x) for x in H[idx]])
        b["v"].append([_n(x) for x in Vv[idx]])
        b["i"].append([_n(x) for x in Nv[idx]])
    total_hist = 0
    for u, b in por_uf.items():
        total_hist += _grava(WEB_DATA / "hist" / f"{u}.json", b)
    tam["hist/*.json"] = total_hist

    print(f"Exportado para {WEB_DATA}:")
    for k, v in tam.items():
        print(f"  {k:18s} {v / 1e6:6.2f} MB")
    print(f"  {base['contagens']}")


if __name__ == "__main__":
    main()
