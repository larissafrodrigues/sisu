"""Leitor das páginas de lista de espera da UFV (pipeline/ufv.py).

As amostras em fixtures/ reproduzem a marcação das páginas oficiais nos dois formatos
(até 2023: uma tabela por modalidade, numeradas de 1 a 9; de 2024 em diante: uma tabela
por curso, com uma coluna por modalidade). Os nomes são fictícios.
"""
from pathlib import Path

import pandas as pd
import pytest

from pipeline import ufv

FIX = Path(__file__).parent / "fixtures"


def ler(nome: str) -> str:
    return (FIX / nome).read_text(encoding="utf-8")


def por_chave(linhas):
    return {(l["curso"], l["modalidade"]): l for l in linhas}


def test_codigo_modalidade_pela_descricao():
    assert ufv.codigo_modalidade("AC", "") == "AC"
    assert ufv.codigo_modalidade("9", "Ampla Concorrência") == "AC"
    assert ufv.codigo_modalidade("1", "autodeclarados pretos, pardos ou indígenas, com renda igual ou inferior a 1,5 salário") == "LB_PPI"
    assert ufv.codigo_modalidade("7", "Candidatos que, independentemente da renda, tenham cursado") == "LI_EP"
    assert ufv.codigo_modalidade("8", "Candidatos com deficiência que, independentemente da renda") == "LI_PCD"
    assert ufv.codigo_modalidade("2", "com deficiência autodeclarados pretos, pardos, renda igual ou inferior") == "LB_PPIPCD"
    assert ufv.codigo_modalidade("6", "autodeclarados quilombolas, independentemente da renda") == "LI_Q"


def test_numero_e_arredondamento():
    assert ufv.numero("1.000,00") == 1000.0
    assert ufv.numero("427,14") == 427.14
    assert ufv.numero("Espera") is None
    assert ufv.arredonda1(427.14) == 427.1
    assert ufv.arredonda1(669.35) in (669.3, 669.4)  # meio para cima, sujeito ao ponto flutuante


def test_formato_antigo():
    linhas, resumo = ufv.montar(2022, ler("ufv_2022_chamada.htm"), ler("ufv_2022_espera.htm"))
    t = por_chave(linhas)
    # a tabela de índice é ignorada e o campus vem do <h2>
    assert {l["campus"] for l in linhas} == {"FLORESTAL", "VICOSA"}

    fis = t[("LICENCIATURA EM FISICA - FL", "AC")]
    assert fis["corte_regular"] == 586.1          # menor entre 586,16 e 586,08
    assert fis["corte_final"] == 427.1            # o candidato 8860 aparece em duas listas e conta uma vez
    assert fis["convocados_espera"] == 2 and fis["tamanho_lista"] == 2 and fis["lista_esgotada"] == 1
    ep = t[("LICENCIATURA EM FISICA - FL", "LI_EP")]
    assert ep["corte_regular"] == 567.1 and ep["corte_final"] == ""  # foi convocado pela ampla, não pela cota
    assert ep["convocados_espera"] == 0 and ep["tamanho_lista"] == 1 and ep["lista_esgotada"] == 1
    assert t[("LICENCIATURA EM FISICA - FL", "LB_PPI")]["corte_regular"] == 1000.0  # separador de milhar

    # "EDUCACAO FISICA - BACHARELADO" e "EDUCACAO FISICA" são o mesmo curso
    ac = t[("EDUCACAO FISICA", "AC")]
    assert ac["corte_regular"] == 601.5           # vale a modalidade pela qual foi convocado (9), não a inscrita (5)
    assert ac["corte_final"] == 630.0 and ac["convocados_espera"] == 2
    assert ac["tamanho_lista"] == 4 and ac["lista_esgotada"] == 0
    ppi = t[("EDUCACAO FISICA", "LI_PPI")]
    assert ppi["corte_regular"] == "" and ppi["corte_final"] == 580.4 and ppi["tamanho_lista"] == 2
    # modalidades "PcD + PPI" não são gravadas, mas entram no total de convocados
    assert not any("PPIPCD" in l["modalidade"] for l in linhas)
    assert resumo == {"chamadas": 5, "convocados_regular": 6, "convocados_espera": 6,
                      "paginas": [ufv.BASE_URL + p for p in ufv.PAGINAS[2022]]}


def test_formato_novo():
    linhas, resumo = ufv.montar(2026, ler("ufv_2026_chamada.htm"), ler("ufv_2026_espera.htm"))
    t = por_chave(linhas)
    fis = t[("LICENCIATURA EM FISICA - FL", "AC")]
    assert fis["corte_regular"] == 606.3 and fis["corte_final"] == 549.5
    assert fis["convocados_espera"] == 2 and fis["tamanho_lista"] == 3 and fis["lista_esgotada"] == 1
    ppi = t[("LICENCIATURA EM FISICA - FL", "LI_PPI")]
    assert ppi["corte_regular"] == 540.2 and ppi["corte_final"] == 443.6 and ppi["convocados_espera"] == 1

    ac = t[("EDUCACAO FISICA", "AC")]
    assert ac["corte_regular"] == 669.3 and ac["corte_final"] == 668.0
    assert ac["tamanho_lista"] == 4 and ac["lista_esgotada"] == 0      # "Espera" e "ESPERA" contam como não convocados
    ep = t[("EDUCACAO FISICA", "LI_EP")]
    assert ep["corte_regular"] == 656.5 and ep["corte_final"] == 645.8 and ep["tamanho_lista"] == 2
    assert t[("EDUCACAO FISICA", "LI_PPI")]["convocados_espera"] == 0
    assert resumo["chamadas"] == 12 and resumo["convocados_regular"] == 7 and resumo["convocados_espera"] == 5


def test_csv_gerado_e_estavel():
    linhas, _ = ufv.montar(2026, ler("ufv_2026_chamada.htm"), ler("ufv_2026_espera.htm"))
    texto = ufv._texto_csv(linhas)
    assert texto.splitlines()[0] == ",".join(ufv.COLUNAS)
    assert "2026,FLORESTAL,LICENCIATURA EM FISICA - FL,AC,606.3,549.5,2,3,1" in texto.splitlines()


@pytest.mark.skipif(not ufv.CSV_UFV.exists(), reason="dados da UFV não gerados")
def test_arquivo_versionado_e_coerente():
    d = pd.read_csv(ufv.CSV_UFV)
    assert list(d.columns) == ufv.COLUNAS
    assert sorted(d["ano"].unique()) == sorted(ufv.PAGINAS)
    assert set(d["modalidade"]) <= set(ufv.MODALIDADES)
    assert not d.duplicated(["ano", "campus", "curso", "modalidade"]).any()
    com = d[d["convocados_espera"] > 0]
    assert com["corte_final"].notna().all() and d[d["convocados_espera"] == 0]["corte_final"].isna().all()
    assert d["corte_regular"].dropna().between(200, 900).all() and com["corte_final"].between(200, 900).all()
    # quem zerou a lista tinha lista; e o arquivo regravado pelo próprio módulo é idêntico
    assert (d[d["lista_esgotada"] == 1]["tamanho_lista"] > 0).all()
    linhas = d.astype(object).where(d.notna(), "").to_dict("records")
    for l in linhas:
        for k in ("corte_regular", "corte_final"):
            l[k] = float(l[k]) if l[k] != "" else ""
    assert ufv._texto_csv(linhas) == ufv.CSV_UFV.read_text(encoding="utf-8")
