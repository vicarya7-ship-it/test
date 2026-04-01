export const STAGES = [
  // ここにユーザーが差し替える画像を配置: assets/puzzle/stage1.jpg 〜 stage5.jpg
  { id: 1, name: "壱ノ間", difficulty: "やさしい", grid: 3, image: "assets/puzzle/stage1.jpg" },
  { id: 2, name: "弐ノ間", difficulty: "ふつう", grid: 4, image: "assets/puzzle/stage2.jpg" },
  { id: 3, name: "参ノ間", difficulty: "ふつう", grid: 4, image: "assets/puzzle/stage3.jpg" },
  { id: 4, name: "四ノ間", difficulty: "ふつう", grid: 4, image: "assets/puzzle/stage4.jpg" },
  { id: 5, name: "奥ノ間", difficulty: "むずかしい", grid: 5, image: "assets/puzzle/stage5.jpg" },
];

function drawCoverImage(context, image, width, height) {
  const imageRatio = image.width / image.height;
  const targetRatio = width / height;

  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / targetRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
}

function drawTilePattern(context, x, y, size, row, column) {
  const inset = size * 0.14;
  const patternSpan = size - inset * 2;
  const lineStep = Math.max(12, Math.floor(size / 5));

  context.save();
  context.lineWidth = Math.max(2, size * 0.012);
  context.strokeStyle = row % 2 === column % 2 ? "rgba(255,255,255,0.16)" : "rgba(139,0,0,0.22)";

  if ((row + column) % 2 === 0) {
    for (let offset = -patternSpan; offset <= patternSpan; offset += lineStep) {
      context.beginPath();
      context.moveTo(x + inset + offset, y + size - inset);
      context.lineTo(x + inset + offset + patternSpan, y + inset);
      context.stroke();
    }
  } else {
    const centerX = x + size / 2;
    const centerY = y + size / 2;

    for (let radius = patternSpan * 0.12; radius <= patternSpan * 0.42; radius += patternSpan * 0.1) {
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
    }
  }

  context.restore();
}

function drawGuideOverlay(context, boardSize, grid, stageName) {
  const tileSize = boardSize / grid;

  context.save();

  for (let row = 0; row < grid; row += 1) {
    for (let column = 0; column < grid; column += 1) {
      const x = column * tileSize;
      const y = row * tileSize;
      const pieceId = row * grid + column + 1;

      context.fillStyle = (row + column) % 2 === 0 ? "rgba(8, 6, 4, 0.12)" : "rgba(255, 255, 255, 0.04)";
      context.fillRect(x, y, tileSize, tileSize);

      drawTilePattern(context, x, y, tileSize, row, column);

      const plateWidth = tileSize * 0.28;
      const plateHeight = tileSize * 0.18;
      const plateX = x + tileSize * 0.06;
      const plateY = y + tileSize * 0.06;

      context.fillStyle = "rgba(8, 6, 4, 0.68)";
      context.fillRect(plateX, plateY, plateWidth, plateHeight);
      context.strokeStyle = "rgba(200, 184, 154, 0.42)";
      context.lineWidth = Math.max(2, tileSize * 0.01);
      context.strokeRect(plateX, plateY, plateWidth, plateHeight);

      context.fillStyle = "rgba(255, 244, 225, 0.92)";
      context.font = `700 ${Math.floor(tileSize * 0.11)}px "Noto Serif JP", serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(pieceId), plateX + plateWidth / 2, plateY + plateHeight / 2);

      context.fillStyle = "rgba(255,255,255,0.18)";
      context.font = `600 ${Math.floor(tileSize * 0.06)}px "Noto Serif JP", serif`;
      context.fillText(stageName, x + tileSize * 0.5, y + tileSize * 0.87);
    }
  }

  context.strokeStyle = "rgba(139, 0, 0, 0.36)";
  context.lineWidth = Math.max(2, tileSize * 0.018);

  for (let index = 1; index < grid; index += 1) {
    const lineOffset = index * tileSize;

    context.beginPath();
    context.moveTo(lineOffset, 0);
    context.lineTo(lineOffset, boardSize);
    context.stroke();

    context.beginPath();
    context.moveTo(0, lineOffset);
    context.lineTo(boardSize, lineOffset);
    context.stroke();
  }

  context.restore();
}

export function createPlaceholderImage(width, height, text) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;

  context.fillStyle = "#4b4b4b";
  context.fillRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(255,255,255,0.1)");
  gradient.addColorStop(1, "rgba(0,0,0,0.35)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 2;
  for (let index = 24; index < width; index += 36) {
    context.beginPath();
    context.moveTo(index, 0);
    context.lineTo(index, height);
    context.stroke();
  }

  context.fillStyle = "rgba(255,255,255,0.8)";
  context.font = `700 ${Math.floor(width * 0.08)}px "Noto Serif JP", serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height / 2);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function loadImageWithFallback(source, label) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      const fallback = new Image();
      fallback.onload = () => resolve(fallback);
      fallback.src = createPlaceholderImage(960, 960, label);
    };
    image.src = source;
  });
}

