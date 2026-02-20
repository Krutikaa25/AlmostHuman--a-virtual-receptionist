from speak import speak
from think_with_ollama import think
from brain_state import set_state, BrainState


def detect_emotion(text: str) -> str:
    text = text.lower()

    if any(w in text for w in ["great", "awesome", "nice", "happy", "love"]):
        return "happy"

    if any(w in text for w in ["think", "hmm", "let me", "consider"]):
        return "thinking"

    return "neutral"

async def process_user_text(user_text: str) -> dict:

    # 🧠 THINKING
    set_state(BrainState.THINKING)
    response_text =await think(user_text)

    emotion = detect_emotion(response_text)

    # 🗣️ SPEAKING
    set_state(BrainState.SPEAKING)
    import asyncio
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, speak, response_text)

    # 😌 BACK TO IDLE
    set_state(BrainState.IDLE)

    import time

    return {
        "text": response_text,
        "emotion": emotion,
        "state": set_state().value,
        "audio_url": f"http://localhost:8000/static/output.wav?t={int(time.time())}"

    }

