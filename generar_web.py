# -*- coding: utf-8 -*-
"""
Generador de la web de simulación de destinos (Concurso de Traslados CyL 2026).

Lee, por orden de prioridad:
  1) CSV reales en la raíz del proyecto (NUNCA se suben al repositorio; ver .gitignore):
     - Aprobados.csv                 -> orden de mérito (362), turno L/M, provincia de examen
     - Relación posibles puestos.csv -> catálogo de ~1600 puestos con Complemento Específico (E06..E02)
     - 2025.csv                      -> histórico del concurso 2025 (380 plazas)
  2) Si no existen (o se pasa --demo): dataset 100% SINTÉTICO en datos_demo/, con las
     mismas distribuciones agregadas (generado automáticamente por generar_datos_demo.py).
  - nucleo.js / charts.js / app.js / template.html -> piezas de la web

Nota de privacidad: de los aprobados solo se embeben orden de mérito, turno y
provincia de examen. Los nombres y demás datos identificativos jamás viajan a
simulador.html ni a datos.json.

Escribe:
  - simulador.html -> web autocontenida (offline, doble clic)
  - datos.json     -> datos para las pruebas de Node

Uso:  python generar_web.py           # usa los CSV reales si existen; si no, los sintéticos
      python generar_web.py --demo    # fuerza siempre el dataset sintético
"""

import csv
import json
import math
import os
import re
import sys
import unicodedata
from datetime import date

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

APROBADOS_CSV = "Aprobados.csv"
PUESTOS_CSV = "Relación posibles puestos.csv"
HIST_2025_CSV = "2025.csv"
DEMO_DIR = "datos_demo"

PROVS = ["VALLADOLID", "LEON", "BURGOS", "SALAMANCA", "SEGOVIA", "ZAMORA", "AVILA", "PALENCIA", "SORIA"]
PROVS_DISPLAY = ["Valladolid", "León", "Burgos", "Salamanca", "Segovia", "Zamora", "Ávila", "Palencia", "Soria"]
SEATS_RPT = [94, 52, 42, 40, 29, 28, 26, 26, 25]
# 380 plazas de 2025 escaladas a 362 (126+38+37+30+28+28+33+24+18 = 362)
SEATS_2025 = [126, 38, 37, 30, 28, 28, 33, 24, 18]
IDX_ZAMORA = PROVS.index("ZAMORA")

# Matriz de distancias por carretera entre capitales de CyL (km)
DIST_MATRIX = [
    [0, 138, 126, 120, 115, 98, 130, 50, 205],   # Valladolid
    [138, 0, 178, 200, 240, 135, 260, 130, 310], # León
    [126, 178, 0, 240, 195, 220, 245, 88, 140],  # Burgos
    [120, 200, 240, 0, 170, 66, 108, 165, 320],  # Salamanca
    [115, 240, 195, 170, 0, 185, 65, 160, 180],  # Segovia
    [98, 135, 220, 66, 185, 0, 168, 140, 300],   # Zamora
    [130, 260, 245, 108, 65, 168, 0, 175, 250],  # Ávila
    [50, 130, 88, 165, 160, 140, 175, 0, 225],   # Palencia
    [205, 310, 140, 320, 180, 300, 250, 225, 0]   # Soria
]


def build_prox_matrix(decay_km=120.0):
    prox = []
    for row in DIST_MATRIX:
        weights = [math.exp(-d / decay_km) for d in row]
        s = sum(weights) or 1.0
        prox.append([round(w / s, 4) for w in weights])
    return prox


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def norm(s):
    return strip_accents(str(s).strip().upper())


def parse_e(value):
    """'E06'->6, 'E04'->4, 'E03'->3, ''->2 (las celdas vacías son E02)."""
    m = re.match(r"^E\s*0?([0-9])", str(value or "").strip().upper())
    if not m:
        return 2
    d = int(m.group(1))
    return d if d in (2, 3, 4, 6) else 2


def col_index(head, keywords):
    for i, h in enumerate(head):
        if all(k in h for k in keywords):
            return i
    return None