async function buildTileTextures(stage) {
  const grid = stage.grid;
  const boardSize = 960;
  const tileSize = Math.floor(boardSize / grid);
  const sourceImage = await loadImageWithFallback(stage.image, `${stage.name}\nNO IMAGE`);

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = boardSize;
  sourceCanvas.height = boardSize;

  const sourceContext = sourceCanvas.getContext("2d");
  drawCoverImage(sourceContext, sourceImage, boardSize, boardSize);
  drawGuideOverlay(sourceContext, boardSize, grid, stage.name);

  const textures = new Map();

  for (let row = 0; row < grid; row += 1) {
    for (let column = 0; column < grid; column += 1) {
      const pieceId = row * grid + column + 1;
      const isLastCell = pieceId === grid * grid;

      if (isLastCell) {
        continue;
      }

      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = tileSize;
      tileCanvas.height = tileSize;

      const tileContext = tileCanvas.getContext("2d");
      tileContext.drawImage(
        sourceCanvas,
        column * tileSize,
        row * tileSize,
        tileSize,
        tileSize,
        0,
        0,
        tileSize,
        tileSize
      );

      textures.set(pieceId, tileCanvas.toDataURL("image/jpeg", 0.94));
    }
  }

  return textures;
}

function getNeighborIndexes(index, grid) {
  const row = Math.floor(index / grid);
  const column = index % grid;
  const neighbors = [];

  if (row > 0) {
    neighbors.push(index - grid);
  }

  if (row < grid - 1) {
    neighbors.push(index + grid);
  }

  if (column > 0) {
    neighbors.push(index - 1);
  }

  if (column < grid - 1) {
    neighbors.push(index + 1);
  }

  return neighbors;
}

function createShuffledBoard(grid) {
  const total = grid * grid;
  const board = Array.from({ length: total - 1 }, (_, index) => index + 1);
  board.push(0);

  let emptyIndex = total - 1;
  let previousIndex = -1;
  const shuffleCount = total * 40;

  for (let step = 0; step < shuffleCount; step += 1) {
    const neighbors = getNeighborIndexes(emptyIndex, grid).filter((candidate) => candidate !== previousIndex);
    const candidates = neighbors.length > 0 ? neighbors : getNeighborIndexes(emptyIndex, grid);
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const nextIndex = candidates[randomIndex];

    [board[emptyIndex], board[nextIndex]] = [board[nextIndex], board[emptyIndex]];
    previousIndex = emptyIndex;
    emptyIndex = nextIndex;
  }

  const solved = board.every((pieceId, index) => {
    if (index === total - 1) {
      return pieceId === 0;
    }

    return pieceId === index + 1;
  });

  return solved ? createShuffledBoard(grid) : board;
}

