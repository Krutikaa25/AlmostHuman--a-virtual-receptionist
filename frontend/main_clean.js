import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@1.0.0/lib/three-vrm.module.js";
import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

/* ================= SOCKET ================= */
const socket = io("http://localhost:8000", {
  transports: ["websocket"]
});

/* ================= GLOBAL STATE ================= */
let currentState = "idle";
let currentEmotion = "neutral";

/* ================= AUDIO ================= */
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let audioInputContext;
let processor;
let analyser;
let audio;
let mouthOpen = 0;

let speaking = false;
let silenceTimer = null;

/* ================= SOCKET EVENTS ================= */

socket.on("ai_response", (data) => {
  currentState = data.state;
  currentEmotion = data.emotion;
  playAudio(data.audio_url);
});

/* =================== START MIC ================= */

async function startMic() {

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  audioInputContext = new (window.AudioContext || window.webkitAudioContext)();
  await audioInputContext.resume();

  console.log("Mic sample rate:", audioInputContext.sampleRate);

  const source = audioInputContext.createMediaStreamSource(stream);
  processor = audioInputContext.createScriptProcessor(4096, 1, 1);

  // 🔥 silent gain node (no speaker loop)
  const gainNode = audioInputContext.createGain();
  gainNode.gain.value = 0;

  source.connect(processor);
  processor.connect(gainNode);
  gainNode.connect(audioInputContext.destination);

  processor.onaudioprocess = (event) => {

    if (currentState !== "idle") return;

    const inputData = event.inputBuffer.getChannelData(0);

    // Volume detection
    let volume = 0;
    for (let i = 0; i < inputData.length; i++) {
      volume += Math.abs(inputData[i]);
    }
    volume /= inputData.length;

    const downsampled = downsampleBuffer(
      inputData,
      audioInputContext.sampleRate,
      16000
    );

    const pcmData = convertFloatToInt16(downsampled);

    // Speech detected
    if (volume > 0.02) {
      speaking = true;
      socket.emit("audio_chunk", pcmData);

      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }

    } else if (speaking) {
      // Send silence frames so Vosk can finalize
      socket.emit("audio_chunk", pcmData);

      if (!silenceTimer) {
        silenceTimer = setTimeout(() => {
          speaking = false;
          silenceTimer = null;
          console.log("🛑 Speech ended");
        }, 1200);
      }
    }
  };
}

/* ================= DOWNSAMPLE ================= */

function downsampleBuffer(buffer, inputRate, outputRate) {
  if (outputRate === inputRate) return buffer;

  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }

    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

/* ================= PCM ================= */

function convertFloatToInt16(buffer) {
  const l = buffer.length;
  const buf = new Int16Array(l);

  for (let i = 0; i < l; i++) {
    let s = Math.max(-1, Math.min(1, buffer[i]));
    buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return buf.buffer;
}

/* ================= PLAY AUDIO ================= */

async function playAudio(url) {

  if (audio) {
    audio.pause();
    audio = null;
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.src = url;

  const source = audioContext.createMediaElementSource(audio);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  source.connect(analyser);
  analyser.connect(audioContext.destination);

  currentState = "speaking";

  audio.onended = () => {
    currentState = "idle";
    mouthOpen = 0;
  };

  audio.play().catch(err => console.error(err));
}

/* ================= THREE SCENE ================= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

camera.position.set(0, 1.5, 2.2);
camera.lookAt(0, 1.45, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
keyLight.position.set(1, 3, 3);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0xffffff, 0.6);
fillLight.position.set(-1, 1.5, 2);
scene.add(fillLight);

let vrm;

const loader = new GLTFLoader();
loader.register(parser => new VRMLoaderPlugin(parser));

loader.load("./armholo1.vrm", gltf => {
  vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryJoints(vrm.scene);
  scene.add(vrm.scene);
  vrm.scene.rotation.y = Math.PI;
});

/* ================= ANIMATION ================= */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const t = clock.elapsedTime;

  if (vrm) {
    vrm.update(delta);

    if (currentState === "idle") {
      vrm.scene.position.y = Math.sin(t * 1.2) * 0.015;
    }

    if (currentState === "speaking") {
      vrm.scene.position.y = Math.sin(t * 4) * 0.02;
    }

    if (analyser) {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
      mouthOpen = Math.min(avg * 3, 1);
      vrm.expressionManager?.setValue("aa", mouthOpen);
    }
  }

  renderer.render(scene, camera);
}

animate();

/* ================= START SYSTEM ================= */

let started = false;

window.addEventListener("click", async () => {
  if (!started) {
    await audioContext.resume();
    startMic();
    started = true;
    console.log("🚀 System started");
  }
});
