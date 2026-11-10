"""ETL: relatórios brutos -> tabelas limpas em data/processed.

Saídas:
  painel.csv.gz    uma linha por (oferta, modalidade, ano) com nota de corte, vagas e inscritos
  ofertas.csv.gz   catálogo da última edição: uma linha por oferta (curso + turno + campus),
                   com pesos e notas mínimas do termo de adesão mais recente

Uso: python -m pipeline.etl
"""
from __future__ import annotations

import re

import numpy as np
import pandas as pd

from .leitura import carregar_tudo
from .modalidades import classificar, sem_acento
from .sources import PRIMEIRO_ANO, PROCESSED, ULTIMO_ANO

# Classificação heurística (não oficial) dos cursos em grandes áreas, usada só para
# sugerir "cursos afins" e agrupar filtros. A ordem importa: a primeira regra que casar vence.
AREAS: list[tuple[str, str]] = [
    ("Saúde", r"medicina(?! veterin)|enfermag|odontolog|farmac|fisioterap|nutric|fonoaudiolog|psicolog|biomedic|"
              r"terapia ocup|saude|educacao fisica|radiolog|obstetric|gerontolog|optica|naturolog|estetic"),
    ("Computação e TI", r"comput|informa|software|sistemas|dados|inteligencia artificial|redes|jogos digitais|"
                        r"internet|ciberseg|telematic|analise e desenv|\bti\b"),
    ("Engenharias", r"engenhari|arquitetura|automacao|mecatron|construcao|edific|eletr[oô]n|petroleo|"
                    r"manutencao|fabricacao|processos|materiais|saneamento|transporte|geoprocess|agrimens"),
    ("Agrárias e Ambientais", r"agro|agricol|zootec|veterin|florest|pesca|aquicult|alimento|ambient|ecolog|"
                              r"oceanog|horticult|viticult|cafeicult|irrigacao|laticin|rural|campo"),
    ("Exatas e da Terra", r"matematic|fisica|quimic|estatistic|geolog|geofisic|meteorolog|astronom|"
                          r"ciencias exatas|ciencia e tecnologia|ciencias naturais|ciencias da natureza|nanotec"),
    ("Biológicas", r"biolog|biotec|bioquim|biofis|ciencias biol|genetic|microbiolog"),
    ("Sociais Aplicadas", r"direito|administra|contab|econom|gestao|turismo|hotelari|secretariado|logistic|"
                          r"comercio|marketing|financ|servico social|relacoes internacionais|comunicacao|"
                          r"jornalismo|publicidade|relacoes publicas|bibliotec|arquivolog|museolog|atuarial|"
                          r"politicas publicas|seguranca|eventos|gastronom|cooperativ|recursos humanos|"
                          r"negocios|empreend|design|moda"),
    ("Letras e Artes", r"letras|lingu|tradu|libras|artes|musica|teatro|danca|cinema|audiovisual|"
                       r"canto|instrumento|regencia|composicao|artistic|cenic|literatur|escrita"),
    ("Humanas e Educação", r"pedagog|historia|geografia|filosof|sociolog|ciencias sociais|antropolog|"
                           r"teolog|ciencias humanas|humanidades|educacao|ciencia politica|arqueolog|"
                           r"relig|estudos|interdisciplinar|intercultural"),
]


def area_do_curso(nome: str) -> str:
    n = sem_acento(nome).lower()
    for area, padrao in AREAS:
        if re.search(padrao, n):
            return area
    return "Outras"


def _norm(txt: object) -> str:
    return re.sub(r"[^a-z0-9]+", " ", sem_acento(str(txt)).lower()).strip()


def chave_oferta(df: pd.DataFrame) -> pd.Series:
    """Chave estável de uma oferta entre anos: código e-MEC do curso + turno.

    Quando o mesmo código/turno aparece em mais de um campus no mesmo ano (cursos com
    polos, por exemplo), o campus entra na chave para não misturar séries diferentes.
    """
    base = df["co_curso"].astype(str) + "|" + df["turno"].fillna("").map(_norm)
    campus = df["campus"].fillna("").map(_norm)
    n_campus = campus.groupby([df["ano"], base]).transform("nunique")
    return base.where(n_campus <= 1, base + "|" + campus)


def titulo(nome: str) -> str:
    """'ENGENHARIA DE COMPUTAÇÃO' -> 'Engenharia de Computação' (siglas curtas preservadas)."""
    minusculas = {"de", "da", "do", "das", "dos", "e", "em", "com", "para", "a", "o", "na", "no", "à", "ou", "às", "ao"}
    partes = []
    for i, p in enumerate(str(nome).split()):
        base = p.lower()
        if i and base in minusculas:
            partes.append(base)
        elif p.strip("/-()") in {"ABI", "BI", "LI", "TI", "EAD", "II", "III"}:
            partes.append(p)
        else:
            partes.append(re.sub(r"(^|[-/(])(\w)", lambda m: m.group(1) + m.group(2).upper(), base))
    return re.sub(r"\b(Abi|Bi|Li|Ti|Ead)\b", lambda m: m.group(1).upper(), " ".join(partes))


