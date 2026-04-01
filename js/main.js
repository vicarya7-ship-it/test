import { AudioManager } from "./audio.js";
import { FaceDetector } from "./faceDetect.js";
import { HorrorController } from "./horror.js";
import { SlidePuzzle, STAGES } from "./puzzle.js";

const COMPLETED_STORAGE_KEY = "day06-horror-puzzle-clears";

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function loadCompletedStages() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COMPLETED_STORAGE_KEY) ?? "[]");
    return new Set(parsed);
  } catch (error) {
    console.error(error);
    return new Set();
  }
}

function saveCompletedStages(stageIds) {
  try {
    localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify([...stageIds]));
  } catch (error) {
    console.error(error);
  }
}

function isPermissionError(error) {
  return error?.name === "NotAllowedError" || error?.name === "SecurityError";
}

function isCameraMissingError(error) {
  return error?.name === "NotFoundError" || error?.name === "OverconstrainedError";
}

const elements = {
  screens: [...document.querySelectorAll(".screen")],
  cameraStatus: document.querySelector("#camera-status"),
  cameraSpinner: document.querySelector("#model-spinner"),
  cameraStartButton: document.querySelector("#camera-start-button"),
  cameraRetryButton: document.querySelector("#camera-retry-button"),
  cameraBackButton: document.querySelector("#camera-back-button"),
  cameraErrorMessage: document.querySelector("#camera-error-message"),
  stageGrid: document.querySelector("#stage-grid"),
  cameraFeed: document.querySelector("#camera-feed"),
  eyeStatusIndicator: document.querySelector("#eye-status-indicator"),
  eyeStatusText: document.querySelector("#eye-status-text"),
  cameraDebugText: document.querySelector("#camera-debug-text"),
  stageName: document.querySelector("#game-stage-name"),
  timerText: document.querySelector("#timer-text"),
  moveCount: document.querySelector("#move-count"),
  puzzleBoard: document.querySelector("#puzzle-board"),
  approachFill: document.querySelector("#approach-fill"),
  approachValue: document.querySelector("#approach-value"),
  gameShell: document.querySelector("#game-shell"),
  horrorScreen: document.querySelector("#screen-game"),
  horrorStage: document.querySelector("#horror-stage"),
  horrorMessage: document.querySelector("#horror-message"),
  horrorFace: document.querySelector("#horror-face"),
  noiseCanvas: document.querySelector("#noise-canvas"),
  clearSummary: document.querySelector("#clear-summary"),
  clearTime: document.querySelector("#clear-time"),
  clearMoves: document.querySelector("#clear-moves"),
  clearNextButton: document.querySelector("#clear-next-button"),
  clearTitleButton: document.querySelector("#clear-title-button"),
  gameoverScreen: document.querySelector("#screen-gameover"),
  gameoverFace: document.querySelector("#gameover-face"),
  gameoverSummary: document.querySelector("#gameover-summary"),
  gameoverTime: document.querySelector("#gameover-time"),
  gameoverMoves: document.querySelector("#gameover-moves"),
  retryButton: document.querySelector("#retry-button"),
  gameoverTitleButton: document.querySelector("#gameover-title-button"),
};

const state = {
  currentStage: null,
  completedStages: loadCompletedStages(),
  lastFaceState: {
    eyeOpen: true,
    faceDetected: false,
    leftEar: 0,
    rightEar: 0,
    averageEar: 0,
    threshold: 0.21,
    cameraLabel: "",
    cameraFacingMode: "",
    trackingHold: false,
  },
  gameActive: false,
  elapsedTimerId: 0,
  elapsedSeconds: 0,
  gameoverActionTimerId: 0,
};

const audioManager = new AudioManager();
const puzzle = new SlidePuzzle({
  boardElement: elements.puzzleBoard,
  audioManager,
  onMove: ({ moves }) => {
    elements.moveCount.textContent = String(moves);
  },
  onSolved: handlePuzzleSolved,
});
const horror = new HorrorController({
  screenElement: elements.horrorScreen,
  gameShellElement: elements.gameShell,
  stageElement: elements.horrorStage,
  approachFillElement: elements.approachFill,
  approachValueElement: elements.approachValue,
  messageElement: elements.horrorMessage,
  faceElement: elements.horrorFace,
  noiseCanvas: elements.noiseCanvas,
  audioManager,
  onGameOver: handleGameOver,
});
const faceDetector = new FaceDetector({
  videoElement: elements.cameraFeed,
  onStateChange: handleFaceStateChange,
});

