# -*- coding: utf-8 -*-
"""
Generador de DATOS SINTÉTICOS de demostración (100 % ficticios, sin datos personales).

Produce en datos_demo/ tres CSV con el MISMO formato que los ficheros reales
(Aprobados.csv, Relación posibles puestos.csv, 2025.csv) y con las mismas
distribuciones AGREGADAS (nº de aprobados por provincia, turno M, puestos por
provincia y nivel E, SSCC de Valladolid, plazas del histórico 2025), de modo que
el pipeline completo (generar_web.py, tests, demo) funciona igual que con los
datos reales… sin contener ni un solo dato personal.

Los nombres son deliberadamente ficticios ("DEMO 001, OPOSITOR/A").
Semilla fija => salida reproducible.

Uso:  python generar_datos_demo.py
"""

import csv
import os
import random

SEED = 2026
OUT_DIR = "datos_demo"

PROVS = ["VALLADOLID", "LEON", "BURGOS", "SALAMANCA", "SEGOVIA",
         "ZAMORA", "AVILA", "PALENCIA", "SORIA"]
PROVS_CAP = ["Valladolid", "León", "Burgos", "Salamanca", "Segovia",
             "Zamora", "Ávila", "Palencia", "Soria"]

# ---- Distribuciones agregadas replicadas de la convocatoria real ----

# Aprobados por provincia (índice = PROVS). Total 362.
APROB_POR_PROV = [118, 47, 37, 62, 20, 30, 13, 21, 14]
# Posiciones (1-based) de los 11 aprobados de turno M.
M_POS = {41, 59, 65, 108, 156, 260, 358, 359, 360, 361, 362}

# Catálogo por provincia: (E06, E04, E03, E02). Totales 55/88/143/1350 = 1636.
PUESTOS_POR_PROV = [
    (6, 5, 38, 377),    # Valladolid -> 426 (279 de ellos SSCC)
    (8, 13, 18, 196),   # León      -> 235
    (9, 11, 12, 159),   # Burgos    -> 191
    (10, 11, 17, 142),  # Salamanca -> 180
    (3, 9, 11, 107),    # Segovia   -> 130
    (3, 18, 11, 98),    # Zamora    -> 130
    (6, 9, 15, 84),     # Ávila     -> 114
    (5, 7, 10, 96),     # Palencia  -> 118
    (5, 5, 11, 91),     # Soria     -> 112
]
SSCC_VALLADOLID = 279

# Histórico 2025 por provincia: (E06, E04, E03, E02, n_sSCC, n_territorial).
# Totales: 19/34/52/275 = 380 plazas.
HIST2025 = [
    (3, 4, 24, 102, 81, 52),  # Valladolid 133
    (1, 3, 8, 28, 1, 39),     # León 40
    (3, 5, 4, 27, 0, 39),     # Burgos 39
    (2, 9, 3, 17, 0, 31),     # Salamanca 31
    (3, 5, 3, 18, 0, 29),     # Segovia 29
    (2, 2, 3, 22, 1, 28),     # Zamora 29
    (2, 2, 4, 27, 1, 34),     # Ávila 35
    (1, 2, 2, 20, 0, 25),     # Palencia 25
    (2, 2, 1, 14, 1, 18),     # Soria 19
]

MUNICIPIOS = [
    ["Valladolid", "Medina del Campo", "Laguna de Duero", "Arroyo de la Encomienda",
     "Tudela de Duero", "Olmedo", "Peñafiel", "Tordesillas", "Cigales", "Villalón"],
    ["León", "Ponferrada", "Astorga", "Villaquilambre", "San Andrés del Rabanedo",
     "La Bañeza", "Villablino", "Cistierna"],
    ["Burgos", "Miranda de Ebro", "Aranda de Duero", "Briviesca", "Medina de Pomar",
     "Lerma", "Salas de los Infantes"],
    ["Salamanca", "Ciudad Rodrigo", "Béjar", "Vitigudino", "Peñaranda de Bracamonte",
     "Santa Marta de Tormes", "Alba de Tormes"],
    ["Segovia", "Cuéllar", "Sepúlveda", "Riaza", "Cantalejo", "Palazuelos de Eresma"],
    ["Zamora", "Benavente", "Toro", "Puebla de Sanabria", "Villalpando", "Fermoselle"],
    ["Ávila", "Arévalo", "Arenas de San Pedro", "Sotillo de la Adrada", "Candeleda",
     "El Barco de Ávila"],
    ["Palencia", "Aguilar de Campoo", "Guardo", "Cervera de Pisuerga",
     "Herrera de Pisuerga", "Carrión de los Condes"],
    ["Soria", "Almazán", "El Burgo de Osma", "Medinaceli", "Ólvega", "Ágreda"],
]

