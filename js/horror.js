function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ここにユーザーが差し替える画像を配置: assets/horror/face1.png 〜 face5.png
export function getHorrorFacePath(stageId) {
  const safeStageId = clamp(stageId, 1, 5);
  return `assets/horror/face${safeStageId}.png`;
}

function createFacePlaceholder(text) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = 1024;
  canvas.height = 1024;

  const gradient = context.createRadialGradient(512, 512, 40, 512, 512, 440);
  gradient.addColorStop(0, "rgba(255,255,255,0.12)");
  gradient.addColorStop(0.45, "rgba(110,0,0,0.32)");
  gradient.addColorStop(1, "rgba(0,0,0,1)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(255,255,255,0.86)";
  context.font = '900 110px "Noto Serif JP", serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 2;
  for (let index = 0; index < 18; index += 1) {
    context.beginPath();
    context.arc(512, 512, 150 + index * 18, index * 0.3, Math.PI * 1.8);
    context.stroke();
  }

  return canvas.toDataURL("image/png");
}

function loadFaceSource(stage) {
  return new Promise((resolve) => {
    const image = new Image();
    const source = getHorrorFacePath(stage.id);

    image.onload = () => resolve(source);
    image.onerror = () => resolve(createFacePlaceholder(`${stage.name}\n怪異`));
    image.src = source;
  });
}

export class HorrorController {
  constructor({
    screenElement,
    gameShellElement,
    stageElement,
    approachFillElement,
    approachValueElement,
    messageElement,
    faceElement,
    noiseCanvas,
    audioManager,
    onGameOver,
  }) {
    this.screenElement = screenElement;
    this.gameShellElement = gameShellElement;
    this.stageElement = stageElement;
    this.approachFillElement = approachFillElement;
    this.approachValueElement = approachValueElement;
    this.messageElement = messageElement;
    this.faceElement = faceElement;
    this.noiseCanvas = noiseCanvas;
    this.noiseContext = noiseCanvas.getContext("2d");
    this.audioManager = audioManager;
    this.onGameOver = onGameOver;

    this.currentStage = null;
    this.currentFaceSource = "";
    this.progress = 0;
    this.running = false;
    this.rafId = 0;
    this.lastFrame = 0;
    this.gameOverTriggered = false;
    this.detectionState = {
      eyeOpen: true,
      faceDetected: true,
    };

    this.animate = this.animate.bind(this);
    this.handleResize = this.handleResize.bind(this);

    window.addEventListener("resize", this.handleResize);
    this.resetVisuals();
  }

  async start(stage) {
    this.stop(true);

    this.currentStage = stage;
    this.currentFaceSource = await loadFaceSource(stage);
    this.faceElement.src = this.currentFaceSource;
    this.faceElement.alt = `${stage.name}の怪異`;
    this.progress = 0;
    this.running = true;
    this.gameOverTriggered = false;
    this.lastFrame = performance.now();
    this.handleResize();
    this.applyVisuals();
    void this.audioManager.startAmbience();
    this.rafId = window.requestAnimationFrame(this.animate);
  }

  stop(resetVisuals = true) {
    this.running = false;
    this.gameOverTriggered = false;
    window.cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.audioManager.stopAmbience();

    if (resetVisuals) {
      this.resetVisuals();
    }
  }

  setDetectionState(nextState) {
    this.detectionState = nextState;
  }

  getCurrentFaceSource() {
    return this.currentFaceSource;
  }

  getProgress() {
    return this.progress;
  }

  animate(now) {
    if (!this.running) {
      return;
    }

    const deltaSeconds = Math.min((now - this.lastFrame) / 1000, 0.12);
    this.lastFrame = now;

    if (!this.detectionState.faceDetected) {
      this.progress += 3 * deltaSeconds;
    } else if (!this.detectionState.eyeOpen) {
      this.progress += 2 * deltaSeconds;
    }

    this.progress = clamp(this.progress, 0, 100);
    this.applyVisuals();

    if (this.progress >= 100) {
      this.triggerGameOver();
      return;
    }

    this.rafId = window.requestAnimationFrame(this.animate);
  }

  triggerGameOver() {
    if (this.gameOverTriggered) {
      return;
    }

    this.gameOverTriggered = true;
    this.running = false;
    window.cancelAnimationFrame(this.rafId);
    this.audioManager.stopAmbience(0.12);
    void this.audioManager.playGameOverScream();

    this.onGameOver?.({
      stage: this.currentStage,
      faceSource: this.currentFaceSource,
      progress: this.progress,
    });
  }

  handleResize() {
    const bounds = this.stageElement.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    this.noiseCanvas.width = Math.max(1, Math.floor(bounds.width * devicePixelRatio));
    this.noiseCanvas.height = Math.max(1, Math.floor(bounds.height * devicePixelRatio));
  }

  getLevel() {
    if (this.progress >= 80) {
      return 5;
    }

    if (this.progress >= 60) {
      return 4;
    }

    if (this.progress >= 40) {
      return 3;
    }

    if (this.progress >= 20) {
      return 2;
    }

    return 1;
  }

