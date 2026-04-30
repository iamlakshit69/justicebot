import requests

data = {
    "session_id": "test_session",
    "analysis": {
        "domain": "test",
        "case_strength_score": 8,
        "message": "test",
        "legal_sections": ["Section 1"]
    },
    "draft": ""
}

res = requests.post("http://127.0.0.1:8080/api/pdf", json=data)
print(res.status_code)
print(res.text)