CONSEJERIAS = [
    "ECONOMÍA Y HACIENDA",
    "AGRICULTURA, GANADERÍA Y DESARROLLO RURAL",
    "INDUSTRIA, COMERCIO Y EMPLEO",
    "MOVILIDAD Y TRANSFORMACIÓN DIGITAL",
    "SANIDAD",
    "EDUCACIÓN",
    "FOMENTO Y MEDIO AMBIENTE",
    "CULTURA Y TURISMO",
    "PRESIDENCIA",
]

DIRECCIONES_GENERALES = [
    "DIRECCIÓN GENERAL DE PRESUPUESTOS",
    "DIRECCIÓN GENERAL DE FUNCIÓN PÚBLICA",
    "DIRECCIÓN GENERAL DE TELECOMUNICACIONES",
    "DIRECCIÓN GENERAL DE INDUSTRIA",
    "DIRECCIÓN GENERAL DE AGRICULTURA Y GANADERÍA",
    "DIRECCIÓN GENERAL DE COMERCIO",
    "DIRECCIÓN GENERAL DE SALUD PÚBLICA",
    "DIRECCIÓN GENERAL DE POLÍTICA TERRITORIAL",
    "DIRECCIÓN GENERAL DE VIVIENDA",
]

COMP = {6: "E06", 4: "E04", 3: "E03", 2: ""}


def wpath(name):
    return os.path.join(OUT_DIR, name)


def fmt_puntos(x):
    s = ("%.4f" % x).rstrip("0").rstrip(".")
    return s.replace(".", ",") if s else "0"


def write_aprobados(rng):
    """Aprobados.csv sintético: 362 filas, provincias y turno M exactos."""
    # Lista de provincias con los conteos exactos, barajada -> orden de mérito.
    provs = []
    for pi, n in enumerate(APROB_POR_PROV):
        provs.extend([pi] * n)
    rng.shuffle(provs)

    rows = []
    for i, pi in enumerate(provs, start=1):
        pts = max(50.0, 96.875 - (i - 1) * 0.102 + rng.uniform(-0.2, 0.2))
        fis = "***%04d**" % rng.randrange(1000, 9999)
        ap, nom = "DEMO %03d" % i, "OPOSITOR/A"
        rows.append([i, fis, "%s, %s" % (ap, nom), ap, nom,
                     "M" if i in M_POS else "L", fmt_puntos(pts), PROVS[pi]])

    with open(wpath("Aprobados.csv"), "w", encoding="cp1252", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Nº Orden", "Id. Fiscal", "Apellidos y Nombre", "Apellidos",
                    "Nombre", "Turno", "Puntuación Final", "Provincia examen"])
        w.writerows(rows)
    return rows


def write_puestos(rng):
    """Catálogo sintético: 1636 filas con conteos exactos por provincia/nivel.
    En Valladolid, 279 puestos de Servicios Centrales y 147 territoriales."""
    used_codes, rows = set(), []
    codigos = set()
    for pi, (e06, e04, e03, e02) in enumerate(PUESTOS_POR_PROV):
        niveles = [6] * e06 + [4] * e04 + [3] * e03 + [2] * e02
        rng.shuffle(niveles)
        n_sscc = SSCC_VALLADOLID if pi == 0 else 0
        for k, e in enumerate(niveles):
            sscc = pi == 0 and k < n_sscc
            consj = rng.choice(CONSEJERIAS)
            if sscc:
                ua1 = "SECRETARÍA GENERAL"
                ua2 = rng.choice(DIRECCIONES_GENERALES)
            else:
                ua1 = "SECRETARÍA GENERAL"
                ua2 = "SERVICIO TERRITORIAL DE %s EN %s" % (
                    consj.split(",")[0].title(), PROVS_CAP[pi].upper())
            descr = ua2

            # Tipo de puesto y funciones (determina trab/hor en el parseador).
            ca33 = (e in (2, 3) and rng.random() < 0.18)
            tipo = "CA033" if ca33 else "CA032"
            nombre = "Auxiliar de Atención e Información" if ca33 else "Auxiliar"
            funcs = ("FCA033 Función FCA033   IRC000   INFORMACIÓN, REGISTRO Y COMPULSAS"
                     if ca33 else "FCA032   Función FCA032")
            if e == 6 or rng.random() < 0.02:
                funcs += "   643000   HORARIO ESPECIAL"
            if (not sscc) and rng.random() < 0.03:
                descr = "RESIDENCIA Y CENTRO DE DÍA DE %s" % (
                    rng.choice(MUNICIPIOS[pi]).upper())

            # Municipio: capital más frecuentemente (como en el catálogo real).
            mun = (PROVS_CAP[pi] if rng.random() < 0.55
                   else rng.choice(MUNICIPIOS[pi]))
            loc = mun

            cod = rng.randrange(10000, 99999)
            while cod in codigos:
                cod = rng.randrange(10000, 99999)
            codigos.add(cod)

            rows.append([
                "CONSEJERIA DE " + consj, ua1, ua2, "", "", descr, cod, nombre,
                tipo, "DG001", "CO", "15", "C2", COMP[e], "A1", "", "", "", "R",
                PROVS[pi], mun, loc, funcs, "", "",
            ])

    rng.shuffle(rows)
    with open(wpath("Relación posibles puestos.csv"), "w", encoding="cp1252",
              newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Consejería", "Unidad Administrativa 1", "Unidad Administrativa 2",
                    "Unidad Administrativa 3", "Unidad Administrativa 4",
                    "Descr. Organo de Dependencia", "Puesto", "Nombre del Puesto",
                    "Puesto Tipo", "Cuerpo Puesto", "Forma Provisión", "Nivel",
                    "Grupo/Subgrupo", "Complemento Específico", "Tipo Administración",
                    "Forma de Ocupación", "Cuerpo/Conv. del ocupante",
                    "Especialidad/Categoría del Ocupante", "Estado del Puesto",
                    "Provincia", "Municipio", "Localidad", "Funciones",
                    "Experiencia Profesional", "Prom. Interna"])
        w.writerows(rows)
    return rows


