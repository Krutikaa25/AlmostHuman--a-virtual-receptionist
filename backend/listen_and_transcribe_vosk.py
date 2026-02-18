import wave
import json
import os
from vosk import Model, KaldiRecognizer
from brain_state import set_state, BrainState


# ALWAYS resolve absolute path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "vosk-model-en-in-0.5")


print("🔍 Loading Vosk model from:", MODEL_PATH)

model = Model(MODEL_PATH)


def transcribe_file(wav_path: str) -> str:
    set_state(BrainState.LISTENING) 
    
    wf = wave.open(wav_path, "rb")

    recognizer = KaldiRecognizer(model, wf.getframerate())
    recognizer.SetWords(True)

    while True:
        data = wf.readframes(4000)
        if len(data) == 0:
            break
        recognizer.AcceptWaveform(data)

    result = json.loads(recognizer.FinalResult())

    set_state(BrainState.THINKING) 
    return result.get("text", "")
