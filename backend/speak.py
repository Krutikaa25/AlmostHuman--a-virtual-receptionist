import numpy as np
import soundfile as sf
from piper.voice import PiperVoice
import os

BASE_DIR = os.path.dirname(__file__)
AUDIO_FILE = os.path.join(BASE_DIR, "temp.wav")

voice = PiperVoice.load(
    model_path="../piper_models/en_us-lessac-medium.onnx",
    config_path="../piper_models/en_us-lessac-medium.onnx.json"
)

def speak(text: str):
    if not text.strip():
        return

    audio_chunks = []
    sample_rate = None

    for chunk in voice.synthesize(text):
        print(dir(chunk))
        audio_chunks.extend(chunk.audio_float_array)
        sample_rate = chunk.sample_rate

    audio = np.array(audio_chunks, dtype=np.float32)
    sf.write(AUDIO_FILE, audio, sample_rate)

    print("🔊 Audio written to temp.wav")