def parse_puestos(path):
    with open(path, encoding="cp1252", errors="replace", newline="") as f:
        rows = list(csv.reader(f, delimiter=";"))
    head = [norm(h) for h in rows[0]]
    i_cons = col_index(head, ["COMPLEMENTO"])
    i_prov = col_index(head, ["PROVINCIA"])
    i_mun = col_index(head, ["MUNICIPIO"])
    i_loc = col_index(head, ["LOCALIDAD"])
    i_fun = col_index(head, ["FUNCION"])
    i_tipo = col_index(head, ["PUESTO", "TIPO"])
    i_nombre = col_index(head, ["NOMBRE"])
    i_descr = col_index(head, ["DESCR"])
    i_consj = col_index(head, ["CONSEJER"])
    ua_idx = [i for i, h in enumerate(head) if "UNIDAD" in h]
    needed = [i_cons, i_prov, i_mun, i_loc, i_fun, i_tipo, i_nombre, i_descr, i_consj]
    if any(x is None for x in needed):
        raise RuntimeError("Columnas no encontradas en el CSV de puestos: %s" % head)

    muns, mun_cap, mun_map = [], [], {}
    descrs, descr_map = [], {}
    conss, cons_map = [], {}
    tipos, tipo_map = [], {}
    posts, skipped, unknown = [], 0, {}

    for r in rows[1:]:
        if not r or all(not c.strip() for c in r):
            continue
        if len(r) <= max(needed):
            skipped += 1
            continue
        prov_n = norm(r[i_prov])
        if prov_n not in PROVS:
            skipped += 1
            unknown[prov_n or "(vacio)"] = unknown.get(prov_n or "(vacio)", 0) + 1
            continue
        prov = PROVS.index(prov_n)
        e = parse_e(r[i_cons])
        mun = r[i_mun].strip() or r[i_loc].strip() or prov_n
        loc = r[i_loc].strip() or mun
        fun = norm(r[i_fun])
        tipo = r[i_tipo].strip().upper()
        nombre = r[i_nombre].strip()
        descr = r[i_descr].strip() or nombre
        consj = r[i_consj].strip()

        texto = norm(nombre + " " + descr + " " + mun + " " + loc)
        for ui in ua_idx[:2]:
            if ui < len(r):
                texto += " " + norm(r[ui])
        if "RESIDENC" in texto:
            trab = 2  # residencias / turnos
        elif tipo == "CA033" or "IRC000" in fun:
            trab = 1  # atención al público
        else:
            trab = 0  # oficina interna
        hor = 1 if "64300" in fun else 0

        # Clasificación SSCC (Servicios Centrales) vs Territorial
        is_terr = any(k in texto for k in [
            "DELEGACION TERRITORIAL", "SERVICIO TERRITORIAL", "DIRECCION PROVINCIAL",
            "OFICINA TERRITORIAL", "GERENCIA TERRITORIAL", "OFICINA DEL SERVICIO",
            "IES ", "CEIP ", "CEPA ", "CEO ", "CENTRO ", "RESIDENCIA "
        ])
        is_sscc = 1 if (prov == 0 and not is_terr) else 0

        mk = norm(mun)
        if mk not in mun_map:
            mun_map[mk] = len(muns)
            muns.append(mun)
            mun_cap.append(1 if mk == prov_n else 0)
        dk = norm(descr)
        if dk not in descr_map:
            descr_map[dk] = len(descrs)
            descrs.append(descr)
        ck = norm(consj)
        if ck not in cons_map:
            cons_map[ck] = len(conss)
            conss.append(consj)
        tk = tipo or "?"
        if tk not in tipo_map:
            tipo_map[tk] = len(tipos)
            tipos.append(tk)
        posts.append([prov, e, trab, hor, mun_map[mk], descr_map[dk], cons_map[ck], tipo_map[tk], is_sscc])

    return {"posts": posts, "muns": muns, "mun_cap": mun_cap, "descrs": descrs,
            "conss": conss, "tipos": tipos, "skipped": skipped, "unknown": unknown}


