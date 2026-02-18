from flask import Flask, send_file
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from almosthuman_brain import process_user_text
from vosk import Model, KaldiRecognizer
import json
import os
from speak import speak

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Load Vosk model once
model = Model("vosk-model-en-us-0.22")


# Keep recognizer global
recognizer = KaldiRecognizer(model, 16000)


@app.route("/audio")
def audio():
    if not os.path.exists("temp.wav"):
        return "Audio not ready", 404
    return send_file("temp.wav", mimetype="audio/wav")


@socketio.on("connect")
def handle_connect():
    print("Client connected")


@socketio.on("audio_chunk")
def handle_audio(data):
    global recognizer

    if recognizer.AcceptWaveform(data):
        result = json.loads(recognizer.Result())
        text = result.get("text", "").strip().lower()

        if text:
            print("Final Text:", text)

            # 🔴 STOP COMMAND
            if text in ["stop", "cancel", "never mind"]:
                emit("stop_audio")

                farewell_text = "It was nice assisting you. Have a great day."
                speak(farewell_text)

                emit("ai_response", {
                    "text": farewell_text,
                    "emotion": "happy",
                    "audio_url": "http://localhost:8000/audio"
                })

            else:
                response = process_user_text(text)
                emit("ai_response", response)

        # 🔥 IMPORTANT: Reset recognizer after final result
        recognizer = KaldiRecognizer(model, 16000)

    else:
        partial = json.loads(recognizer.PartialResult())
        emit("partial_text", partial.get("partial", ""))


@socketio.on("disconnect")
def handle_disconnect():
    print("Client disconnected")


if __name__ == "__main__":
    print("Streaming Vosk server running...")
    socketio.run(app, port=8000)
