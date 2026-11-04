# -*- coding: utf-8 -*-
"""
Generador de la web de simulación de destinos (Concurso de Traslados CyL 2026).

Lee:
  - Aprobados.csv                 -> orden de mérito real (362), turno L/M, provincia de examen
  - Relación posibles puestos.csv -> catálogo DEFINITIVO de los 362 puestos convocados
                                    (formato oficial: Código Puesto;Puesto Ofertado;Grupo;Nivel;
                                     ESP;PRV;Adm.;Cuerpo/Escala;Localidad;Prov.;Requisitos;
                                     Características;Código Unidad;Unidad Orgánica;
                                     Jerarquía Orgánica;Página PDF)
  - nucleo.js / charts.js / app.js / template.html -> piezas de la web

Escribe:
  - simulador.html -> web autocontenida (offline, doble clic)
  - datos.json     -> datos para las pruebas de Node

El catálogo es la oferta definitiva: no hay recorte, ni muestreo de subconjuntos,
ni escenarios calibrados con el histórico de 2025.

Uso:
  python generar_web.py           -> web con los datos reales
  python generar_web.py --demo    -> web con los datos sintéticos de datos_demo/
                                     (misma distribuciones agregadas, sin datos personales;
                                      usado por el workflow de GitHub Pages)
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

PROVS = ["VALLADOLID", "LEON", "BURGOS", "SALAMANCA", "SEGOVIA", "ZAMORA", "AVILA", "PALENCIA", "SORIA"]
PROVS_DISPLAY = ["Valladolid", "León", "Burgos", "Salamanca", "Segovia", "Zamora", "Ávila", "Palencia", "Soria"]
# Códigos INE de provincia usados por la columna "Prov." del CSV oficial
INE_PROV = {"47": "VALLADOLID", "24": "LEON", "09": "BURGOS", "37": "SALAMANCA",
            "40": "SEGOVIA", "49": "ZAMORA", "05": "AVILA", "34": "PALENCIA", "42": "SORIA"}

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
    """Parsea el catálogo definitivo (formato de la Resolución de convocatoria).

    La localización de columnas es POR NOMBRE de cabecera, por lo que el orden
    de los campos del CSV es indiferente.
    """
    # La relación definitiva está codificada en CP850 (página DOS): ó=0xA2, í=0xA1, á=0xA0
    with open(path, encoding="cp850", errors="replace", newline="") as f:
        rows = list(csv.reader(f, delimiter=";"))
    head = [norm(h) for h in rows[0]]
    i_esp = col_index(head, ["ESP"])                # Complemento Específico (E06..E02)
    i_prov = col_index(head, ["PROV."])             # Código INE de provincia
    i_loc = col_index(head, ["LOCALIDAD"])
    i_req = col_index(head, ["REQUISITOS"])         # Contiene "Función FCA0xx" / "horario especial"
    i_nombre = col_index(head, ["PUESTO OFERTADO"])
    i_unidad = col_index(head, ["UNIDAD ORGANICA"]) # Destino concreto
    i_jerar = col_index(head, ["JERARQUIA"])        # "CONSEJERIA ... > D.G. ... > SERVICIO ..."
    needed = [i_esp, i_prov, i_loc, i_req, i_nombre, i_unidad, i_jerar]
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
        prov_n = INE_PROV.get(r[i_prov].strip())
        if prov_n is None:
            skipped += 1
            key = r[i_prov].strip() or "(vacio)"
            unknown[key] = unknown.get(key, 0) + 1
            continue
        prov = PROVS.index(prov_n)
        e = parse_e(r[i_esp])
        mun = r[i_loc].strip() or prov_n
        loc = mun
        fun = norm(r[i_req])
        m_fca = re.search(r"FCA\s*(\d{3})", fun)
        tipo = ("CA" + m_fca.group(1)) if m_fca else ""
        nombre = r[i_nombre].strip()
        descr = r[i_unidad].strip() or nombre
        jerar = r[i_jerar].strip()
        consj = jerar.split(">")[0].strip()

        texto = norm(nombre + " " + descr + " " + mun + " " + loc) + " " + fun + " " + norm(jerar)
        if "RESIDENC" in texto:
            trab = 2  # residencias / turnos
        elif tipo == "CA033":
            trab = 1  # atención al público
        else:
            trab = 0  # oficina interna
        hor = 1 if "HORARIO ESPECIAL" in fun else 0

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
    i_nom = col_index(head, ["APELLIDOS"])
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
        nombre = r[i_nom].strip() if (i_nom is not None and i_nom < len(r)) else ""
        out.append([orden, prov, m, nombre])
    out.sort(key=lambda x: x[0])
    return out


def verify(p, a):
    posts = p["posts"]
    print("== VERIFICACION DE DATOS ==")
    print("Puestos validos: %d   (descartados: %d)" % (len(posts), p["skipped"]))
    if p["unknown"]:
        print("  Provincias desconocidas descartadas: %s" % p["unknown"])
    print("Aprobados: %d   Turno M: %d" % (len(a), sum(x[2] for x in a)))
    per_prov = {}
    e_glob = {2: 0, 3: 0, 4: 0, 6: 0}
    for q in posts:
        d = per_prov.setdefault(q[0], {2: 0, 3: 0, 4: 0, 6: 0})
        d[q[1]] += 1
        e_glob[q[1]] += 1
    print("Niveles E del catalogo: E06=%d E04=%d E03=%d E02+vacias=%d" % (
        e_glob[6], e_glob[4], e_glob[3], e_glob[2]))
    print("%-12s %5s %5s %5s %5s %6s" % ("Provincia", "E06", "E04", "E03", "E02", "Total"))
    for pi, name in enumerate(PROVS):
        d = per_prov.get(pi, {2: 0, 3: 0, 4: 0, 6: 0})
        print("%-12s %5d %5d %5d %5d %6d" % (name, d[6], d[4], d[3], d[2], sum(d.values())))
    ok = (len(posts) == 362 and p["skipped"] == 0 and len(a) == 362)
    print("Catalogo=%d puestos (esperado 362)  Aprobados=%d (esperado 362)  -> %s" % (
        len(posts), len(a), "CORRECTO" if ok else "** REVISAR **"))
    return ok


def main():
    demo = "--demo" in sys.argv
    base = os.path.join("datos_demo") if demo else ""
    p = parse_puestos(os.path.join(base, PUESTOS_CSV))
    a = parse_aprobados(os.path.join(base, APROBADOS_CSV))
    ok = verify(p, a)
    if not ok:
        print("ADVERTENCIA: el recuento no coincide con el esperado; revisa los CSV.")

    data = {
        "provs": PROVS, "provsDisplay": PROVS_DISPLAY,
        "distMatrix": DIST_MATRIX, "proxMatrix": build_prox_matrix(120.0),
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
