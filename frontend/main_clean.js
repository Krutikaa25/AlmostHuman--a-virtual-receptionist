import * as THREE from "three";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@1.0.0/lib/three-vrm.module.js";
import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

/* ================= SOCKET ================= */
const socket = io("http://localhost:8000");

/* ================= GLOBAL AUDIO CONTEXT ================= */
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let audio = null;
let analyser = null;
let mouthOpen = 0;

function applyEmotion(emotion) {
  currentEmotion = emotion;
  console.log("Emotion:", emotion);
}

/* ================= MIC STREAMING ================= */
let audioInputContext;
let processor;
let lastSendTime = 0;

async function startMic() {

  // 🔥 UPDATED MIC SETTINGS
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  audioInputContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 16000
  });

  const source = audioInputContext.createMediaStreamSource(stream);

  processor = audioInputContext.createScriptProcessor(4096, 1, 1);

  source.connect(processor);
  processor.connect(audioInputContext.destination);

  processor.onaudioprocess = (event) => {
    const now = Date.now();

    if (now - lastSendTime < 50) return; // 🔥 reduced from 100ms to 50ms
    lastSendTime = now;

    const inputData = event.inputBuffer.getChannelData(0);
    const pcmData = convertFloatToInt16(inputData);

    socket.emit("audio_chunk", pcmData);
  };
}

// Helper function
function convertFloatToInt16(buffer) {
  const l = buffer.length;
  const buf = new Int16Array(l);

  for (let i = 0; i < l; i++) {
    let s = Math.max(-1, Math.min(1, buffer[i]));
    buf[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return buf.buffer;
}

/* ================= HANDLE SOCKET EVENTS ================= */

socket.on("partial_text", (text) => {
  console.log("Partial:", text);
});

socket.on("ai_response", (data) => {
  applyEmotion(data.emotion);
  playAudio(data.audio_url);
});

socket.on("stop_audio", () => {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  currentState = "idle";
});

/* ================= START SYSTEM ON CLICK ================= */

let systemStarted = false;

window.addEventListener("click", async () => {
  if (!systemStarted) {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    startMic();
    systemStarted = true;
    console.log("🚀 Streaming mic started");
  }
});

/* ================= SCENE ================= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

/* ================= CAMERA ================= */

const camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

camera.position.set(0, 1.5, 2.2);
camera.lookAt(0, 1.45, 0);

/* ================= RENDERER ================= */

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

/* ================= LIGHTING ================= */

scene.add(new THREE.AmbientLight(0xffffff, 0.6));

const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
keyLight.position.set(1, 3, 3);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0xffffff, 0.6);
fillLight.position.set(-1, 1.5, 2);
scene.add(fillLight);

/* ================= GLOBAL STATE ================= */

let vrm;
let currentState = "idle";
let currentEmotion = "neutral";

/* ================= LOAD AVATAR ================= */

const loader = new GLTFLoader();
loader.register(parser => new VRMLoaderPlugin(parser));

loader.load("./armholo1.vrm", gltf => {
  vrm = gltf.userData.vrm;
  VRMUtils.removeUnnecessaryJoints(vrm.scene);
  scene.add(vrm.scene);
  vrm.scene.rotation.y = Math.PI;
  console.log("✅ VRM loaded");
});

/* ================= ANIMATION LOOP ================= */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.elapsedTime;
  const delta = clock.getDelta();

  if (vrm) {
    vrm.update(delta);
    const head = vrm.humanoid.getNormalizedBoneNode("head");

    if (currentState === "idle") {
      vrm.scene.position.y = Math.sin(t * 1.2) * 0.015;
      if (head) {
        head.rotation.y = Math.sin(t * 0.6) * 0.1;
        head.rotation.x = Math.sin(t * 0.8) * 0.05;
      }
    }

    if (currentState === "speaking") {
      vrm.scene.position.y = Math.sin(t * 4) * 0.02;
      if (head) {
        head.rotation.x = Math.sin(t * 8) * 0.12;
        head.rotation.y = Math.sin(t * 4) * 0.05;
      }
    }

    if (analyser) {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
      mouthOpen = Math.min(avg * 3, 1);

      vrm.expressionManager?.setValue("aa", mouthOpen);
      vrm.expressionManager?.setValue("ih", mouthOpen * 0.5);
      vrm.expressionManager?.setValue("ou", mouthOpen * 0.4);
    }

    if (vrm.expressionManager) {
      vrm.expressionManager.setValue("happy", currentEmotion === "happy" ? 0.4 : 0);
      vrm.expressionManager.setValue("angry", currentEmotion === "angry" ? 0.4 : 0);
      vrm.expressionManager.setValue("sad", currentEmotion === "sad" ? 0.4 : 0);
    }
  }

  renderer.render(scene, camera);
}

animate();

/* ================= AUDIO PLAYBACK ================= */

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

/* ================= RESIZE ================= */

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