export class SlidePuzzle {
  constructor({ boardElement, audioManager, onMove, onSolved }) {
    this.boardElement = boardElement;
    this.audioManager = audioManager;
    this.onMove = onMove;
    this.onSolved = onSolved;

    this.stage = null;
    this.grid = 0;
    this.board = [];
    this.tileTextures = new Map();
    this.moveCount = 0;
    this.enabled = false;

    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.boardElement.addEventListener("click", this.handleClick);
    this.boardElement.addEventListener("keydown", this.handleKeyDown);
  }

  async start(stage) {
    this.stage = stage;
    this.grid = stage.grid;
    this.moveCount = 0;
    this.enabled = false;

    this.boardElement.classList.add("is-loading");
    this.boardElement.innerHTML = '<p class="board-loading">結界を組み替えています…</p>';

    this.tileTextures = await buildTileTextures(stage);
    this.board = createShuffledBoard(this.grid);

    this.enabled = true;
    this.render();
    this.onMove?.({ moves: this.moveCount, stage: this.stage });
  }

  getState() {
    return {
      stage: this.stage,
      moves: this.moveCount,
      solved: this.isSolved(),
    };
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.boardElement.classList.toggle("is-disabled", !enabled);
  }

  handleClick(event) {
    const tile = event.target.closest(".puzzle-tile");

    if (!tile) {
      return;
    }

    this.tryMovePiece(Number(tile.dataset.pieceId));
  }

  handleKeyDown(event) {
    const tile = event.target.closest(".puzzle-tile");

    if (!tile) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    this.tryMovePiece(Number(tile.dataset.pieceId));
  }

  tryMovePiece(pieceId) {
    if (!this.enabled || !Number.isFinite(pieceId)) {
      return;
    }

    const pieceIndex = this.board.indexOf(pieceId);
    const emptyIndex = this.board.indexOf(0);
    const canMove = getNeighborIndexes(emptyIndex, this.grid).includes(pieceIndex);

    if (!canMove) {
      return;
    }

    [this.board[pieceIndex], this.board[emptyIndex]] = [this.board[emptyIndex], this.board[pieceIndex]];
    this.moveCount += 1;
    const solved = this.isSolved();

    if (solved) {
      this.enabled = false;
    }

    void this.audioManager?.playPieceMove();
    this.render();
    this.onMove?.({ moves: this.moveCount, stage: this.stage });

    if (solved) {
      this.onSolved?.({ moves: this.moveCount, stage: this.stage });
    }
  }

  isSolved() {
    return this.board.every((pieceId, index) => {
      if (index === this.board.length - 1) {
        return pieceId === 0;
      }

      return pieceId === index + 1;
    });
  }

  render() {
    this.boardElement.classList.remove("is-loading");
    this.boardElement.classList.toggle("is-disabled", !this.enabled);
    this.boardElement.style.gridTemplateColumns = `repeat(${this.grid}, 1fr)`;
    this.boardElement.style.gridTemplateRows = `repeat(${this.grid}, 1fr)`;
    this.boardElement.innerHTML = "";
    const emptyIndex = this.board.indexOf(0);

    this.board.forEach((pieceId, index) => {
      const element = document.createElement("div");
      element.setAttribute("role", "gridcell");

      if (pieceId === 0) {
        element.className = "puzzle-empty";
        this.boardElement.appendChild(element);
        return;
      }

      const movable = getNeighborIndexes(emptyIndex, this.grid).includes(index);

      element.className = movable ? "puzzle-tile is-movable" : "puzzle-tile";
      element.style.backgroundImage = `url("${this.tileTextures.get(pieceId)}")`;
      element.dataset.pieceId = String(pieceId);
      element.tabIndex = this.enabled ? 0 : -1;
      element.setAttribute("aria-label", `ピース ${pieceId}`);

      const label = document.createElement("span");
      label.className = "puzzle-tile-index";
      label.textContent = String(pieceId);
      element.appendChild(label);

      this.boardElement.appendChild(element);
    });
  }
}
