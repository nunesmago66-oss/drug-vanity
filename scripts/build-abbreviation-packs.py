"""Regenerates the standards-based abbreviation packs in src/data/abbreviations/.
Sources (downloaded at build time, never typed by hand):
  - Debian iso-codes via the pycountry wheel (ISO 3166-1, 3166-2, 4217, 639-3)
  - Bowserinator/Periodic-Table-JSON (IUPAC element symbols)
Usage: python3 scripts/build-abbreviation-packs.py <pycountry-databases-dir> <PeriodicTableJSON.json>
"""
import json, sys, os
db, pt = sys.argv[1], sys.argv[2]
out = os.path.join(os.path.dirname(__file__), "..", "src", "data", "abbreviations")
load = lambda f: json.load(open(os.path.join(db, f), encoding="utf-8"))
ISO = "https://salsa.debian.org/iso-codes-team/iso-codes"
def write(pid, name, source, url, rows):
    seen, uniq = set(), []
    for r in rows:
        k = (r[0].lower(), r[1].lower())
        if k not in seen: seen.add(k); uniq.append(r)
    json.dump({"id": pid, "name": name, "source": source, "sourceUrl": url, "verified": True, "rows": uniq},
              open(os.path.join(out, pid + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(pid, len(uniq))
# row: [abbr, meaning, language, category, region, kind, description, aliases]
c = load("iso3166-1.json")["3166-1"]
rows = []
for x in c:
    nm = x.get("common_name") or x["name"]
    rows.append([x["alpha_2"], nm, "International", "Countries & Territories", "Global", "technical", f"Código ISO 3166-1 alfa-2 de {x['name']}.", x["alpha_3"]])
    rows.append([x["alpha_3"], nm, "International", "Countries & Territories", "Global", "technical", f"Código ISO 3166-1 alfa-3 de {x['name']}.", x["alpha_2"]])
write("iso-3166-countries", "Países e territórios (ISO 3166-1)", "ISO 3166-1 via Debian iso-codes", ISO, rows)
cur = load("iso4217.json")["4217"]
write("iso-4217-currencies", "Moedas (ISO 4217)", "ISO 4217 via Debian iso-codes", ISO,
      [[x["alpha_3"], x["name"], "International", "Finance & Business", "Global", "technical", f"Código ISO 4217 da moeda {x['name']}.", ""] for x in cur])
lang = [x for x in load("iso639-3.json")["639-3"] if "alpha_2" in x]
rows = []
for x in lang:
    rows.append([x["alpha_2"], x["name"], "International", "Languages", "Global", "technical", f"Código ISO 639-1 do idioma {x['name']}.", x["alpha_3"]])
    rows.append([x["alpha_3"], x["name"], "International", "Languages", "Global", "technical", f"Código ISO 639-3 do idioma {x['name']}.", x["alpha_2"]])
write("iso-639-languages", "Idiomas (ISO 639-1 / 639-3)", "ISO 639 via Debian iso-codes", ISO, rows)
REG = {"BR": "Brasil", "US": "Estados Unidos", "PT": "Portugal", "CA": "Canadá", "AU": "Austrália", "MX": "México", "AR": "Argentina", "ES": "Espanha", "IT": "Itália", "DE": "Alemanha"}
LANG = {"BR": "Portuguese", "PT": "Portuguese", "MX": "Spanish", "AR": "Spanish", "ES": "Spanish", "IT": "Italian", "DE": "German"}
rows = []
for x in load("iso3166-2.json")["3166-2"]:
    cc, sub = x["code"].split("-", 1)
    if cc in REG and x.get("parent") is None and len(sub) <= 3 and x["type"] not in ("Metropolitan city", "Free municipal consortium"):
        rows.append([sub, x["name"], LANG.get(cc, "English"), "States & Provinces", REG[cc], "regional", f"{x['type']} — código ISO 3166-2 {x['code']}.", x["code"]])
write("iso-3166-2-subdivisions", "Estados e províncias (ISO 3166-2)", "ISO 3166-2 via Debian iso-codes", ISO, rows)
el = [e for e in json.load(open(pt))["elements"] if e["number"] <= 118]
write("iupac-elements", "Elementos químicos (IUPAC)", "Periodic-Table-JSON (dados IUPAC)", "https://github.com/Bowserinator/Periodic-Table-JSON",
      [[e["symbol"], e["name"], "International", "Chemistry", "Global", "technical", f"Símbolo do elemento químico nº {e['number']}.", ""] for e in el])
