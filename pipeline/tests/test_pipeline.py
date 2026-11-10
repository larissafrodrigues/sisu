"""Testes do pipeline. Os que dependem de dados processados são pulados se eles não existirem."""
import json

import numpy as np
import pandas as pd
import pytest

from pipeline import modelo
from pipeline.espera import grupo
from pipeline.etl import area_do_curso, chave_oferta, titulo
from pipeline.leitura import _codigo, _contagem, _num
from pipeline.modalidades import classificar
from pipeline.sources import PROCESSED, WEB_DATA


def test_numeros_nos_dois_formatos():
    s = pd.Series(["591.04", "591,04", "1.234,5", None, "x"])
    assert _num(s).tolist()[:3] == [591.04, 591.04, 1234.5]
    assert _contagem(pd.Series(["241", "1.208", "12.345"])).tolist() == [241, 1208, 12345]
    assert _codigo(pd.Series(["15.402", "1270618"])).tolist() == [15402, 1270618]


def test_modalidades_antigas_viram_codigos_atuais():
    base = "que tenham cursado integralmente o ensino médio em escolas públicas (Lei nº 12.711/2012)."
    df = pd.DataFrame({
        "tp_mod": ["Ampla concorrência", "L", "Lei nº 12.711/2012 - Lei de cotas", "L", "L", "V", "B", "L"],
        "tipo_conc": [None, None, None, None, None, None, None, "LB_Q "],
        "ds_mod": [
            "Ampla concorrência",
            "Candidatos com renda familiar bruta per capita igual ou inferior a 1,5 salário mínimo " + base,
            "Candidatos autodeclarados pretos, pardos ou indígenas que, independentemente da renda, " + base,
            "Candidatos com deficiência que, independentemente da renda, " + base,
            "Candidatos com deficiência autodeclarados pretos, pardos ou indígenas, que tenham renda familiar bruta per capita igual ou inferior a 1,5 salário mínimo e " + base,
            "Candidatos(as) Membros de Comunidades Quilombolas",
            "Bônus regional",
            "Candidatos autodeclarados quilombolas, com renda familiar…",
        ],
        "bonus": [0, 0, 0, 0, 0, 0, 10, 0],
    })
    r = classificar(df)
    assert r["mod"].tolist()[:5] == ["AC", "LB_EP", "LI_PPI", "LI_PCD", "LB_PPI_PCD"]
    assert r["mod"][5].startswith("V:") and r["mod"][6] == "B10" and r["mod"][7] == "LB_Q"
    assert r["tipo"].tolist() == ["A", "L", "L", "L", "L", "V", "B", "L"]


def test_chave_de_oferta_separa_campus_so_quando_precisa():
    df = pd.DataFrame({"ano": [2026, 2026, 2026], "co_curso": [1, 1, 2], "turno": ["EaD", "EaD", "Noturno"],
                       "campus": ["Polo A", "Polo B", "Sede"]})
    assert chave_oferta(df).tolist() == ["1|ead|polo a", "1|ead|polo b", "2|noturno"]


def test_titulo_e_area():
    assert titulo("ABI - CIÊNCIAS DA NATUREZA OU QUÍMICA") == "ABI - Ciências da Natureza ou Química"
    assert titulo("HUMANIDADES - BI/LI") == "Humanidades - BI/LI"
    assert area_do_curso("MEDICINA VETERINÁRIA") == "Agrárias e Ambientais"
    assert area_do_curso("MEDICINA") == "Saúde"
    assert area_do_curso("ENGENHARIA DE COMPUTAÇÃO") == "Computação e TI"


def test_grupos_da_lista_de_espera():
    assert [grupo(c) for c in ["AC", "LB_EP", "LI_PPI", "LB_PCD", "LI_Q", "LB_PPI_PCD"]] == ["AC", "EP", "PPI", "PCD", "Q", "PCD"]


def test_mistura_e_monotona_e_inverte():
    zq = np.quantile(np.random.default_rng(0).standard_t(4, 20000), modelo.PROBS_Z)
    cen = np.array([[5.0, 5, 5, 5], [-5.0, -5, -5, -5]])
    p, s = np.array([700.0]), np.array([10.0])
    xs = np.linspace(600, 800, 81)
    cdf = np.array([modelo.cdf_mistura(np.array([x]), p, s, cen, zq)[0] for x in xs])
    assert (np.diff(cdf) >= -1e-12).all() and cdf[0] == 0 and cdf[-1] == 1
    q = modelo.quantil_mistura(0.8, p, s, cen, zq)
    assert abs(modelo.cdf_mistura(q, p, s, cen, zq)[0] - 0.8) < 1e-3


precisa_dados = pytest.mark.skipif(not (PROCESSED / "painel.csv.gz").exists(), reason="rode o pipeline antes (python -m pipeline.run_all)")


@precisa_dados
def test_painel_sem_duplicatas_e_cortes_validos():
    painel = pd.read_csv(PROCESSED / "painel.csv.gz")
    assert not painel.duplicated(["oferta", "mod", "ano"]).any()
    c = painel["corte"].dropna()
    assert c.between(0, 1100).all()
    assert (c < 100).sum() <= 5  # o relatório oficial traz raríssimos cortes abaixo de 100; mantidos como publicados
    assert int(painel.loc[painel["ano"] == 2026, "vagas"].sum()) == 274133  # total divulgado pelo MEC


def test_modelo_bate_baselines_e_esta_calibrado():
    r = json.loads((PROCESSED / "relatorio_modelo.json").read_text(encoding="utf-8"))
    comp = {c["modelo"]: c["mae"] for c in r["backtest"]["comparacao"]}
    assert comp["Modelo (boosting)"] < min(v for k, v in comp.items() if k != "Modelo (boosting)")
    media = r["calibracao"][-1]
    assert 75 <= media["cob80"] <= 85 and 45 <= media["cob50"] <= 56 and 85 <= media["cob90"] <= 93


def test_exportacao_consistente():
    b = json.loads((WEB_DATA / "base.json").read_text(encoding="utf-8"))
    s = b["series"]
    n = len(s["of"])
    assert all(len(v) == n for v in s.values())
    for q10, q50, q90 in zip(s["q10"], s["q50"], s["q90"]):
        assert q10 is None or q10 <= q50 <= q90
    assert max(s["of"]) == len(b["ofertas"]["id"]) - 1


def test_lista_de_espera_exportada():
    """espera.json e base.json estão versionados: confere o que o site usa."""
    e = json.loads((PROCESSED / "espera.json").read_text(encoding="utf-8"))
    assert set(e["ies"]) == {"UFMG", "UFV"} and e["peso_perfil"] > 0
    for g, celulas in e["perfis"].items():
        assert len(celulas) == len(e["limites"]) + 1
        for c in celulas:
            assert len(c["quantis"]) == len(e["probs"]) and c["quantis"] == sorted(c["quantis"]) and c["quantis"][0] >= 0
    b = json.loads((WEB_DATA / "base.json").read_text(encoding="utf-8"))
    ids = set(b["ofertas"]["id"])
    assert b["espera"]["series"] and all(s["oferta"] in ids for s in b["espera"]["series"])
    for s in b["espera"]["series"]:
        for ano, regular, final, *_ in s["h"]:
            # o menor convocado pode ficar ACIMA do corte da regular quando vagas de uma cota sem candidatos
            # são remanejadas; a queda usada no cálculo é cortada em zero (pipeline/espera.py e core/espera.ts)
            assert 2022 <= ano <= 2026 and 200 <= regular <= 900 and (final is None or 200 <= final <= 900)
