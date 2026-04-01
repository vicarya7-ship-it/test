const MODEL_URL = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights";
const DEFAULT_EAR_THRESHOLD = 0.21;
const MIN_EAR_THRESHOLD = 0.18;
const MAX_EAR_THRESHOLD = 0.26;
const CLOSED_GRACE_MS = 500;

const CAMERA_CONSTRAINTS = [
  {
    facingMode: { exact: "user" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  {
    facingMode: { ideal: "user" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function distance(pointA, pointB) {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

function calculateEar(eyePoints) {
  if (!eyePoints || eyePoints.length < 6) {
    return 1;
  }

  const verticalA = distance(eyePoints[1], eyePoints[5]);
  const verticalB = distance(eyePoints[2], eyePoints[4]);
  const horizontal = distance(eyePoints[0], eyePoints[3]);

  if (horizontal === 0) {
    return 1;
  }

  return (verticalA + verticalB) / (2 * horizontal);
}

function waitForFaceApi(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();

    const probe = () => {
      if (window.faceapi) {
        resolve(window.faceapi);
        return;
      }

      if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error("face-api.js の読み込みに失敗しました。"));
        return;
      }

      window.requestAnimationFrame(probe);
    };

    probe();
  });
}

async function requestCameraStream() {
  let lastError = null;

  for (const video of CAMERA_CONSTRAINTS) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video,
      });
    } catch (error) {
      if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
        throw error;
      }

      lastError = error;
    }
  }

  throw lastError ?? new Error("カメラに接続できませんでした。");
}

export class FaceDetector {
  constructor({ videoElement, onStateChange }) {
    this.videoElement = videoElement;
    this.onStateChange = onStateChange;

    this.modelsReady = false;
    this.running = false;
    this.pending = false;
    this.animationFrameId = 0;
    this.stream = null;
    this.closedSince = 0;
    this.openEyeBaseline = 0;
    this.cameraLabel = "";
    this.cameraFacingMode = "";

    this.lastState = {
      eyeOpen: true,
      faceDetected: false,
      leftEar: 0,
      rightEar: 0,
      averageEar: 0,
      threshold: DEFAULT_EAR_THRESHOLD,
      cameraLabel: "",
      cameraFacingMode: "",
    };
  }

  async loadModels() {
    const faceapi = await waitForFaceApi();

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
    ]);

    this.modelsReady = true;
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("このブラウザではカメラ API を利用できません。");
    }

    this.stream = await requestCameraStream();
    this.videoElement.srcObject = this.stream;

    const [videoTrack] = this.stream.getVideoTracks();
    const settings = videoTrack?.getSettings?.() ?? {};

    this.cameraLabel = videoTrack?.label ?? "";
    this.cameraFacingMode = settings.facingMode ?? "";
    this.videoElement.width = settings.width ?? 1280;
    this.videoElement.height = settings.height ?? 720;

    await new Promise((resolve) => {
      if (this.videoElement.readyState >= 1) {
        resolve();
        return;
      }

      this.videoElement.addEventListener("loadedmetadata", resolve, { once: true });
    });

    await this.videoElement.play();
    this.emitState({
      ...this.lastState,
      cameraLabel: this.cameraLabel,
      cameraFacingMode: this.cameraFacingMode,
    });
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    window.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = 0;
    this.pending = false;

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  loop() {
    this.animationFrameId = window.requestAnimationFrame(async () => {
      if (!this.running) {
        return;
      }

      if (this.modelsReady && !this.pending && this.videoElement.readyState >= 2) {
        this.pending = true;

        try {
          const faceapi = window.faceapi;
          const detection = await faceapi
            .detectSingleFace(
              this.videoElement,
              new faceapi.TinyFaceDetectorOptions({
                inputSize: 320,
                scoreThreshold: 0.25,
              })
            )
            .withFaceLandmarks(true);

          this.processDetection(detection);
        } catch (error) {
          console.error(error);
        } finally {
          this.pending = false;
        }
      }

      this.loop();
    });
  }

  getThreshold() {
    if (!this.openEyeBaseline) {
      return DEFAULT_EAR_THRESHOLD;
    }

    return clamp(this.openEyeBaseline - 0.03, MIN_EAR_THRESHOLD, MAX_EAR_THRESHOLD);
  }

  updateBaseline(averageEar) {
    if (!Number.isFinite(averageEar) || averageEar <= 0.12) {
      return;
    }

    if (!this.openEyeBaseline) {
      this.openEyeBaseline = averageEar;
      return;
    }

    const blend = averageEar > this.openEyeBaseline ? 0.18 : 0.08;
    this.openEyeBaseline = this.openEyeBaseline * (1 - blend) + averageEar * blend;
  }

  processDetection(detection) {
    const now = performance.now();

    if (!detection) {
      this.closedSince = 0;
      this.emitState({
        eyeOpen: false,
        faceDetected: false,
        leftEar: 0,
        rightEar: 0,
        averageEar: 0,
        threshold: this.getThreshold(),
        cameraLabel: this.cameraLabel,
        cameraFacingMode: this.cameraFacingMode,
      });
      return;
    }

    const leftEar = calculateEar(detection.landmarks.getLeftEye());
    const rightEar = calculateEar(detection.landmarks.getRightEye());
    const averageEar = (leftEar + rightEar) / 2;

    if (!this.openEyeBaseline && averageEar > 0.14) {
      this.openEyeBaseline = averageEar;
    }

    let threshold = this.getThreshold();
    const ratioClosed = this.openEyeBaseline > 0 ? averageEar / this.openEyeBaseline < 0.88 : false;
    const eyesClosed = averageEar < threshold || ratioClosed;

    if (eyesClosed && this.closedSince === 0) {
      this.closedSince = now;
    }

    if (!eyesClosed) {
      this.closedSince = 0;
      this.updateBaseline(averageEar);
      threshold = this.getThreshold();
    }

    const closedLongEnough = eyesClosed && now - this.closedSince >= CLOSED_GRACE_MS;

    this.emitState({
      eyeOpen: !closedLongEnough,
      faceDetected: true,
      leftEar,
      rightEar,
      averageEar,
      threshold,
      cameraLabel: this.cameraLabel,
      cameraFacingMode: this.cameraFacingMode,
    });
  }

  emitState(nextState) {
    this.lastState = nextState;
    this.onStateChange?.(nextState);
  }
}
