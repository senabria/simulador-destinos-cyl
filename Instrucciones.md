# 📖 Instrucciones y referencia de controles — Simulador de destinos CyL 2026

Guía de consulta de todos los controles de `simulador.html`. El simulador es un Monte Carlo multi-criterio: repite miles de veces el concurso completo (362 aprobados reales eligiendo entre **los 362 puestos definitivos convocados**) y mide con qué probabilidad te queda plaza en tu provincia.

---

## 🔁 Cómo funciona una simulación (visión general)

```mermaid
flowchart TD
    A[Catálogo definitivo<br/>362 puestos reales] --> D[Turno 1, 2, 3… 362]
    C[Aprobados.csv<br/>362 en orden de mérito real] --> D
    D --> E{Por cada opositor}
    E -->|15 % configurable| F[✋ Renuncia → no ocupa plaza]
    E -->|85 %| G[Sortea provincia preferida<br/>«Fidelidad» 80 % = su provincia de examen]
    G --> H[Recibe pesos propios ~ sliders<br/>«Pesos de los criterios» vía Dirichlet]
    H --> I[Puntúa cada plaza libre:<br/>U = wProv·(prov==pref) + wSal·salario<br/>+ wMun·capital + wHor·horario + wFun·tipo]
    I --> J[Elige por softmax<br/>«Temperatura»]
    J --> K[Siguiente turno…]
    K --> L[📈 Resultados: P(plaza), IC 95 %,<br/>curva de disponibilidad, ejemplos]
```

**Tú** no usas los pesos ni la fidelidad: en tu turno eliges obligatoriamente la mejor plaza de tu 1ª provincia (o 2ª / la más cercana si activas «Aceptar otra provincia»). Los sliders de comportamiento solo modelan a los **otros 361** opositores, es decir, a tu competencia.

---

## 🌙 Cabecera

| Control | Qué hace |
|---|---|
| **Botón 🌙/☀️** | Alterna tema claro/oscuro. La preferencia se guarda en `localStorage` y, si nunca has elegido, se usa el esquema del sistema operativo. Las gráficas se repintan al cambiar de tema. Al imprimir o exportar a PDF se fuerza el tema claro para legibilidad. |

---

## 📋 Datos y catálogo

| Control | Qué hace |
|---|---|
| **Aprobados.csv** | Sustituye en vivo el listado embebido (orden de mérito, turno L/M, provincia de examen). Requiere columnas ORDEN, TURNO, PROVINCIA. Codificación CP850. |
| **Relación posibles puestos.csv** | Sustituye el catálogo embebido (los 362 puestos definitivos). Formato oficial de la Resolución: PUESTO OFERTADO, ESP, PROV. (código INE), LOCALIDAD, REQUISITOS, UNIDAD ORGÁNICA, JERARQUÍA ORGÁNICA… Las columnas se localizan **por nombre**, por lo que el orden de los campos es indiferente. Codificación CP850. |

> 💡 Ambos CSV van embebidos al generar la web con `python generar_web.py`; los selectores sirven para probar datos nuevos **sin regenerar**. La tabla bajo los selectores muestra el catálogo cargado por provincia y nivel E.

---

## 🎯 Tu perfil

| Control | Rango / defecto | Qué hace |
|---|---|---|
| **Posición en el listado** | 1–362 · 118 | Tu turno de elección en el orden de mérito. |
| **1ª Provincia preferida** | — · Zamora | La provincia cuya disponibilidad se mide. |
| **2ª Provincia preferida** | — | Solo se usa si activas «Aceptar otra provincia». |
| **Nº de simulaciones** | 100–50000 · 3000 | Más sims = estimaciones más estables (el IC 95 % se estrecha). |
| **Semilla aleatoria** | ≥0 · 42 | Misma semilla + mismos parámetros = resultado idéntico (reproducibilidad). Cambiarla da otra «suerte» con las mismas hipótesis. |
| **☑ Aceptar otra provincia** | off | Solo si se agota tu 1ª provincia: pruebas tu 2ª preferida y, si tampoco, la provincia disponible **más cercana físicamente**. Si está apagado y se agota tu 1ª, quedas sin plaza. |

---

## ⚖️ Pesos de los criterios (opositores)

