"""Modelo preditivo da nota de corte da próxima edição, com incerteza calibrada.

Ideia central (ver docs/MODELO.md):

    corte(t+1) = corte(t) + f(atributos em t)  +  choque da edição  +  ruído da série
                 └─────── previsão central ───┘   └─ incerteza comum ┘  └ incerteza própria ┘

  * f é um gradient boosting (perda absoluta) treinado na variação RELATIVA à mediana do ano,
    ou seja, aprende o que é previsível (reversão à média, tamanho da turma, tipo de cota…),
    sem tentar adivinhar se a edição inteira vai subir ou descer.
  * O "choque da edição" (ENEM mais difícil, mudança de regra…) não é previsível. Em vez de
    fingir que é, guardamos os choques observados em cada ano do backtest, por faixa de nota,
    e tratamos cada um como um cenário igualmente plausível para a próxima edição.
  * O ruído próprio de cada série é modelado por um segundo boosting que prevê o tamanho
    típico do erro (escala s), e pela distribuição empírica dos erros padronizados z.

Toda a avaliação é fora da amostra e respeita o tempo: para prever o ano T só se usa o que
existia antes de T.

Uso: python -m pipeline.modelo
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance

from .atributos import ATRIBUTOS, carregar, montar
from .sources import ANO_ALVO, PRIMEIRO_ANO, PROCESSED, ULTIMO_ANO

PRIMEIRO_TESTE = 2019            # primeiro ano previsto no backtest (treino: 2014→2018)
CENTROS = [500.0, 600.0, 700.0, 800.0]   # centros das faixas de nota usadas nos choques
LIMITES = [-np.inf, 550.0, 650.0, 750.0, np.inf]
ESCALA_MIN = 3.0                 # piso da escala de erro, em pontos
PROBS_Z = np.round(np.linspace(0.005, 0.995, 199), 4)  # grade da distribuição de z
INFLACAO = 1.25                  # fator aplicado aos choques (ver `cenarios`)

NOMES_ATRIBUTOS = {
    "c0": "Última nota de corte", "d1": "Variação no último ano", "d2": "Variação em dois anos",
    "m3": "Distância da média de 3 anos", "dp": "Volatilidade histórica", "n_hist": "Anos de histórico",
    "lacuna": "Anos sem oferta", "lvagas": "Vagas", "linscr": "Inscritos", "lconc": "Inscritos por vaga",
    "dvagas": "Variação de vagas", "gap_ac": "Distância para a ampla concorrência",
    "d1_ac": "Variação recente da ampla concorrência", "desv_curso": "Distância da mediana nacional do curso",
    "d1_curso": "Variação nacional do curso", "tipo_cod": "Tipo de modalidade", "renda": "Cota com critério de renda",
    "ppi": "Cota racial", "pcd": "Cota PcD", "quil": "Cota quilombola", "grau_cod": "Grau", "turno_cod": "Turno",
    "regiao_cod": "Região", "estadual": "Instituição estadual/municipal",
}


def _gbm(**kw) -> HistGradientBoostingRegressor:
    base = dict(loss="absolute_error", max_iter=300, learning_rate=0.06, max_leaf_nodes=31,
                min_samples_leaf=40, l2_regularization=1.0, random_state=0)
    base.update(kw)
    return HistGradientBoostingRegressor(**base)


def _cols(df: pd.DataFrame) -> list[str]:
    # o HistGradientBoosting falha com coluna inteiramente vazia (vagas antes de 2019, por ex.)
    return [a for a in ATRIBUTOS if df[a].nunique(dropna=True) > 1]


def ajustar_central(treino: pd.DataFrame):
    rel = treino["alvo"] - treino.groupby("ano_t")["alvo"].transform("median")
    cols = _cols(treino)
    return _gbm().fit(treino[cols], rel), cols


def prever_central(modelo, cols, df: pd.DataFrame) -> np.ndarray:
    return df["c0"].values + modelo.predict(df[cols])


def choque_interp(valores: np.ndarray, nota: np.ndarray) -> np.ndarray:
    """Choque de um cenário (4 valores, um por faixa) interpolado linearmente pela nota."""
    return np.interp(nota, CENTROS, valores)


def tabela_choques(bt: pd.DataFrame) -> pd.DataFrame:
    faixa = pd.cut(bt["p"], LIMITES, labels=CENTROS)
    return bt.assign(faixa=faixa).pivot_table(index="ano", columns="faixa", values="e",
                                              aggfunc="median", observed=False).astype(float)


def cenarios(choques: pd.DataFrame) -> np.ndarray:
    """Transforma os choques observados em cenários para a próxima edição.

    Dois ajustes, escolhidos por darem cobertura média fora da amostra próxima da nominal
    (50/80/90% -> 50/79/89% em 2021–2026) com caudas equilibradas:
      * simetria: cada choque entra com os dois sinais, porque o sentido do choque de uma
        edição não se mostrou previsível a partir das anteriores;
      * inflação de 25%: com poucos anos observados, a amplitude real é subestimada.
    """
    c = choques.values * INFLACAO
    return np.vstack([c, -c])


def ajustar_escala(bt: pd.DataFrame, choques: pd.DataFrame):
    g = np.zeros(len(bt))
    for ano, linha in choques.iterrows():
        m = (bt["ano"] == ano).values
        g[m] = choque_interp(linha.values, bt.loc[m, "p"].values)
    r = bt["e"].values - g
    cols = _cols(bt)
    modelo = _gbm(max_iter=200, min_samples_leaf=80).fit(bt[cols], np.abs(r))
    return modelo, cols, r


def prever_escala(modelo, cols, df: pd.DataFrame) -> np.ndarray:
    return np.maximum(modelo.predict(df[cols]), ESCALA_MIN)


def cdf_mistura(x: np.ndarray, p: np.ndarray, s: np.ndarray, choques: np.ndarray, zq: np.ndarray) -> np.ndarray:
    """P(corte <= x): média, sobre os cenários de choque, da CDF empírica de z."""
    total = np.zeros_like(x, dtype=float)
    for linha in choques:
        z = (x - p - choque_interp(linha, p)) / s
        total += np.interp(z, zq, PROBS_Z, left=0.0, right=1.0)
    return total / len(choques)


def quantil_mistura(q: float, p: np.ndarray, s: np.ndarray, choques: np.ndarray, zq: np.ndarray) -> np.ndarray:
    lo, hi = p - 400.0, p + 400.0
    for _ in range(40):  # bisseção vetorizada
        mid = (lo + hi) / 2
        acima = cdf_mistura(mid, p, s, choques, zq) < q
        lo = np.where(acima, mid, lo)
        hi = np.where(acima, hi, mid)
    return (lo + hi) / 2


def backtest(T: pd.DataFrame) -> pd.DataFrame:
    """Previsões fora da amostra para cada ano de teste, mais baselines simples."""
    partes = []
    for teste in range(PRIMEIRO_TESTE, ULTIMO_ANO + 1):
        tr, te = T[T["ano"] < teste], T[T["ano"] == teste].copy()
        modelo, cols = ajustar_central(tr)
        te["p"] = prever_central(modelo, cols, te)
        te["p_persist"] = te["c0"]
        te["p_media2"] = np.where(te["d1"].notna(), te["c0"] - te["d1"] / 2, te["c0"])
        te["p_media3"] = te["c0"] + te["m3"]
        te["p_tend"] = np.where(te["d1"].notna(), te["c0"] + te["d1"] / 2, te["c0"])
        partes.append(te)
        print(f"  backtest {teste}: treino {len(tr):6d}  teste {len(te):6d}  "
              f"MAE modelo {np.abs(te.y - te.p).mean():5.2f} | persistência {np.abs(te.y - te.c0).mean():5.2f}")
    bt = pd.concat(partes)
    bt["e"] = bt["y"] - bt["p"]
    return bt


def metricas(bt: pd.DataFrame) -> dict:
    nomes = {"p": "Modelo (boosting)", "p_persist": "Repetir a última nota", "p_media2": "Média dos 2 últimos anos",
             "p_media3": "Média dos 3 últimos anos", "p_tend": "Extrapolar tendência"}
    linhas = []
    for col, nome in nomes.items():
        e = bt["y"] - bt[col]
        por_ano = e.abs().groupby(bt["ano"]).mean()
        rel = (e - e.groupby(bt["ano"]).transform("median")).abs()
        linhas.append({
            "modelo": nome, "mae": round(float(e.abs().mean()), 2), "mediana_abs": round(float(e.abs().median()), 2),
            "p90_abs": round(float(e.abs().quantile(0.9)), 2), "mae_sem_choque": round(float(rel.mean()), 2),
            "mae_por_ano": {int(a): round(float(v), 2) for a, v in por_ano.items()},
        })
    return {"comparacao": linhas, "n": int(len(bt)), "anos": sorted(int(a) for a in bt["ano"].unique())}


def calibracao_rolante(bt: pd.DataFrame) -> list[dict]:
    """Para cada ano T, calibra a incerteza só com anos < T e mede a cobertura real em T."""
    saida = []
    for teste in range(PRIMEIRO_TESTE + 2, ULTIMO_ANO + 1):
        passado, atual = bt[bt["ano"] < teste], bt[bt["ano"] == teste]
        ch = tabela_choques(passado)
        m_esc, cols, r = ajustar_escala(passado, ch)
        zq = np.quantile(r / prever_escala(m_esc, cols, passado), PROBS_Z)
        s = prever_escala(m_esc, cols, atual)
        u = cdf_mistura(atual["y"].values, atual["p"].values, s, cenarios(ch), zq)  # PIT
        linha = {"ano": teste, "n": int(len(atual)), "cenarios": int(2 * len(ch)),
                 "choque_observado": round(float(atual["e"].median()), 1)}
        for nominal in (50, 80, 90):
            a = (1 - nominal / 100) / 2
            linha[f"cob{nominal}"] = round(float(((u >= a) & (u <= 1 - a)).mean()) * 100, 1)
        linha["abaixo_p10"] = round(float((u < 0.10).mean()) * 100, 1)   # corte real ficou abaixo do P10
        linha["acima_p90"] = round(float((u > 0.90).mean()) * 100, 1)    # corte real ficou acima do P90
        saida.append(linha)
        print(f"  calibração {teste}: cobertura 80% = {linha['cob80']}%  (50%: {linha['cob50']}%, 90%: {linha['cob90']}%)")
    media = {"ano": "média", "n": int(sum(l["n"] for l in saida)), "cenarios": None, "choque_observado": None}
    for k in ("cob50", "cob80", "cob90", "abaixo_p10", "acima_p90"):
        media[k] = round(float(np.mean([l[k] for l in saida])), 1)
    saida.append(media)
    return saida


def confianca(s: np.ndarray, n_hist: np.ndarray) -> np.ndarray:
    """Rótulo de confiança da previsão: 2 = alta, 1 = média, 0 = baixa."""
    return np.where((s <= 12) & (n_hist >= 4), 2, np.where((s <= 22) & (n_hist >= 2), 1, 0))


def main() -> None:
    painel, cat = carregar()
    print("Montando atributos…")
    X = montar(painel, cat, list(range(PRIMEIRO_ANO, ULTIMO_ANO + 1)))
    X["ano"] = X["ano_t"] + 1  # ano previsto
    T = X[X["y"].notna()].copy()

    print("Backtest temporal…")
    bt = backtest(T)
    rel = metricas(bt)
    cal = calibracao_rolante(bt)

    print("Ajuste final…")
    choques = tabela_choques(bt)
    m_esc, cols_esc, r = ajustar_escala(bt, choques)
    s_bt = prever_escala(m_esc, cols_esc, bt)
    zq = np.quantile(r / s_bt, PROBS_Z)

    modelo, cols = ajustar_central(T)
    atual = X[X["ano_t"] == ULTIMO_ANO].copy()
    atual["p"] = prever_central(modelo, cols, atual)
    atual["s"] = prever_escala(m_esc, cols_esc, atual)
    cen = cenarios(choques)
    for q in (10, 50, 90):
        atual[f"q{q}"] = quantil_mistura(q / 100, atual["p"].values, atual["s"].values, cen, zq)
    atual["conf"] = confianca(atual["s"].values, atual["n_hist"].values)

    amostra = T[T["ano"] >= ULTIMO_ANO - 2].sample(20000, random_state=0)
    alvo_rel = amostra["alvo"] - amostra.groupby("ano_t")["alvo"].transform("median")
    imp = permutation_importance(modelo, amostra[cols], alvo_rel, scoring="neg_mean_absolute_error",
                                 n_repeats=3, random_state=0)
    importancias = sorted(({"atributo": NOMES_ATRIBUTOS[c], "ganho_mae": round(float(v), 3)}
                           for c, v in zip(cols, imp.importances_mean)), key=lambda d: -d["ganho_mae"])[:10]

    # erro por perfil de série (para a página de metodologia)
    def perfil(mask, nome):
        e = bt.loc[mask, "e"]
        e = e - e.groupby(bt.loc[mask, "ano"]).transform("median")
        return {"grupo": nome, "n": int(mask.sum()), "mediana_abs": round(float(e.abs().median()), 1),
                "p90_abs": round(float(e.abs().quantile(0.9)), 1)}
    v = np.expm1(bt["lvagas"])
    perfis = [
        perfil(bt["tipo"] == "A", "Ampla concorrência"),
        perfil(bt["tipo"] == "L", "Lei de Cotas"),
        perfil(bt["tipo"] == "V", "Ações afirmativas próprias"),
        perfil(v <= 2, "Até 2 vagas na modalidade"),
        perfil((v > 2) & (v <= 10), "3 a 10 vagas"),
        perfil(v > 10, "Mais de 10 vagas"),
        perfil(bt["c0"] < 550, "Corte anterior abaixo de 550"),
        perfil((bt["c0"] >= 650) & (bt["c0"] < 750), "Corte anterior entre 650 e 750"),
        perfil(bt["c0"] >= 750, "Corte anterior de 750 ou mais"),
    ]

    relatorio = {
        "ano_base": ULTIMO_ANO, "ano_alvo": ANO_ALVO, "primeiro_ano": PRIMEIRO_ANO,
        "n_treino": int(len(T)), "n_previsoes": int(len(atual)),
        "backtest": rel, "calibracao": cal, "perfis": perfis, "importancias": importancias,
        "choques": {"anos": [int(a) for a in choques.index], "centros": CENTROS,
                    "valores": np.round(choques.values, 2).tolist()},
        "cenarios": {"centros": CENTROS, "inflacao": INFLACAO, "valores": np.round(cen, 2).tolist()},
        "z": {"probs": PROBS_Z.tolist(), "valores": np.round(zq, 4).tolist()},
        "escala": {"mediana": round(float(np.median(atual["s"])), 1),
                   "p10": round(float(np.quantile(atual["s"], 0.1)), 1),
                   "p90": round(float(np.quantile(atual["s"], 0.9)), 1)},
        "confianca": {str(k): int(v) for k, v in atual["conf"].value_counts().items()},
    }
    (PROCESSED / "relatorio_modelo.json").write_text(json.dumps(relatorio, indent=1, ensure_ascii=False), encoding="utf-8")
    atual[["oferta", "mod", "c0", "prev", "p", "s", "q10", "q50", "q90", "n_hist", "conf"]].to_csv(
        PROCESSED / "previsoes.csv.gz", index=False)
    bt[["oferta", "mod", "ano", "c0", "y", "p", "e"]].to_csv(PROCESSED / "backtest.csv.gz", index=False)

    melhor = rel["comparacao"][0]
    print(f"\nMAE fora da amostra: modelo {melhor['mae']} | persistência {rel['comparacao'][1]['mae']} pontos")
    print(f"Previsões {ANO_ALVO}: {len(atual)} séries; escala mediana {relatorio['escala']['mediana']} pts; "
          f"confiança {relatorio['confianca']}")
    print("Choques por ano (linhas) e faixa de nota (colunas):")
    print(choques.round(1).to_string())


if __name__ == "__main__":
    main()
