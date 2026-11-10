"""Baixa os relatórios públicos para data/raw.

Uso:
    python -m pipeline.fetch_raw            # baixa o que falta
    python -m pipeline.fetch_raw --force    # baixa tudo de novo
    python -m pipeline.fetch_raw --from DIR # copia de uma pasta local (arquivos com o nome do espelho)

Os downloads vêm de espelhos fixados por commit (ver sources.py). Para usar arquivos
baixados diretamente do portal do MEC, salve-os em data/raw com o nome indicado em
`python -m pipeline.fetch_raw --list`.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
from pathlib import Path

from .sources import FONTES, RAW


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for bloco in iter(lambda: fh.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--list", action="store_true", help="apenas lista as fontes")
    ap.add_argument("--from", dest="origem_local", type=Path, help="pasta local com os arquivos")
    args = ap.parse_args(argv)

    if args.list:
        for f in FONTES:
            print(f"{f.arquivo:28s} {f.titulo}\n    origem oficial: {f.origem}\n    espelho: {f.espelho}")
        return 0

    RAW.mkdir(parents=True, exist_ok=True)
    manifesto = {}
    for f in FONTES:
        destino = RAW / f.arquivo
        if destino.exists() and not args.force:
            print(f"ok       {f.arquivo}")
        elif args.origem_local:
            candidatos = list(args.origem_local.rglob(f.espelho_nome))
            if not candidatos:
                print(f"FALTANDO {f.espelho_nome} em {args.origem_local}", file=sys.stderr)
                return 1
            shutil.copyfile(candidatos[0], destino)
            print(f"copiado  {f.arquivo}")
        else:
            print(f"baixando {f.arquivo} …", flush=True)
            tmp = destino.with_suffix(destino.suffix + ".part")
            with urllib.request.urlopen(f.espelho, timeout=180) as resp, tmp.open("wb") as out:
                shutil.copyfileobj(resp, out)
            tmp.replace(destino)
        manifesto[f.chave] = {
            "arquivo": f.arquivo,
            "titulo": f.titulo,
            "origem_oficial": f.origem,
            "espelho": f.espelho,
            "bytes": destino.stat().st_size,
            "sha256": sha256(destino),
        }
    (RAW / "MANIFESTO.json").write_text(json.dumps(manifesto, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n{len(manifesto)} arquivos em {RAW} (hashes em MANIFESTO.json)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
