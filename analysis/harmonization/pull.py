"""Extrae de a11-db (solo lectura) los conteos mensuales que usa la armonización.

    python analysis/harmonization/pull.py            (DATABASE_URL en .env o en el entorno)

Salida (data/harmonization/, git-ignored):
  cells.parquet  conteo por celda de 1°, mes y satélite (SP, vegetación, confianza n/h)
  areas.parquet  igual, pero solo dentro de cada polígono de la tabla `areas`
"""
from __future__ import annotations

import os
from pathlib import Path

import pandas as pd
import psycopg
from dotenv import find_dotenv, load_dotenv

OUT = Path(__file__).resolve().parents[2] / "data" / "harmonization"

# Mismos filtros para todos los sensores: Standard Processing, incendio de vegetación, sin confianza baja.
FILTER = "h.processing = 'SP' AND h.fire_type = 0 AND h.conf_class <> 'l'"

Q_CELLS = f"""
SELECT floor(h.latitude)::int AS cy, floor(h.longitude)::int AS cx,
       date_trunc('month', h.acq_date)::date AS month, h.satellite, count(*) AS n
FROM hotspots h WHERE {FILTER}
GROUP BY 1, 2, 3, 4
"""

Q_AREAS = f"""
SELECT a.id AS area, floor(h.latitude)::int AS cy, floor(h.longitude)::int AS cx,
       date_trunc('month', h.acq_date)::date AS month, h.satellite, count(*) AS n
FROM areas a JOIN hotspots h ON ST_Intersects(h.geom, a.geom)
WHERE {FILTER}
GROUP BY 1, 2, 3, 4, 5
"""


def main() -> None:
    load_dotenv(find_dotenv(usecwd=True))
    OUT.mkdir(parents=True, exist_ok=True)
    opts = "-c default_transaction_read_only=on -c statement_timeout=900000"
    with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=20, options=opts) as con:
        for name, q in (("cells", Q_CELLS), ("areas", Q_AREAS)):
            cur = con.execute(q)
            df = pd.DataFrame(cur.fetchall(), columns=[d.name for d in cur.description])
            df["month"] = pd.to_datetime(df["month"])
            df.to_parquet(OUT / f"{name}.parquet", index=False)
            print(f"{name}: {len(df):,} filas, {int(df['n'].sum()):,} hotspots")


if __name__ == "__main__":
    main()