function showScreen(screenId) {
  elements.screens.forEach((screen) => {
    screen.classList.toggle("is-active", screen.id === screenId);
  });
}

function resetGameOverScreen() {
  window.clearTimeout(state.gameoverActionTimerId);
  elements.gameoverScreen.classList.remove("is-jumpscare", "show-actions");
}

function updateEyeStatus(stateSnapshot) {
  const cameraName =
    stateSnapshot.cameraFacingMode === "user"
      ? "前面カメラ"
      : stateSnapshot.cameraLabel || "カメラ";

  if (!stateSnapshot.faceDetected) {
    elements.eyeStatusIndicator.dataset.state = "missing";
    elements.eyeStatusText.textContent = "逸らしている";
    elements.cameraDebugText.textContent = `${cameraName}で顔を検出できていません。正面を向いて少し明るくしてください。`;
    return;
  }

  if (stateSnapshot.trackingHold) {
    elements.eyeStatusIndicator.dataset.state = "open";
    elements.eyeStatusText.textContent = "追跡中";
    elements.cameraDebugText.textContent = `${cameraName}の認識が一瞬揺れています。正面を向いたまま少し待つと復帰します。`;
    return;
  }

  if (!stateSnapshot.eyeOpen) {
    elements.eyeStatusIndicator.dataset.state = "closed";
    elements.eyeStatusText.textContent = "閉じている";
    elements.cameraDebugText.textContent = `${cameraName} / EAR ${stateSnapshot.averageEar.toFixed(2)} / 閉眼基準 ${stateSnapshot.threshold.toFixed(2)}`;
    return;
  }

  elements.eyeStatusIndicator.dataset.state = "open";
  elements.eyeStatusText.textContent = "開いている";
  elements.cameraDebugText.textContent = `${cameraName} / EAR ${stateSnapshot.averageEar.toFixed(2)} / 閉眼基準 ${stateSnapshot.threshold.toFixed(2)}`;
}

function renderStageGrid() {
  elements.stageGrid.innerHTML = "";

  STAGES.forEach((stage) => {
    const button = document.createElement("button");
    const cleared = state.completedStages.has(stage.id);

    button.type = "button";
    button.className = "stage-card";
    button.innerHTML = `
      <div class="stage-card-header">
        <div>
          <p class="eyebrow">Stage ${stage.id}</p>
          <h3 class="stage-card-title">${stage.name}</h3>
        </div>
        <span class="stage-badge">${cleared ? "✓" : `${stage.grid}x${stage.grid}`}</span>
      </div>
      <div class="stage-meta">
        <span>難易度<strong>${stage.difficulty}</strong></span>
        <span>グリッド<strong>${stage.grid} × ${stage.grid}</strong></span>
      </div>
    `;

    button.addEventListener("click", () => {
      void startStage(stage.id);
    });

    elements.stageGrid.appendChild(button);
  });
}