def parse_aprobados(path):
    with open(path, encoding="cp1252", errors="replace", newline="") as f:
        rows = list(csv.reader(f, delimiter=";"))
    head = [norm(h) for h in rows[0]]
    i_ord = col_index(head, ["ORDEN"])
    i_turno = col_index(head, ["TURNO"])
    i_prov = col_index(head, ["PROVINCIA"])
    if any(x is None for x in [i_ord, i_turno, i_prov]):
        raise RuntimeError("Columnas no encontradas en Aprobados.csv: %s" % head)
    out = []
    for r in rows[1:]:
        if not r or not r[i_ord].strip():
            continue
        try:
            orden = int(r[i_ord].strip())
        except ValueError:
            continue
        prov_n = norm(r[i_prov])
        prov = PROVS.index(prov_n) if prov_n in PROVS else 0
        m = 1 if norm(r[i_turno]).startswith("M") else 0
        # Solo datos no identificativos: (orden, provincia, turnoM). Sin nombres.
        out.append([orden, prov, m])
    out.sort(key=lambda x: x[0])
    return out


def parse_historico_2025(path):
    if not os.path.exists(path):
        print("Aviso: %s no encontrado. Se omitirá el histórico 2025." % path)
        return None
    try:
        with open(path, encoding="latin-1", errors="replace") as f:
            rows = list(csv.reader(f, delimiter=";"))
    except Exception as exc:
        print("Error leyendo %s: %s" % (path, exc))
        return None

    head = [norm(h) for h in rows[0]]
    i_prov = col_index(head, ["PROVINCIA"])
    i_esp = col_index(head, ["ESP"])
    i_dep = col_index(head, ["DEP"])
    i_cen = col_index(head, ["CENTRO"])
    if i_prov is None or i_esp is None:
        return None

    per_prov = {pi: {"total": 0, 2: 0, 3: 0, 4: 0, 6: 0, "sscc": 0, "terr": 0} for pi in range(len(PROVS))}
    total = 0
    for r in rows[1:]:
        if not r or len(r) <= max(i_prov, i_esp):
            continue
        prov_n = norm(r[i_prov])
        if prov_n not in PROVS:
            continue
        pi = PROVS.index(prov_n)
        e = parse_e(r[i_esp])
        dep_str = norm(r[i_dep]) if (i_dep is not None and i_dep < len(r)) else ""
        cen_str = norm(r[i_cen]) if (i_cen is not None and i_cen < len(r)) else ""
        is_sscc = ("SSCC" in dep_str) or ("SERVICIOS CENTRALES" in cen_str)
        per_prov[pi]["total"] += 1
        per_prov[pi][e] += 1
        if is_sscc:
            per_prov[pi]["sscc"] += 1
        else:
            per_prov[pi]["terr"] += 1
        total += 1

    # Calcular ratios de nivel E por provincia
    stats = {"total": total, "perProv": []}
    for pi in range(len(PROVS)):
        st = per_prov[pi]
        tot_p = st["total"] or 1
        stats["perProv"].append({
            "total": st["total"],
            "eCounts": {2: st[2], 3: st[3], 4: st[4], 6: st[6]},
            "eRatios": {2: round(st[2] / tot_p, 4), 3: round(st[3] / tot_p, 4),
                        4: round(st[4] / tot_p, 4), 6: round(st[6] / tot_p, 4)},
            "sscc": st["sscc"],
            "terr": st["terr"]
        })
    return stats


def verify(p, a, h25):
    posts = p["posts"]
    print("== VERIFICACION DE DATOS ==")
    print("Puestos validos: %d   (descartados: %d)" % (len(posts), p["skipped"]))
    if p["unknown"]:
        print("  Provincias desconocidas descartadas: %s" % p["unknown"])
    print("Aprobados: %d   Turno M: %d" % (len(a), sum(x[2] for x in a)))
    e06 = sum(1 for q in posts if q[1] == 6)
    print("E06 globales catálogo: %d (esperado 55)" % e06)
    vll_sscc = sum(1 for q in posts if q[0] == 0 and q[8] == 1)
    print("Valladolid catálogo: %d puestos SSCC, %d territoriales" % (
        vll_sscc, sum(1 for q in posts if q[0] == 0) - vll_sscc))
    if h25:
        print("Histórico 2025: %d plazas analizadas" % h25["total"])
    per_prov = {}
    for q in posts:
        d = per_prov.setdefault(q[0], {2: 0, 3: 0, 4: 0, 6: 0})
        d[q[1]] += 1
    print("%-12s %5s %5s %5s %5s %6s" % ("Provincia", "E06", "E04", "E03", "E02", "Total"))
    for pi, name in enumerate(PROVS):
        d = per_prov.get(pi, {2: 0, 3: 0, 4: 0, 6: 0})
        print("%-12s %5d %5d %5d %5d %6d" % (name, d[6], d[4], d[3], d[2], sum(d.values())))
    z = per_prov.get(IDX_ZAMORA, {})
    esperado = {6: 3, 4: 18, 3: 11}
    ok = all(z.get(k, 0) == v for k, v in esperado.items()) and sum(z.values()) == 130
    print("Zamora: total=%d  E06=%d E04=%d E03=%d E02=%d  -> %s" % (
        sum(z.values()), z.get(6, 0), z.get(4, 0), z.get(3, 0), z.get(2, 0),
        "CORRECTO (esperado 130 = 3/18/11/98)" if ok else "** REVISAR **"))
    return ok


