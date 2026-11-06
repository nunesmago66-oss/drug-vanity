"""Builds src/data/abbreviations/iata-airports.json from OurAirports (public domain).
Only scheduled-service large/medium airports with an IATA code are kept, so the pack stays
useful (e.g. CGR -> Campo Grande) without thousands of private airstrips.
Usage: curl -sL -o /tmp/airports.csv https://davidmegginson.github.io/ourairports-data/airports.csv
       python3 scripts/build-airports-pack.py /tmp/airports.csv
"""
import csv, json, os, sys

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), "..", "src", "data", "abbreviations", "iata-airports.json")
rows, seen = [], set()
with open(src, encoding="utf-8") as f:
    for x in csv.DictReader(f):
        code = (x.get("iata_code") or "").strip().upper()
        if len(code) != 3 or not code.isalpha():
            continue
        if x["type"] not in ("large_airport", "medium_airport") or x.get("scheduled_service") != "yes":
            continue
        if code in seen:
            continue
        seen.add(code)
        city = x.get("municipality") or ""
        desc = f"Código IATA do aeroporto {x['name']}" + (f", {city}" if city else "") + f" ({x['iso_country']})."
        aliases = ",".join(v for v in [x.get("icao_code") or x.get("gps_code") or "", city] if v)
        rows.append([code, x["name"], "International", "Airports & Aviation", x["iso_country"], "technical", desc, aliases])
rows.sort(key=lambda r: r[0])
json.dump({"id": "iata-airports", "name": "Aeroportos (códigos IATA)", "source": "OurAirports (domínio público)",
           "sourceUrl": "https://ourairports.com/data/", "verified": True, "rows": rows},
          open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("iata-airports", len(rows))
