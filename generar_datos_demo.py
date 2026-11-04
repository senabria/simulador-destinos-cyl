# -*- coding: utf-8 -*-
"""
Generador de DATOS SINTÉTICOS de demostración (100 % ficticios, sin datos personales).

Produce en datos_demo/ dos CSV con el MISMO formato que los ficheros reales:
  - Aprobados.csv                  -> formato oficial (cp1252)
  - Relación posibles puestos.csv  -> formato DEFINITIVO de la Resolución (cp850),
     16 columnas: Código Puesto;Puesto Ofertado;Grupo;Nivel;ESP;PRV;Adm.;
     Cuerpo/Escala;Localidad;Prov.;Requisitos;Características;Código Unidad;
     Unidad Orgánica;Jerarquía Orgánica;Página PDF

Y con las mismas distribuciones AGREGADAS del catálogo definitivo (362 puestos:
VLL 103 / LEÓN 45 / BURGOS 39 / SAL 31 / SEGOVIA 32 / ZAMORA 24 / ÁVILA 31 /
PALENCIA 33 / SORIA 24; E06=15, E04=19, E03=30, E02=298 —incluidas las celdas
ESP vacías—, más 31 puestos "Otros Cuerpos Similares" A5), de modo que el
pipeline completo (generar_web.py --demo, tests, demo en GitHub Pages) funciona
igual que con los datos reales… sin contener ni un solo dato personal.

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
INE = ["47", "24", "09", "37", "40", "49", "05", "34", "42"]

# ---- Distribuciones agregadas replicadas de la convocatoria real ----

# Aprobados por provincia (índice = PROVS). Total 362.
APROB_POR_PROV = [118, 47, 37, 62, 21, 30, 13, 21, 13]
# Posiciones (1-based) de los 11 aprobados de turno M.
M_POS = {41, 59, 65, 108, 156, 260, 358, 359, 360, 361, 362}

# Catálogo DEFINITIVO por provincia: (E06, E04, E03, E02). Total 362.
# Las celdas E02 se generan con ESP vacío (el parseador las cuenta como E02).
PUESTOS_POR_PROV = [
    (2, 1, 12, 88),   # Valladolid -> 103
    (1, 0, 3, 41),    # León       -> 45
    (3, 4, 0, 32),    # Burgos     -> 39
    (2, 3, 3, 23),    # Salamanca  -> 31
    (1, 4, 4, 23),    # Segovia    -> 32
    (0, 1, 2, 21),    # Zamora     -> 24
    (2, 3, 4, 22),    # Ávila      -> 31
    (4, 1, 1, 27),    # Palencia   -> 33
    (0, 2, 1, 21),    # Soria      -> 24
]
# Puestos "Otros Cuerpos Similares" (Adm. A5) por provincia. Total 31.
A5_POR_PROV = [1, 2, 6, 4, 4, 5, 4, 3, 2]
# Puestos de Servicios Centrales de Valladolid (sin keywords territoriales).
SSCC_VALLADOLID = 14

MUNICIPIOS = [
    ["Valladolid", "Medina del Campo", "Laguna de Duero", "Arroyo",
     "Tudela de Duero", "Olmedo", "Peñafiel", "Tordesillas", "Cigales", "Arroyo"],
    ["León", "Ponferrada", "Astorga", "Villaquilambre", "León",
     "La Bañeza", "Villablino", "Cistierna"],
    ["Burgos", "Miranda de Ebro", "Aranda de Duero", "Briviesca", "Burgos",
     "Lerma", "Salas de los Infantes"],
    ["Salamanca", "Ciudad Rodrigo", "Béjar", "Vitigudino", "Salamanca",
     "Santa Marta de Tormes", "Alba de Tormes"],
    ["Segovia", "Cuéllar", "Sepúlveda", "Riaza", "Segovia",
     "Palazuelos de Eresma"],
    ["Zamora", "Benavente", "Toro", "Puebla de Sanabria", "Zamora",
     "Fermoselle"],
    ["Ávila", "Arévalo", "Ávila", "Sotillo de la Adrada", "Candeleda",
     "El Barco de Ávila"],
    ["Palencia", "Aguilar de Campoo", "Guardo", "Cervera de Pisuerga",
     "Palencia", "Carrión de los Condes"],
    ["Soria", "Almazán", "El Burgo de Osma", "Medinaceli", "Soria", "Ágreda"],
]

CONSEJERIAS = [
    "ECONOMIA Y HACIENDA",
    "AGRICULTURA, GANADERIA Y DESARROLLO RURAL",
    "INDUSTRIA, COMERCIO Y EMPLEO",
    "MOVILIDAD Y TRANSFORMACION DIGITAL",
    "SANIDAD",
    "EDUCACION",
    "FAMILIA E IGUALDAD DE OPORTUNIDADES",
    "CULTURA, TURISMO Y DEPORTE",
    "PRESIDENCIA",
]

# Cabecera EXACTA del formato definitivo (se escribe en cp850, como el real).
CABECERA_PUESTOS = ["Código Puesto", "Puesto Ofertado", "Grupo", "Nivel", "ESP",
                    "PRV", "Adm.", "Cuerpo/Escala", "Localidad", "Prov.",
                    "Requisitos", "Características", "Código Unidad",
                    "Unidad Orgánica", "Jerarquía Orgánica", "Página PDF"]

ESP_TXT = {6: "E06", 4: "E04", 3: "E03", 2: ""}


def wpath(name):
    return os.path.join(OUT_DIR, name)


def fmt_puntos(x):
    s = ("%.4f" % x).rstrip("0").rstrip(".")
    return s.replace(".", ",") if s else "0"


def write_aprobados(rng):
    """Aprobados.csv sintético: 362 filas, provincias y turno M exactos (cp1252)."""
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
    """Catálogo sintético al formato DEFINITIVO: 362 filas (cp850)."""
    rows = []
    for pi, (e06, e04, e03, e02) in enumerate(PUESTOS_POR_PROV):
        niveles = [6] * e06 + [4] * e04 + [3] * e03 + [2] * e02
        rng.shuffle(niveles)
        n_sscc = SSCC_VALLADOLID if pi == 0 else 0
        n_a5 = A5_POR_PROV[pi]
        total_prov = len(niveles)

        for k, e in enumerate(niveles):
            sscc = pi == 0 and k < n_sscc
            a5 = k >= (total_prov - n_a5)
            adm = "A5" if a5 else "A1"
            cuerpo = ("Otros Cuer Sim al Cuerpo Auxiliar C. Auxiliar" if a5
                      else "C. Auxiliar")
            consj = rng.choice(CONSEJERIAS)
            if sscc:
                uo = rng.choice(["SECRETARIA GENERAL", "SERVICIO DE PERSONAL",
                                 "SERVICIO DE INSPECCION Y APOYO",
                                 "DIRECCION GENERAL DE FUNCION PUBLICA"])
                jerar = "CONSEJERIA DE %s > SECRETARIA GENERAL > %s" % (consj, uo)
            else:
                uo = "SERVICIO TERRITORIAL DE %s DE %s" % (
                    consj.title(), PROVS_CAP[pi].upper())
                jerar = "CONSEJERIA DE %s > SECRETARIA GENERAL > %s" % (consj, uo)
            descr = uo

            # Tipo de puesto y funciones (determina trab/hor en el parseador).
            ca33 = (e in (2, 3) and rng.random() < 0.2)
            nombre = "Auxiliar de Atención e Información" if ca33 else (
                "Auxiliar Tipo 1" if rng.random() < 0.2 else "Auxiliar")
            req = ("Función FCA033" if ca33 else
                   "Función FCA034" if nombre.endswith("1") else "Función FCA032")
            if rng.random() < 0.08:
                req += " horario especial"

            # Municipio: capital más frecuentemente (como en el catálogo real).
            mun = (PROVS_CAP[pi] if rng.random() < 0.55
                   else rng.choice(MUNICIPIOS[pi]))

            cod = "1%07d" % rng.randrange(0, 9999999)
            pagina = rng.randrange(10, 80)
            esp = ESP_TXT[e]

            rows.append([
                cod, nombre, "C2", "15", esp, "CO", adm, cuerpo,
                mun, INE[pi], req, req, "0001%04d" % rng.randrange(0, 9999),
                uo, jerar, pagina,
            ])

    rng.shuffle(rows)
    with open(wpath("Relación posibles puestos.csv"), "w", encoding="cp850",
              newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(CABECERA_PUESTOS)
        w.writerows(rows)
    return rows


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    rng = random.Random(SEED)

    a = write_aprobados(rng)
    p = write_puestos(rng)

    print("== DATOS SINTÉTICOS GENERADOS en %s/ ==" % OUT_DIR)
    print("Aprobados : %d (Turno M: %d)" % (len(a), len(M_POS)))
    print("Puestos   : %d (E06: %d, A5: %d)" % (
        len(p),
        sum(1 for r in p if r[4] == "E06"),
        sum(1 for r in p if r[6] == "A5")))
    assert len(a) == 362 and len(p) == 362
    print("Sin datos personales: nombres ficticios (DEMO nnn / OPOSITOR/A).")


if __name__ == "__main__":
    main()