def construir() -> tuple[pd.DataFrame, pd.DataFrame]:
    print("Lendo relatórios…")
    cortes, oferta = carregar_tudo(PRIMEIRO_ANO)
    cortes = classificar(cortes)
    cortes = cortes[cortes["co_curso"].notna()].copy()
    cortes["oferta"] = chave_oferta(cortes)

    # nota de corte 0 ou vazia = nenhuma pessoa selecionada na chamada regular
    cortes.loc[~(cortes["corte"] > 0), "corte"] = np.nan
    # cortes acima de 1000 só são possíveis com bônus; fora disso é erro de digitação na origem
    invalida = (cortes["corte"] > 1000) & (cortes["tipo"] != "B")
    cortes.loc[invalida, "corte"] = np.nan

    chave = ["oferta", "mod", "ano"]
    antes = len(cortes)
    cortes = (cortes.sort_values("vagas", ascending=False, na_position="last")
              .drop_duplicates(chave, keep="first").sort_values(chave))
    print(f"  {antes - len(cortes)} linhas duplicadas descartadas (mantida a de mais vagas)")

    painel = cortes[["oferta", "mod", "tipo", "ano", "corte", "vagas", "inscritos", "bonus", "ds_mod"]].copy()

    # ---- catálogo: ofertas da última edição ----
    ult = cortes[cortes["ano"] == ULTIMO_ANO]
    cat = ult.drop_duplicates("oferta")[
        ["oferta", "co_ies", "no_ies", "sg_ies", "org", "cat_adm", "campus", "municipio", "uf", "regiao",
         "co_curso", "curso", "grau", "turno"]
    ].copy()
    cat["sg_ies"] = cat["sg_ies"].str.strip()
    cat["curso_nome"] = cat["curso"].map(titulo)
    cat["area"] = cat["curso"].map(area_do_curso)
    cat["regiao"] = cat["regiao"].str.replace("_", "-").str.title().str.replace("Centro-Oeste", "Centro-Oeste")
    cat["vagas_total"] = cat["oferta"].map(ult.groupby("oferta")["vagas"].sum())

    # pesos e mínimas: termo de adesão mais recente disponível para o curso/turno
    oferta = oferta.sort_values("ano")
    oferta["k"] = oferta["co_curso"].astype(str) + "|" + oferta["turno"].fillna("").map(_norm)
    pesos = oferta.drop_duplicates("k", keep="last").set_index("k")
    cat["k"] = cat["co_curso"].astype(str) + "|" + cat["turno"].fillna("").map(_norm)
    cols_p = ["p_red", "p_lc", "p_mt", "p_ch", "p_cn", "m_red", "m_lc", "m_mt", "m_ch", "m_cn", "m_media", "semestres"]
    cat = cat.join(pesos[cols_p + ["ano"]].rename(columns={"ano": "pesos_ano"}), on="k")

    # curso novo (sem termo de adesão publicado): herda os pesos mais comuns do mesmo curso na mesma IES
    falta = cat["p_red"].isna()
    cat["pesos_fonte"] = np.where(falta, "", "termo")
    if falta.any():
        ref = cat[~falta].copy()
        ref["nk"] = ref["co_ies"].astype(str) + "|" + ref["curso"].map(_norm)
        moda = ref.groupby("nk")[cols_p + ["pesos_ano"]].agg(lambda s: s.mode().iloc[0] if not s.mode().empty else np.nan)
        nk = cat["co_ies"].astype(str) + "|" + cat["curso"].map(_norm)
        herd = moda.reindex(nk[falta].values)
        herd.index = cat.index[falta]
        ok = herd["p_red"].notna()
        cat.loc[herd.index[ok], cols_p + ["pesos_ano"]] = herd.loc[ok, cols_p + ["pesos_ano"]]
        cat.loc[herd.index[ok], "pesos_fonte"] = "mesmo curso na IES"
        resto = cat["p_red"].isna()
        cat.loc[resto, ["p_red", "p_lc", "p_mt", "p_ch", "p_cn"]] = 1.0
        cat.loc[resto, ["m_red", "m_lc", "m_mt", "m_ch", "m_cn", "m_media"]] = 0.0
        cat.loc[resto, "pesos_fonte"] = "indisponível (média simples)"
    # mínimas de 0,01 no relatório significam apenas "nota diferente de zero"
    cat = cat.drop(columns="k")
    print(f"  catálogo {ULTIMO_ANO}: {len(cat)} ofertas, {cat['co_ies'].nunique()} instituições; "
          f"pesos: {cat['pesos_fonte'].value_counts().to_dict()}")
    return painel, cat


def main() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    painel, cat = construir()
    painel.to_csv(PROCESSED / "painel.csv.gz", index=False)
    cat.to_csv(PROCESSED / "ofertas.csv.gz", index=False)
    resumo = painel.groupby("ano").agg(linhas=("corte", "size"), com_corte=("corte", "count"),
                                       vagas=("vagas", "sum"), mediana=("corte", "median"))
    print(resumo.to_string())


if __name__ == "__main__":
    main()