function startTimer() {
  window.clearInterval(state.elapsedTimerId);
  state.elapsedSeconds = 0;
  elements.timerText.textContent = "00:00";

  state.elapsedTimerId = window.setInterval(() => {
    state.elapsedSeconds += 1;
    elements.timerText.textContent = formatTime(state.elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  window.clearInterval(state.elapsedTimerId);
  state.elapsedTimerId = 0;
}

function stopSession(resetVisuals = true) {
  state.gameActive = false;
  stopTimer();
  horror.stop(resetVisuals);
  puzzle.setEnabled(false);
}

async function startStage(stageId) {
  const nextStage = STAGES.find((stage) => stage.id === stageId);

  if (!nextStage) {
    return;
  }

  await audioManager.unlock();
  resetGameOverScreen();
  stopSession();

  state.currentStage = nextStage;
  state.gameActive = true;

  elements.stageName.textContent = nextStage.name;
  elements.moveCount.textContent = "0";
  elements.timerText.textContent = "00:00";
  elements.clearSummary.textContent = `${nextStage.name}を抜け出した。`;

  showScreen("screen-game");
  updateEyeStatus(state.lastFaceState);
  horror.setDetectionState(state.lastFaceState);

  await Promise.all([puzzle.start(nextStage), horror.start(nextStage)]);
  startTimer();
}

function returnToTitle() {
  stopSession();
  showScreen("screen-title");
  renderStageGrid();
}

function handleFaceStateChange(nextState) {
  state.lastFaceState = nextState;
  updateEyeStatus(nextState);
  horror.setDetectionState(nextState);
}

function handlePuzzleSolved({ moves, stage }) {
  if (!state.gameActive) {
    return;
  }

  stopSession();
  state.completedStages.add(stage.id);
  saveCompletedStages(state.completedStages);
  renderStageGrid();

  elements.clearSummary.textContent = `${stage.name}を抜け出した。`;
  elements.clearTime.textContent = formatTime(state.elapsedSeconds);
  elements.clearMoves.textContent = `${moves}`;

  const nextStage = STAGES.find((candidate) => candidate.id === stage.id + 1);
  elements.clearNextButton.disabled = !nextStage;
  elements.clearNextButton.textContent = nextStage ? "次のステージへ" : "終幕";

  void audioManager.playClear();
  showScreen("screen-clear");
}

function handleGameOver({ stage, faceSource }) {
  if (!state.gameActive) {
    return;
  }

  state.gameActive = false;
  stopTimer();
  puzzle.setEnabled(false);

  elements.gameoverFace.src = faceSource;
  elements.gameoverSummary.textContent = `${stage.name}で怪異に追いつかれた。`;
  elements.gameoverTime.textContent = formatTime(state.elapsedSeconds);
  elements.gameoverMoves.textContent = String(puzzle.getState().moves);

  resetGameOverScreen();
  showScreen("screen-gameover");

  window.requestAnimationFrame(() => {
    elements.gameoverScreen.classList.add("is-jumpscare");
  });

  state.gameoverActionTimerId = window.setTimeout(() => {
    elements.gameoverScreen.classList.add("show-actions");
  }, 2000);
}

async function requestCamera() {
  elements.cameraStartButton.disabled = true;
  elements.cameraStatus.textContent = "カメラを起動しています…";

  try {
    await audioManager.unlock();
    await faceDetector.startCamera();
    faceDetector.start();
    showScreen("screen-title");
  } catch (error) {
    console.error(error);

    if (isPermissionError(error)) {
      elements.cameraErrorMessage.textContent =
        "カメラの許可が拒否されました。ブラウザの設定から許可を有効にして、もう一度試してください。";
    } else if (isCameraMissingError(error)) {
      elements.cameraErrorMessage.textContent =
        "利用できるカメラが見つかりませんでした。接続を確認して、もう一度試してください。";
    } else {
      elements.cameraErrorMessage.textContent =
        "カメラの初期化に失敗しました。HTTPS またはローカルサーバー経由で開いているか確認してください。";
    }

    showScreen("screen-camera-error");
  } finally {
    elements.cameraStartButton.disabled = false;
    elements.cameraStatus.textContent = "準備完了。カメラを起動できます。";
  }
}

function bindEvents() {
  elements.cameraStartButton.addEventListener("click", () => {
    void requestCamera();
  });

  elements.cameraRetryButton.addEventListener("click", () => {
    void requestCamera();
  });

  elements.cameraBackButton.addEventListener("click", () => {
    showScreen("screen-camera");
  });

  elements.clearNextButton.addEventListener("click", () => {
    if (!state.currentStage) {
      return;
    }

    const nextStage = STAGES.find((stage) => stage.id === state.currentStage.id + 1);
    if (nextStage) {
      void startStage(nextStage.id);
    }
  });

  elements.clearTitleButton.addEventListener("click", returnToTitle);

  elements.retryButton.addEventListener("click", () => {
    if (state.currentStage) {
      void startStage(state.currentStage.id);
    }
  });

  elements.gameoverTitleButton.addEventListener("click", returnToTitle);
}

async function bootstrap() {
  bindEvents();
  renderStageGrid();
  updateEyeStatus(state.lastFaceState);

  elements.cameraStatus.textContent = "face-api.js のモデルを読み込んでいます…";
  elements.cameraStartButton.disabled = true;

  try {
    await faceDetector.loadModels();
    elements.cameraSpinner.classList.add("is-hidden");
    elements.cameraStartButton.disabled = false;
    elements.cameraStatus.textContent = "準備完了。カメラを起動してください。";
  } catch (error) {
    console.error(error);
    elements.cameraErrorMessage.textContent =
      "顔認識モデルの読み込みに失敗しました。ネットワーク接続を確認して再読み込みしてください。";
    showScreen("screen-camera-error");
  }
}

void bootstrap();