Importancia **media** de cada criterio en la utilidad de los opositores simulados. Cada opositor recibe pesos propios sorteados alrededor de estos valores.

| Control | Defecto | Criterio |
|---|---|---|
| **Provincia** | 40 | Cuánto pesa que el puesto esté en su provincia preferida (ver distinción con «Fidelidad» más abajo). |
| **Salario (nivel E)** | 25 | Peso del nivel de Complemento Específico (E06 > E04 > E03 > E02). |
| **Capital vs comarca** | 15 | Peso de trabajar en capital frente a comarca. |
| **Horario especial** | 10 | Peso del horario especial declarado en la relación de puestos. |
| **Tipo de trabajo** | 10 | Peso de interna vs atención al público vs residencias. |

| Control | Qué hace |
|---|---|
| **Presets de pesos** | *Equilibrado* (20/20/20/20/20), *Solo provincia*, *Solo salario*, *Prov. + salario* (60/40). |
| **Homogeneidad (Dirichlet)** | 1–200 · 30. Qué tan parecidos son todos los opositores entre sí. Bajo = cada uno muy distinto (heterogéneo); alto = clon de la media. |
| **Temperatura (softmax)** | 0–0.5 · 0.1. 0 = cada uno elige siempre su plaza mejor puntuada; alto = decisiones más ruidosas/aleatorias. |

---

## 💰 Utilidad de cada nivel

Valor de cada cosa en la escala 0–1 (o −1…1 en horario). Es la «moneda» con la que se combinan los criterios.

| Control | Defecto | Significado |
|---|---|---|
| **E06 / E04 / E03 / E02** | 1 / 0.66 / 0.33 / 0 | Utilidad de cada nivel de Complemento Específico. |
| **Capital / Comarca** | 1 / 0.4 | Utilidad de ubicación del puesto. |
| **Horario especial** | 0.5 (admite negativo) | Bonus o **castigo** (negativo) al horario especial. |
| **Oficina interna / Atención / Residencias** | 1 / 0.5 / 0.2 | Utilidad de cada tipo de trabajo. |
| **Preferencia SSCC** | 0.5 | Pondera puestos en Servicios Centrales (Valladolid) frente a Territoriales. |

---

## 🧠 Comportamiento de los opositores

| Control | Rango / defecto | Qué hace |
|---|---|---|
| **Fidelidad a su provincia** | 0–100 % · 80 % | Probabilidad de que cada opositor prefiera su **propia provincia de examen**. Con el 20 % restante, su preferencia se sortea (ver siguiente control). |
| **☑ Afinidad geográfica** | on | Si un opositor no es fiel, su provincia preferida se sortea ponderando la **cercanía en km** a su origen. Si se desactiva, se sortea según la distribución de aprobados. |
| **Renuncias (antes de elegir)** | 0–50 % · 15 % | Probabilidad de que cada opositor (nunca tú) renuncie y no ocupe plaza. No hay segunda vuelta en el modelo. |
| **Tratamiento del Turno M** | Igual / Solo E02 / Excluidos | Los 11 aprobados de turno M: comportarse igual que todos, elegir solo puestos E02 (reserva) o desaparecer de la simulación. Ojo: el nº 108 es Turno M con Zamora y te precede. |

### ⭐ Distinción clave: «Fidelidad» vs peso «Provincia»

No son redundantes: actúan en **fases distintas** de la decisión.

| | Fidelidad (🧠) | Peso Provincia (⚖️) |
|---|---|---|
| **Pregunta que responde** | ¿**Cuál** es la provincia preferida de cada opositor? | ¿**Cuánto importa** esa preferencia frente a salario, capital, etc.? |
| **Cuándo actúa** | Antes de mirar puestos: fija `pref` | Al puntuar cada puesto: peso `wProv` de la condición `provincia == pref` |
| **Naturaleza** | Sorteo binario por persona (fiel sí/no) | Peso numérico en la utilidad multi-criterio |

Ejemplos extremos:
- **Fidelidad 100 % + peso Provincia 0**: todos prefieren su provincia de examen, pero eso no influye en su elección (deciden por salario, capital…).
- **Fidelidad 0 % + peso Provincia 40**: nadie es fiel a su provincia (preferencia sorteada por cercanía), pero esa preferencia sorteada pesa un 40 % al elegir.

---

## ▶️ Ejecutar

