import requests

OLLAMA_URL = "http://localhost:11434/api/generate"

SYSTEM_PROMPT = (
    "You are AlmostHuman, a polite, professional virtual receptionist. "
    "Keep responses short, clear, and helpful."
)

def think(user_text):
    payload = {
        "model": "llama3.1",
        "prompt": f"{SYSTEM_PROMPT}\nUser: {user_text}\nAssistant:",
        "stream": False
    }

    response = requests.post(OLLAMA_URL, json=payload)
    response.raise_for_status()

    return response.json()["response"].strip()

