from data.dlsa_offices import DLSA_OFFICES

def get_dlsa(state: str) -> dict:
    state = state.strip().lower().replace("_", " ")
    for key, office in DLSA_OFFICES.items():
        if key.lower().replace("_", " ") == state:
            return office
    return None

def get_all_states() -> list:
    return list(DLSA_OFFICES.keys())

def search_dlsa(query: str) -> list:
    query = query.strip().lower()
    results = []
    for state, office in DLSA_OFFICES.items():
        if query in state.lower() or query in office.get("city", "").lower():
            results.append({
                "state": state,
                **office
            })
    return results