def write_hist2025(rng):
    """2025.csv sintético: 380 filas con conteos exactos por provincia/nivel
    y reparto SSCC/territorial."""
    rows = []
    for pi, (e06, e04, e03, e02, n_sscc, n_terr) in enumerate(HIST2025):
        niveles = [6] * e06 + [4] * e04 + [3] * e03 + [2] * e02
        rng.shuffle(niveles)
        for k, e in enumerate(niveles):
            sscc = k < n_sscc
            dep = "SSCC" if sscc else "TERRITORIAL"
            cen = ("SERVICIOS CENTRALES · " + rng.choice(DIRECCIONES_GENERALES)
                   if sscc else
                   "SERVICIO TERRITORIAL DE %s" % rng.choice(CONSEJERIAS).split(",")[0].title())
            rows.append({
                "ESP": COMP[e], "DEP": dep, "PROV": PROVS[pi],
                "LOC": PROVS_CAP[pi], "CENTRO": cen, "SSCC": sscc,
            })
    rng.shuffle(rows)

    with open(wpath("2025.csv"), "w", encoding="cp1252", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["PUESTO", "DENOMINACION", "GR", "NV", "ESP", "CUERPO_PTO",
                    "TIPO_ADMON", "DEP. GEOGRAFICA", "PROVINCIA", "LOCALIDAD",
                    "CONSEJERIA", "NIVEL2_RPT", "CENTRO", "UND_ORG_DIRECTA",
                    "GRADO_ESTUDIOS", "TITULACION", "ESPECIALIDAD", "FUNCIONES",
                    "MERITOS_ESP", "NOMBRE Y APELLIDOS", "COD", "Nº Orden"])
        for i, r in enumerate(rows, start=1):
            w.writerow([
                rng.randrange(10000, 99999), "Auxiliar", "C2", "15", r["ESP"],
                "DG001", "A1", r["DEP"], r["PROV"], r["LOC"],
                rng.choice(CONSEJERIAS).title(), "", r["CENTRO"],
                r["CENTRO"], "", "", "",
                "FCA032   Función FCA032", "",
                "ADJUDICATARIO/A DEMO %03d" % i, rng.randrange(10000, 99999), i,
            ])
    return rows


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    rng = random.Random(SEED)

    a = write_aprobados(rng)
    p = write_puestos(rng)
    h = write_hist2025(rng)

    print("== DATOS SINTÉTICOS GENERADOS en %s/ ==" % OUT_DIR)
    print("Aprobados : %d (Turno M: %d)" % (len(a), len(M_POS)))
    print("Puestos   : %d (E06: %d)" % (
        len(p), sum(1 for r in p if r[13] == "E06")))
    print("Histórico : %d plazas" % len(h))
    assert len(a) == 362 and len(p) == 1636 and len(h) == 380
    print("Sin datos personales: nombres ficticios (DEMO nnn / OPOSITOR/A).")


if __name__ == "__main__":
    main()
