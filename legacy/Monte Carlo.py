import numpy as np
import pandas as pd

# Configurar semilla para reproducibilidad
np.random.seed(42)

n_simulations = 10000
user_effective_position = 118  # 117 personas por delante

# Distribución estimada de plazas por provincia (según RPT)
slots_per_province = {
    'VALLADOLID': 94,
    'LEON': 52,
    'BURGOS': 42,
    'SALAMANCA': 40,
    'SEGOVIA': 29,
    'ZAMORA': 28,
    'AVILA': 26,
    'PALENCIA': 26,
    'SORIA': 25
}

provinces_list = list(slots_per_province.keys())
# Ponderación estimada de procedencia de los candidatos
candidate_weights = [0.25, 0.15, 0.12, 0.14, 0.06, 0.08, 0.06, 0.07, 0.07]
candidate_weights = np.array(candidate_weights) / sum(candidate_weights)

zamora_success_count = 0
zamora_slots_remaining_list = []

print("Ejecutando simulación de Monte Carlo (10.000 escenarios)...")

for _ in range(n_simulations):
    current_slots = slots_per_province.copy()
    
    # Generar provincia de origen simulada para los 362 aspirantes
    all_candidates_provs = np.random.choice(provinces_list, size=362, p=candidate_weights)
    
    # Simular elección de los 117 aspirantes anteriores
    for i in range(user_effective_position - 1):
        home = all_candidates_provs[i]
        if current_slots[home] > 0:
            current_slots[home] -= 1
        else:
            available_provs = [p for p, count in current_slots.items() if count > 0]
            if available_provs:
                chosen = available_provs[0]
                current_slots[chosen] -= 1

    zamora_left = current_slots['ZAMORA']
    zamora_slots_remaining_list.append(zamora_left)
    if zamora_left > 0:
        zamora_success_count += 1

probability_success = (zamora_success_count / n_simulations) * 100
mean_zamora_left = np.mean(zamora_slots_remaining_list)
min_zamora_left = np.min(zamora_slots_remaining_list)

print("\n--- RESULTADOS DE LA SIMULACIÓN ---")
print(f"Probabilidad de que queden plazas en Zamora en tu turno (118): {probability_success:.2f}%")
print(f"Media de plazas libres en Zamora al llegar tu turno: {mean_zamora_left:.1f}")
print(f"Mínimo de plazas libres en Zamora en el peor escenario: {min_zamora_left}")