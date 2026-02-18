from speak import speak
from think_with_ollama import think

current_state = "idle"

def set_state(state):
    global current_state
    print(f"🧠 STATE → {state}")
    current_state = state

def get_state():
    return current_state


def detect_emotion(text: str) -> str:
    text = text.lower()

    if any(w in text for w in ["great", "awesome", "nice", "happy", "love"]):
        return "happy"

    if any(w in text for w in ["think", "hmm", "let me", "consider"]):
        return "thinking"

    return "neutral"

def process_user_text(user_text: str) -> dict:
    # 🧠 THINKING
    set_state("thinking")
    response_text = think(user_text)

    emotion = detect_emotion(response_text)

    # 🗣️ SPEAKING
    set_state("speaking")
    speak(response_text)

    # 😌 BACK TO IDLE
    set_state("idle")

    return {
        "text": response_text,
        "emotion": emotion,
        "state": get_state(),
        "audio_url": "http://localhost:8000/audio"
    }

