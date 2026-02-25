import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from almosthuman_brain import process_user_text
from listen_and_transcribe_vosk import process_audio   # 👈 THIS LINE MUST EXIST
from fastapi.staticfiles import StaticFiles
from brain_state import get_state,BrainState


# Async Socket.IO server.
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
app = FastAPI()

# 🔥 Mount static folder
app.mount("/static", StaticFiles(directory="static"), name="static")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

socket_app = socketio.ASGIApp(sio, app)


@sio.event
async def connect(sid, environ):
    print("Client connected:", sid)


@sio.event
async def audio_chunk(sid, data):
    if get_state() == BrainState.THINKING:
        return
    print("📥 Received audio chunk")
    # You will call STT here (from stt.py)
    text = await process_audio(data)

    if text:
        print("🎤 USER SAID:", text)
        response = await process_user_text(text)
        await sio.emit("ai_response", response, to=sid)


@sio.event
async def disconnect(sid):
    print("Client disconnected:", sid)
