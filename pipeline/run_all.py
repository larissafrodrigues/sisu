"""Executa o pipeline completo: download -> ETL -> modelo -> lista de espera -> exportação.

Uso: python -m pipeline.run_all            (≈ 6 min em um notebook comum)
     python -m pipeline.run_all --sem-etl  (reaproveita data/processed; refaz modelo e exportação)
"""
from __future__ import annotations

import sys
import time

from . import espera, etl, exportar, fetch_raw, modelo


def main() -> None:
    etapas = [("Download dos relatórios", lambda: fetch_raw.main([])), ("ETL", etl.main),
              ("Modelo e validação", modelo.main), ("Lista de espera", espera.main), ("Exportação para a web", exportar.main)]
    if "--sem-etl" in sys.argv:
        etapas = etapas[2:]
    for nome, f in etapas:
        t = time.time()
        print(f"\n=== {nome} ===")
        f()
        print(f"--- {nome}: {time.time() - t:.0f}s")


if __name__ == "__main__":
    main()