def resolve_data_files():
    """Devuelve (aprobados, puestos, histórico, fuente).

    Usa los CSV reales de la raíz si existen; si no, el dataset sintético de
    datos_demo/ (generándolo si falta). Con --demo se fuerza siempre el sintético.
    """
    force_demo = "--demo" in sys.argv[1:]
    reales = (APROBADOS_CSV, PUESTOS_CSV, HIST_2025_CSV)
    if not force_demo and all(os.path.exists(f) for f in reales):
        return reales + ("CSV reales de la raíz (el resultado NO debe publicarse)",)
    demo = (os.path.join(DEMO_DIR, APROBADOS_CSV),
            os.path.join(DEMO_DIR, PUESTOS_CSV),
            os.path.join(DEMO_DIR, HIST_2025_CSV))
    if not all(os.path.exists(f) for f in demo):
        print("Sin CSV reales en la raíz: generando dataset sintético en %s/" % DEMO_DIR)
        import generar_datos_demo
        generar_datos_demo.main()
    return demo + ("dataset SINTÉTICO de %s/ (demo)" % DEMO_DIR,)


def main():
    f_apr, f_pue, f_hist, fuente = resolve_data_files()
    print("Fuente de datos: %s\n" % fuente)
    p = parse_puestos(f_pue)
    a = parse_aprobados(f_apr)
    h25 = parse_historico_2025(f_hist)
    ok = verify(p, a, h25)
    if not ok:
        print("ADVERTENCIA: el recuento no coincide con el esperado; revisa los CSV.")

    data = {
        "provs": PROVS, "provsDisplay": PROVS_DISPLAY,
        "seatsRPT": SEATS_RPT, "seats2025": SEATS_2025,
        "distMatrix": DIST_MATRIX, "proxMatrix": build_prox_matrix(120.0),
        "stats2025": h25,
        "puestos": p["posts"], "munCap": p["mun_cap"], "muns": p["muns"],
        "descrs": p["descrs"], "conss": p["conss"], "tipos": p["tipos"],
        "aprobados": a, "generado": date.today().strftime("%d/%m/%Y"),
    }

    with open("datos.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    with open("nucleo.js", encoding="utf-8") as f:
        nucleo = f.read()
    with open("charts.js", encoding="utf-8") as f:
        charts = f.read()
    with open("app.js", encoding="utf-8") as f:
        app = f.read()
    with open("template.html", encoding="utf-8") as f:
        tpl = f.read()

    js_data = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = tpl.replace("/*__DATA__*/{}", js_data, 1)
    html = html.replace("<!--NUCLEO-->", "<script>\n" + nucleo + "\n</script>", 1)
    html = html.replace("<!--CHARTS-->", "<script>\n" + charts + "\n</script>", 1)
    html = html.replace("<!--APP-->", "<script>\n" + app + "\n</script>", 1)
    html = html.replace("__FECHA__", data["generado"], 1)

    with open("simulador.html", "w", encoding="utf-8") as f:
        f.write(html)

    print("Escritos: simulador.html (%d KB), datos.json" % (len(html) // 1024))
    print("Siguiente paso: node test_nucleo.js")


if __name__ == "__main__":
    main()
