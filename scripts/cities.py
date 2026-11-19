"""Fetches the NFMS monthly "Major Cities Cumulative SAIFI SAIDI" PDF reports
(listed on https://nfms.powermin.gov.in/download) and writes data/cities.json.

Tries the last four months; keeps every report it finds, newest first.
Usage: python scripts/cities.py
"""
import datetime as dt
import io
import json
import pathlib
import re
import sys
import urllib.request

import pdfplumber

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "cities.json"
BASE = "https://nfms.powermin.gov.in/assets/csv/Major_Cities_{month}_{year}_Cumulative_SAIFI_SAIDI.pdf"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
ROW = re.compile(r"^(\d{1,3})\s+(.+?)\s+([A-Z][A-Z0-9]{2,})\s+(.+?)\s+(\d{1,3}:\d{2})\s+([\d.]+)\s*$")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        if r.status != 200 or "pdf" not in r.headers.get("Content-Type", "pdf"):
            return None
        return r.read()


def hours(hhmm):
    h, m = hhmm.split(":")
    return round(int(h) + int(m) / 60, 3)


def parse(pdf_bytes):
    rows, status = [], None
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        text = "\n".join((p.extract_text() or "") for p in pdf.pages)
        tables = [t for p in pdf.pages for t in (p.extract_tables() or [])]
    m = re.search(r"Status as on\s*:?\s*([0-9/]+)", text)
    if m:
        status = m.group(1)
    # Prefer table cells; fall back to text lines
    for t in tables:
        for cells in t:
            c = [(x or "").replace("\n", " ").strip() for x in cells]
            if len(c) >= 6 and c[0].isdigit() and re.match(r"^\d{1,3}:\d{2}$", c[4]):
                try:
                    rows.append(dict(rank=int(c[0]), state=c[1], discom=c[2], city=c[3].title(),
                                     saidi_hhmm=c[4], saidi_hours=hours(c[4]), saifi=float(c[5])))
                except ValueError:
                    pass
    if not rows:
        for line in text.splitlines():
            mm = ROW.match(line.strip())
            if mm:
                r, s, d, city, sd, sf = mm.groups()
                rows.append(dict(rank=int(r), state=s, discom=d, city=city.title(),
                                 saidi_hhmm=sd, saidi_hours=hours(sd), saifi=float(sf)))
    return rows, status


def main():
    today = dt.date.today()
    reports = []
    y, mth = today.year, today.month
    for _ in range(4):
        mth -= 1
        if mth == 0:
            y, mth = y - 1, 12
        name = dt.date(y, mth, 1).strftime("%B")
        url = BASE.format(month=name, year=y)
        try:
            pdf = fetch(url)
        except Exception as e:  # noqa: BLE001
            print(f"{name} {y}: not available ({e.__class__.__name__})")
            continue
        if not pdf:
            continue
        rows, status = parse(pdf)
        if rows:
            reports.append(dict(month=f"{y}-{mth:02d}", label=f"{name} {y}", url=url, status_as_on=status, rows=rows))
            print(f"{name} {y}: {len(rows)} cities")
    if not reports:
        print("No city reports fetched - keeping previous data")
        return 0
    old = json.loads(OUT.read_text()) if OUT.exists() else {"reports": []}
    have = {r["month"] for r in reports}
    merged = reports + [r for r in old.get("reports", []) if r["month"] not in have]
    merged.sort(key=lambda r: r["month"], reverse=True)
    OUT.write_text(json.dumps({"fetched_at": dt.datetime.utcnow().isoformat() + "Z", "reports": merged[:12]}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
