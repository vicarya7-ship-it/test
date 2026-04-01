const MODEL_URL = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights";
const EAR_THRESHOLD = 0.2;
const CLOSED_GRACE_MS = 500;

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
    this.lastState = {
      eyeOpen: true,
      faceDetected: false,
      leftEar: 0,
      rightEar: 0,
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

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });

    this.videoElement.srcObject = this.stream;

    await new Promise((resolve) => {
      if (this.videoElement.readyState >= 1) {
        resolve();
        return;
      }

      this.videoElement.addEventListener("loadedmetadata", resolve, { once: true });
    });

    await this.videoElement.play();
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
                inputSize: 224,
                scoreThreshold: 0.4,
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

  processDetection(detection) {
    const now = performance.now();

    if (!detection) {
      this.closedSince = 0;
      this.emitState({
        eyeOpen: false,
        faceDetected: false,
        leftEar: 0,
        rightEar: 0,
      });
      return;
    }

    const leftEar = calculateEar(detection.landmarks.getLeftEye());
    const rightEar = calculateEar(detection.landmarks.getRightEye());
    const averageEar = (leftEar + rightEar) / 2;
    const eyesClosed = averageEar < EAR_THRESHOLD;

    if (eyesClosed && this.closedSince === 0) {
      this.closedSince = now;
    }

    if (!eyesClosed) {
      this.closedSince = 0;
    }

    const closedLongEnough = eyesClosed && now - this.closedSince >= CLOSED_GRACE_MS;

    this.emitState({
      eyeOpen: !closedLongEnough,
      faceDetected: true,
      leftEar,
      rightEar,
    });
  }

  emitState(nextState) {
    this.lastState = nextState;
    this.onStateChange?.(nextState);
  }
}