  getMessage(level) {
    if (!this.detectionState.faceDetected) {
      return "視線が逸れた。その隙間から足音が速くなる。";
    }

    if (!this.detectionState.eyeOpen) {
      return "瞼の裏側へ、冷たい息が近づく。";
    }

    if (level === 1) {
      return "静寂が耳に貼りつく。";
    }

    if (level === 2) {
      return "部屋の端で、黒いものが爪を立てる。";
    }

    if (level === 3) {
      return "粒子のざわめきに、心音が重なる。";
    }

    if (level === 4) {
      return "輪郭だけの顔が、こちらを見つけた。";
    }

    return "もう目の前にいる。";
  }

  applyVisuals() {
    const intensity = this.progress / 100;
    const level = this.getLevel();

    this.screenElement.dataset.horrorLevel = String(level);
    this.approachFillElement.style.width = `${this.progress.toFixed(2)}%`;
    this.approachValueElement.textContent = `${Math.round(this.progress)}%`;

    const grayscaleRatio = clamp((this.progress - 20) / 80, 0, 1);
    const noiseOpacity = clamp((this.progress - 38) / 62, 0, 0.95);
    const handOpacity = clamp((this.progress - 18) / 34, 0, 0.82);
    const faceOpacity =
      this.progress < 60 ? 0 : this.progress < 80 ? clamp((this.progress - 60) / 20, 0, 1) * 0.55 : 0.65 + clamp((this.progress - 80) / 20, 0, 1) * 0.35;
    const faceScale =
      this.progress < 60 ? 0.85 : this.progress < 80 ? 0.8 + clamp((this.progress - 60) / 20, 0, 1) * 0.24 : 1.04 + clamp((this.progress - 80) / 20, 0, 1) * 0.95;

    this.gameShellElement.style.setProperty("--horror-grayscale", `${Math.round(grayscaleRatio * 100)}%`);
    this.gameShellElement.style.setProperty("--horror-contrast", (1 + intensity * 0.38).toFixed(2));
    this.gameShellElement.style.setProperty("--horror-saturate", Math.max(0.28, 1 - intensity * 0.7).toFixed(2));
    this.gameShellElement.style.setProperty("--vignette-depth", intensity.toFixed(2));

    this.stageElement.style.setProperty("--edge-shadow", intensity.toFixed(2));
    this.stageElement.style.setProperty("--noise-opacity", noiseOpacity.toFixed(2));
    this.stageElement.style.setProperty("--hand-opacity", handOpacity.toFixed(2));
    this.stageElement.style.setProperty("--hand-shift", intensity.toFixed(2));

    if (level >= 5) {
      this.faceElement.style.left = "50%";
      this.faceElement.style.top = "50%";
    } else {
      this.faceElement.style.left = "78%";
      this.faceElement.style.top = "32%";
    }

    this.faceElement.style.setProperty("--face-opacity", faceOpacity.toFixed(2));
    this.faceElement.style.setProperty("--face-scale", faceScale.toFixed(2));
    this.messageElement.textContent = this.getMessage(level);

    this.drawNoise(intensity);
    this.audioManager.updateTension(intensity);
  }

  drawNoise(intensity) {
    const context = this.noiseContext;
    const width = this.noiseCanvas.width;
    const height = this.noiseCanvas.height;

    context.clearRect(0, 0, width, height);

    if (intensity < 0.4) {
      return;
    }

    const density = Math.floor(400 + intensity * 1800);

    for (let index = 0; index < density; index += 1) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const size = Math.random() < 0.75 ? 1 : 2;
      const alpha = Math.random() * 0.16 * intensity;
      context.fillStyle = `rgba(255,255,255,${alpha})`;
      context.fillRect(x, y, size, size);
    }

    context.fillStyle = `rgba(0,0,0,${0.06 + intensity * 0.12})`;
    const lines = Math.max(4, Math.floor(height / 22));

    for (let line = 0; line < lines; line += 1) {
      const lineY = Math.floor((line / lines) * height + Math.random() * 8);
      context.fillRect(0, lineY, width, 1);
    }
  }

  resetVisuals() {
    this.progress = 0;
    this.screenElement.dataset.horrorLevel = "0";
    this.approachFillElement.style.width = "0%";
    this.approachValueElement.textContent = "0%";
    this.messageElement.textContent = "静寂が耳に貼りつく。";

    this.gameShellElement.style.setProperty("--horror-grayscale", "0%");
    this.gameShellElement.style.setProperty("--horror-contrast", "1");
    this.gameShellElement.style.setProperty("--horror-saturate", "1");
    this.gameShellElement.style.setProperty("--vignette-depth", "0");

    this.stageElement.style.setProperty("--edge-shadow", "0");
    this.stageElement.style.setProperty("--noise-opacity", "0");
    this.stageElement.style.setProperty("--hand-opacity", "0");
    this.stageElement.style.setProperty("--hand-shift", "0");

    this.faceElement.style.left = "78%";
    this.faceElement.style.top = "32%";
    this.faceElement.style.setProperty("--face-opacity", "0");
    this.faceElement.style.setProperty("--face-scale", "0.85");

    this.noiseContext.clearRect(0, 0, this.noiseCanvas.width, this.noiseCanvas.height);
  }
}
