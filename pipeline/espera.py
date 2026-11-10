"""Evidência sobre a lista de espera: quanto a nota mínima cai depois da chamada regular.

O MEC só publica a nota de corte da chamada regular. O que acontece depois é publicado,
de forma sistemática, por poucas instituições. Usamos duas:

  * UFMG — "notas máximas e mínimas" de cada chamada (PDFs oficiais, transcritos em
    https://github.com/AndreIsraelAO/sisu-ufmg-notas-de-corte);
  * UFV  — lista de espera final de cada edição, com a situação de cada candidato
    (páginas oficiais, resumidas por pipeline/ufv.py em data/fontes/ufv_espera.csv).

Para cada curso, modalidade e edição (2022–2026) medimos

    queda = nota de corte da chamada regular − menor nota convocada na lista de espera

(zero quando ninguém foi convocado). Com isso o módulo produz três coisas:

  1. HISTÓRICO PRÓPRIO: as quedas de cada curso/modalidade da UFV e da UFMG, ligadas às
     ofertas do catálogo. É a melhor evidência disponível para essas duas instituições.
  2. PERFIS: a distribuição da queda por grupo de modalidade e faixa de nota de corte,
     juntando as duas universidades. É a referência para as demais instituições (e para
     cursos novos), e também "puxa" o histórico próprio, que tem só cinco anos.
  3. VALIDAÇÃO: o quanto os perfis de uma universidade acertam a outra, e o quanto a
     combinação histórico + perfil acerta um ano deixado de fora.

Quando a lista de um curso zerou (todos os candidatos acabaram convocados), a queda
observada é só um piso: quem tivesse nota ainda menor provavelmente também seria chamado.
Mantemos o valor observado — a estimativa fica conservadora — e guardamos a marcação.

Uso: python -m pipeline.espera
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from .sources import POR_CHAVE, PROCESSED, RAW
from .ufv import CSV_UFV, INDICE_URL, RESUMO_UFV

PROBS = [round(p, 2) for p in np.linspace(0.05, 0.95, 19)]
ANOS = (2022, 2026)                 # edições com todas as chamadas publicadas nas duas fontes
GRUPOS = ["AC", "EP", "PPI", "PCD", "Q"]
NOME_GRUPO = {"AC": "Ampla concorrência", "EP": "Escola pública", "PPI": "Pretos, pardos e indígenas",
              "PCD": "Pessoas com deficiência", "Q": "Quilombolas"}
LIMITES = [550.0, 600.0, 650.0, 700.0, 750.0]   # faixas da nota de corte da chamada regular
ROTULO_FAIXA = ["até 550", "de 550 a 600", "de 600 a 650", "de 650 a 700", "de 700 a 750", "acima de 750"]
MIN_CELULA = 30       # observações mínimas para um perfil (grupo × faixa) valer sozinho
PESO_PERFIL = 4.0     # o perfil entra como se fossem 4 anos a mais de histórico (escolhido em `validar`)
MIN_IGUAIS = 5        # notas de corte coincidentes para ligar um curso a uma oferta do catálogo


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


def faixa(corte) -> np.ndarray:
    """Índice da faixa de nota de corte (0 = até 550 … 5 = acima de 750)."""
    return np.searchsorted(LIMITES, corte, side="right")


# ---------------------------------------------------------------------------- leitura
COLS = ["ies", "ano", "curso_ies", "mod", "regular", "final", "convocados", "lista", "esgotou"]


def carregar_ufmg() -> pd.DataFrame:
    d = pd.read_csv(RAW / POR_CHAVE["ufmg_chamadas"].arquivo)
    d = d[(d["edicao"] == 1) & d["ano"].between(*ANOS)]
    chave = ["ano", "curso_id", "campus", "turno", "modelo", "cota_padrao"]
    regular = d[d["chamada"] == 0].groupby(chave)["nota_min"].min().rename("regular")
    final = d[d["is_final"]].groupby(chave)["nota_min"].min().rename("final")
    j = pd.concat([regular, final], axis=1).dropna().reset_index()
    j = j[~j["cota_padrao"].str.contains("PPI_PCD")]            # modalidades extintas em 2024
    j["ies"] = "UFMG"
    j["curso_ies"] = j["curso_id"] + "|" + j["campus"] + "|" + j["turno"] + "|" + j["modelo"]
    j["mod"] = j["cota_padrao"]
    # a UFMG publica só notas, não a contagem de convocados
    j["convocados"], j["lista"], j["esgotou"] = np.nan, np.nan, np.nan
    return j[COLS]


def carregar_ufv() -> pd.DataFrame:
    d = pd.read_csv(CSV_UFV)
    d = d[d["ano"].between(*ANOS) & d["corte_regular"].notna()]   # só séries que tiveram chamada regular
    return pd.DataFrame({
        "ies": "UFV", "ano": d["ano"], "curso_ies": d["campus"] + "|" + d["curso"], "mod": d["modalidade"],
        "regular": d["corte_regular"], "final": d["corte_final"], "convocados": d["convocados_espera"].astype(float),
        "lista": d["tamanho_lista"].astype(float), "esgotou": d["lista_esgotada"].astype(float),
    })[COLS]


def carregar() -> pd.DataFrame:
    d = pd.concat([carregar_ufmg(), carregar_ufv()], ignore_index=True)
    d["grupo"] = d["mod"].map(grupo)
    # sem convocados na lista de espera, a nota mínima não cai
    d["queda"] = (d["regular"] - d["final"]).clip(lower=0).fillna(0.0)
    d["faixa"] = faixa(d["regular"].values)
    return d


def casar_ofertas(d: pd.DataFrame, painel: pd.DataFrame, catalogo: pd.DataFrame) -> pd.Series:
    """Liga cada curso da UFMG/UFV à oferta do catálogo do MEC.

    Os nomes não batem ("QUIMICA" na UFV é "ABI - QUÍMICA" no MEC), mas as notas de corte
    da chamada regular são as mesmas nas duas fontes. Para cada curso, fica a oferta da
    mesma instituição com mais notas iguais (mesmo ano e modalidade, diferença < 0,06).
    """
    saida = pd.Series(np.nan, index=d.index, dtype=object)
    p = painel[painel["ano"].between(*ANOS) & painel["corte"].notna()]
    for sigla, parte in d.groupby("ies"):
        ofertas = catalogo.loc[catalogo["sg_ies"] == sigla, "oferta"]
        pp = p[p["oferta"].isin(ofertas)]
        j = parte.reset_index().merge(pp[["oferta", "ano", "mod", "corte"]], on=["ano", "mod"])
        j = j[(j["regular"] - j["corte"]).abs() < 0.06]
        cont = j.groupby(["curso_ies", "oferta"]).size().rename("iguais").reset_index()
        cont = cont.sort_values("iguais", ascending=False)
        melhor = cont.drop_duplicates("curso_ies")
        melhor = melhor[melhor["iguais"] >= MIN_IGUAIS].drop_duplicates("oferta")   # uma oferta por curso
        mapa = dict(zip(melhor["curso_ies"], melhor["oferta"]))
        saida.loc[parte.index] = parte["curso_ies"].map(mapa)
    return saida


# ---------------------------------------------------------------------------- perfis
def perfis(d: pd.DataFrame) -> dict:
    """Quantis da queda por grupo de modalidade e faixa de nota de corte.

    Células com poucas observações usam as faixas vizinhas e, em último caso, o grupo inteiro.
    """
    saida = {}
    for g in GRUPOS:
        dg = d[d["grupo"] == g]
        celulas = []
        for f in range(len(LIMITES) + 1):
            sub, origem = dg[dg["faixa"] == f], "faixa"
            if len(sub) < MIN_CELULA:
                sub, origem = dg[dg["faixa"].between(f - 1, f + 1)], "faixas vizinhas"
            if len(sub) < MIN_CELULA:
                sub, origem = dg, "grupo inteiro"
            q = sub["queda"]
            celulas.append({
                "n": int((dg["faixa"] == f).sum()), "base": origem, "n_base": int(len(sub)),
                "sem_queda": round(float((q == 0).mean()), 3) if len(q) else None,
                "mediana": round(float(q.median()), 1) if len(q) else 0.0,
                "quantis": [round(float(v), 1) for v in np.quantile(q, PROBS)] if len(q) else [0.0] * len(PROBS),
            })
        saida[g] = celulas
    return saida


def _quantis_perfil(P: dict, g: str, f: int) -> np.ndarray:
    return np.asarray(P[g][int(f)]["quantis"], dtype=float)


# ---------------------------------------------------------------------------- validação
def _crps(valores: np.ndarray, pesos: np.ndarray, y: float) -> float:
    """CRPS de uma distribuição discreta ponderada: menor é melhor; na mesma unidade da queda (pontos)."""
    pesos = pesos / pesos.sum()
    return float((pesos * np.abs(valores - y)).sum() - 0.5 * (pesos[:, None] * pesos[None, :] * np.abs(valores[:, None] - valores[None, :])).sum())


def _mistura(proprias: np.ndarray, perfil: np.ndarray, k: float) -> tuple[np.ndarray, np.ndarray]:
    """Histórico próprio (peso 1 por ano) + perfil (peso total k). Espelha web/src/core/espera.ts."""
    n = len(proprias)
    if n == 0:
        return perfil, np.full(len(perfil), 1.0 / len(perfil))
    if k <= 0:
        return proprias, np.full(n, 1.0 / n)
    return (np.concatenate([proprias, perfil]),
            np.concatenate([np.full(n, 1.0 / (n + k)), np.full(len(perfil), k / (n + k) / len(perfil))]))


def _quantil_ponderado(valores: np.ndarray, pesos: np.ndarray, q: float) -> float:
    o = np.argsort(valores)
    c = np.cumsum(pesos[o]) / pesos.sum()
    return float(valores[o][min(np.searchsorted(c, q), len(o) - 1)])


def validar(d: pd.DataFrame) -> dict:
    """Dois testes fora da amostra.

    (a) Troca de universidade: os perfis de uma preveem a outra. Mede o que esperar em
        instituições sem dados próprios.
    (b) Ano deixado de fora: para cada curso com histórico, prever um ano usando os outros
        anos do próprio curso + o perfil (calculado sem aquele ano). Compara pesos do perfil.
    """
    principais = d[d["grupo"].isin(["AC", "EP", "PPI"])]
    troca = []
    for alvo in sorted(d["ies"].unique()):
        treino, teste = principais[principais["ies"] != alvo], principais[principais["ies"] == alvo]
        P = perfis(treino)
        Q = np.vstack([_quantis_perfil(P, g, f) for g, f in zip(teste["grupo"], teste["faixa"])])
        y = teste["queda"].values
        troca.append({
            "prevista": alvo, "com_dados_de": "/".join(sorted(treino["ies"].unique())), "n": int(len(teste)),
            # P10–P90 dos perfis: deveria conter 80% das quedas observadas
            "cobertura80": round(float(((y >= Q[:, 1]) & (y <= Q[:, 17])).mean()) * 100, 1),
            # fração das quedas observadas que superou a mediana prevista (ideal: 50%)
            "acima_da_mediana": round(float((y > Q[:, 9]).mean()) * 100, 1),
            "erro_mediano": round(float(np.median(np.abs(y - Q[:, 9]))), 1),
        })

    com_hist = d[d["grupo"].isin(["AC", "EP", "PPI"])].copy()
    com_hist["serie"] = com_hist["ies"] + "|" + com_hist["curso_ies"] + "|" + com_hist["mod"]
    pesos_testados = [0.0, 1.0, 2.0, 4.0, np.inf]
    soma = {k: 0.0 for k in pesos_testados}
    dentro = {k: 0 for k in pesos_testados}
    n = 0
    for ano in range(ANOS[0], ANOS[1] + 1):
        P = perfis(com_hist[com_hist["ano"] != ano])
        outros = com_hist[com_hist["ano"] != ano].groupby("serie")["queda"].apply(np.array)
        for r in com_hist[com_hist["ano"] == ano].itertuples():
            proprias = outros.get(r.serie)
            if proprias is None or len(proprias) < 2:
                continue
            perfil = _quantis_perfil(P, r.grupo, r.faixa)
            n += 1
            for k in pesos_testados:
                v, w = (perfil, np.full(len(perfil), 1 / len(perfil))) if np.isinf(k) else _mistura(proprias, perfil, k)
                soma[k] += _crps(v, w, r.queda)
                dentro[k] += int(_quantil_ponderado(v, w, 0.10) <= r.queda <= _quantil_ponderado(v, w, 0.90))
    nome = {0.0: "só o histórico do curso", np.inf: "só o perfil"}
    ano_fora = [{"metodo": nome.get(k, f"histórico + perfil (peso {k:g})"), "peso_perfil": None if np.isinf(k) else k,
                 "erro": round(soma[k] / n, 2), "cobertura80": round(dentro[k] / n * 100, 1)} for k in pesos_testados]
    return {"troca_de_universidade": troca, "ano_deixado_de_fora": {"n": n, "metodos": ano_fora, "peso_adotado": PESO_PERFIL}}


# ---------------------------------------------------------------------------- saída
def _n(v, casas=1):
    return None if v is None or pd.isna(v) else (int(v) if casas == 0 else round(float(v), casas))


def calcular() -> dict:
    d = carregar()
    painel = pd.read_csv(PROCESSED / "painel.csv.gz", usecols=["oferta", "mod", "ano", "corte"])
    catalogo = pd.read_csv(PROCESSED / "ofertas.csv.gz", usecols=["oferta", "sg_ies"])
    d["oferta"] = casar_ofertas(d, painel, catalogo)

    # resumo por grupo (todas as faixas juntas), usado nos textos e na metodologia
    grupos = {}
    for g in GRUPOS:
        sub = d[d["grupo"] == g]
        grupos[g] = {"n": int(len(sub)), "sem_queda": round(float((sub["queda"] == 0).mean()), 3),
                     "mediana": round(float(sub["queda"].median()), 1),
                     "quantis": [round(float(q), 1) for q in np.quantile(sub["queda"], PROBS)]}

    # resumo por instituição
    resumo_ufv = json.loads(RESUMO_UFV.read_text(encoding="utf-8"))
    chamadas_ufmg = pd.read_csv(RAW / POR_CHAVE["ufmg_chamadas"].arquivo, usecols=["ano", "edicao", "chamada"])
    chamadas_ufmg = chamadas_ufmg[(chamadas_ufmg["edicao"] == 1) & chamadas_ufmg["ano"].between(*ANOS)].groupby("ano")["chamada"].max()
    ies = {}
    for sigla, sub in d.groupby("ies"):
        p3 = sub[sub["grupo"].isin(["AC", "EP", "PPI"])]
        info = {
            "series": int(len(sub)), "cursos": int(sub["curso_ies"].nunique()),
            "cursos_no_catalogo": int(sub.loc[sub["oferta"].notna(), "oferta"].nunique()),
            "queda_mediana": round(float(p3["queda"].median()), 1),
            "queda_p25": round(float(p3["queda"].quantile(0.25)), 1), "queda_p75": round(float(p3["queda"].quantile(0.75)), 1),
            "esgotou": None if sub["esgotou"].isna().all() else round(float(p3["esgotou"].mean()), 3),
            "anos": {},
        }
        for ano in range(ANOS[0], ANOS[1] + 1):
            if sigla == "UFV":
                r = resumo_ufv[str(ano)]
                info["anos"][str(ano)] = {"chamadas": r["chamadas"], "convocados_regular": r["convocados_regular"],
                                          "convocados_espera": r["convocados_espera"]}
            else:
                # a chamada 0 é a regular: N chamadas de lista de espera = N + 1 chamadas ao todo
                info["anos"][str(ano)] = {"chamadas": int(chamadas_ufmg.get(ano, 0)) + 1, "convocados_regular": None, "convocados_espera": None}
        ies[sigla] = info
    ies["UFMG"].update(titulo="SISU/UFMG – notas mínimas por chamada (PDFs oficiais)", origem=POR_CHAVE["ufmg_chamadas"].origem)
    ies["UFV"].update(titulo="SISU/UFV – listas de espera finais e classificados na 1ª chamada (páginas oficiais)",
                      origem=INDICE_URL.format(ano=ANOS[1] - 1))

    # histórico próprio por oferta e modalidade
    series = []
    lig = d[d["oferta"].notna()].sort_values(["ies", "oferta", "mod", "ano"])
    for (sigla, oferta, mod), sub in lig.groupby(["ies", "oferta", "mod"], sort=False):
        series.append({"ies": sigla, "oferta": oferta, "mod": mod,
                       "h": [[int(r.ano), _n(r.regular), _n(r.final), _n(r.convocados, 0), _n(r.lista, 0), _n(r.esgotou, 0)]
                             for r in sub.itertuples()]})

    return {
        "anos": list(ANOS), "probs": PROBS, "limites": LIMITES, "rotulos_faixa": ROTULO_FAIXA,
        "peso_perfil": PESO_PERFIL, "n": int(len(d)),
        "fonte": "Listas de espera da UFV e da UFMG, edições 2022 a 2026",
        "grupos": grupos, "nome_grupo": NOME_GRUPO, "perfis": perfis(d), "ies": ies, "series": series,
        "validacao": validar(d),
    }


def main() -> None:
    r = calcular()
    (PROCESSED / "espera.json").write_text(json.dumps(r, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Lista de espera, {r['anos'][0]}–{r['anos'][1]}: {r['n']} séries-ano")
    for sigla, v in r["ies"].items():
        print(f"  {sigla}: {v['series']} séries-ano, {v['cursos']} cursos ({v['cursos_no_catalogo']} ligados ao catálogo); "
              f"queda mediana {v['queda_mediana']} (P25 {v['queda_p25']}, P75 {v['queda_p75']})"
              + (f"; lista zerou em {v['esgotou']:.0%}" if v["esgotou"] is not None else ""))
    print("  Perfis (mediana da queda por faixa de nota de corte):")
    for g in ("AC", "EP", "PPI"):
        print(f"    {g:3s} " + "  ".join(f"{ROTULO_FAIXA[i]}: {c['mediana']:5.1f} (n={c['n']})" for i, c in enumerate(r["perfis"][g])))
    v = r["validacao"]
    for t in v["troca_de_universidade"]:
        print(f"  Perfis de {t['com_dados_de']} prevendo {t['prevista']}: intervalo de 80% cobriu {t['cobertura80']}% "
              f"(n={t['n']}); acima da mediana {t['acima_da_mediana']}%; erro mediano {t['erro_mediano']} pts")
    print(f"  Ano deixado de fora (n={v['ano_deixado_de_fora']['n']}):")
    for m in v["ano_deixado_de_fora"]["metodos"]:
        print(f"    {m['metodo']:34s} erro {m['erro']:6.2f}  cobertura do intervalo de 80%: {m['cobertura80']}%")
    print(f"  {len(r['series'])} séries com histórico próprio ligadas ao catálogo")


if __name__ == "__main__":
    main()