| Control | Qué hace |
|---|---|
| **🚀 Simular** | Lanza las N simulaciones (por lotes, sin bloquear el navegador). |
| **↺ Valores por defecto** | Restablece todos los controles y limpia la configuración guardada. |
| **Barra de progreso** | Avance de las simulaciones. |

---

## 📈 Resultados

| Elemento | Significado |
|---|---|
| **P(plaza en tu provincia)** | Probabilidad estimada de conseguir plaza en tu 1ª provincia. |
| **IC 95 %** | Intervalo de confianza de Wilson: la probabilidad real está ahí dentro con 95 % de certeza. |
| **Plazas restantes al llegar a tu turno (media)** | Cuántas quedan en tu provincia cuando te toca elegir. |
| **Agotamiento de tu provincia** | Mediana y peor 5 % del turno en que se agota tu provincia. |
| **P(E ≥ 03 \| plaza)** | Si consigues plaza, probabilidad de que sea E03 o mejor. |
| **SSCC vs Territorial** | Reparto de tus plazas entre Servicios Centrales y Territoriales. |
| **Gráfica de niveles** | Distribución de niveles E obtenidos por TI. |
| **Gráfica de ubicación** | Capital / comarca / sin plaza. |
| **Curva de disponibilidad** | P(queda alguna plaza de tu provincia en el turno X); el punto naranja marca tu turno. |
| **Al llegar tu turno quedaban en tu provincia (media)** | Desglose por nivel E (E06/E04/E03/E02) de las plazas que seguían libres cuando te tocaba elegir: cómo se van retirando las más interesantes. |
| **Plazas que se llevaron quienes te precedían** | Ejemplos de plazas de tu provincia de nivel E ≥ 03 elegidas por otros aspirantes antes de tu turno. |
| **Tus plazas obtenidas** | Destinos concretos que te salieron en simulaciones al azar. |
| **📄 Imprimir / Guardar PDF** | Exporta resultados (se fuerza tema claro automáticamente). |
| **📥 Exportar CSV** | Baja un CSV con parámetros y resultados. |

---

## ⚖️ Comparador de escenarios y perfiles

Guarda el resultado de una simulación como **Escenario A** o **B** (p. ej. turno 118 vs 140, o fidelidad 90 % vs 70 %) y compáralos en tabla lado a lado y con las dos curvas de disponibilidad superpuestas. «Limpiar comparación» vacía ambos slots.

---

## 🌪️ Análisis de sensibilidad (tornado)

Mueve **un factor a la vez** (pesos, homogeneidad, fidelidad, renuncias, turno M…) con la misma semilla y muestra cuánto cambia P(plaza en tu 1ª provincia). Barras verdes = valor alto del factor; rojas = valor bajo. La línea vertical es tu resultado base. Es la forma rápida de saber a qué hipótesis es sensible tu resultado y cuáles dan igual.

| Control | Defecto | Significado |
|---|---|---|
| **Simulaciones por factor** | 400 | Más = barras más estables y cálculo más lento. |

---

## 📜 Asunciones del modelo (resumen)

- Orden de mérito, turno y provincia de examen **reales** (Aprobados.csv, 362 aspirantes).
- **Oferta definitiva**: los 362 puestos reales convocados compiten en cada simulación (sin muestreo ni escenarios de recorte).
- Pesos propios por opositor ~ Dirichlet(homogeneidad) sobre 5 criterios.
- Elección entre plazas libres por softmax con la temperatura indicada.
- Renuncias antes de elegir, sin segunda vuelta ni devolución de plazas.
- Tú nunca renuncias y eliges la mejor plaza de tu provincia (u otras si lo activas).
- Limitaciones: sin promoción interna diferenciada, horario especial con un único valor de utilidad.

---

## 🛠️ Mantenimiento (para el propietario del proyecto)

| Tarea | Cómo |
|---|---|
| Actualizar datos embebidos | Sustituir los CSV y ejecutar `python generar_web.py` → regenera `simulador.html` y `datos.json`. |
| Verificar todo | `node test_nucleo.js` (22 pruebas del motor), `node test_headless.js` (9 de interfaz) y `node verificar_web.js` (estructura + rendimiento). |
| Probar datos sin regenerar | Usar los selectores de «📋 Datos y catálogo» en el navegador. |
