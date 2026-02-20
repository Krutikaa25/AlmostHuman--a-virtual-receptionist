import os
import json
import asyncio
from vosk import Model, KaldiRecognizer
from brain_state import set_state, BrainState


# Absolute model path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "vosk-model-en-in-0.5")

print("🔍 Loading Vosk model from:", MODEL_PATH)

model = Model(MODEL_PATH)
recognizer = KaldiRecognizer(model, 16000)



def blocking_transcribe(data):
    global recognizer

    if recognizer.AcceptWaveform(data):
        result = json.loads(recognizer.Result())
        text = result.get("text", "").strip().lower()

        if text:
            print("🎤 FINAL:", text)
            recognizer = KaldiRecognizer(model, 16000)
            return text

    return None






async def process_audio(data):
    loop = asyncio.get_running_loop()
    text = await loop.run_in_executor(None, blocking_transcribe, data)
    return text
