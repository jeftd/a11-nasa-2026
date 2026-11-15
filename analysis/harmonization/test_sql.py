"""Prueba harmonization_v2 contra a11-db SIN modificarla: todo se crea en pg_temp dentro de una transacción
que se deshace al final.

    python analysis/harmonization/test_sql.py
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import pandas as pd
import psycopg
from dotenv import find_dotenv, load_dotenv

DATA = Path(__file__).resolve().parents[2] / "data" / "harmonization"

# Polígono dibujado en Tabasco, donde hay quemadores de gas (fuentes estáticas).
TABASCO = '{"type":"Polygon","coordinates":[[[-93.4,17.7],[-92.9,17.7],[-92.9,18.1],[-93.4,18.1],[-93.4,17.7]]]}'


def main() -> None:
    load_dotenv(find_dotenv(usecwd=True))
    sql = (DATA / "harmonization_v2_test.sql").read_text(encoding="utf-8")
    with psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=20,
                         options="-c statement_timeout=600000") as con:
        con.execute("SET LOCAL search_path = public")
        t = time.time()
        con.execute(sql)
        n_static = con.execute("SELECT count(*) FROM pg_temp.static_sites").fetchone()[0]
        print(f"objetos temporales creados en {time.time() - t:.1f}s; sitios estáticos: {n_static:,}")

        frames = []
        for area in ("stgo", "arteaga", "ocos"):
            for ver, fn in (("v2", "pg_temp.harmonize_polygon"), ("actual", "public.harmonize_polygon")):
                t = time.time()
                rows = con.execute(f"SELECT h.* FROM areas a, {fn}(a.geom) h WHERE a.id = %s", (area,)).fetchall()
                dt = time.time() - t
                df = pd.DataFrame(rows, columns=["month", "count", "low", "high", "source"]).assign(area=area, ver=ver)
                frames.append(df)
                print(f"{area:8s} {ver:6s} {len(df)} meses en {dt:.1f}s")

        for label, geo in (("tabasco", TABASCO),):
            for ver, fn in (("v2", "pg_temp.harmonize_polygon"), ("actual", "public.harmonize_polygon")):
                rows = con.execute(f"SELECT h.* FROM {fn}(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)) h", (geo,)).fetchall()
                frames.append(pd.DataFrame(rows, columns=["month", "count", "low", "high", "source"]).assign(area=label, ver=ver))
        con.rollback()

    df = pd.concat(frames)
    df["year"] = pd.to_datetime(df["month"]).dt.year
    out = df.pivot_table(index=["area", "year"], columns="ver", values="count", aggfunc="sum")
    df.to_parquet(DATA / "sql_test.parquet", index=False)
    print(out.unstack(0).to_string())
    last = df[pd.to_datetime(df["month"]) >= "2026-06-01"].pivot_table(index=["area", "month"], columns="ver", values="count")
    print("\nMeses recientes (NRT desde 2026-08):\n", last.to_string())


if __name__ == "__main__":
    main()
