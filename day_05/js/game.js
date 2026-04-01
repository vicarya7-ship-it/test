/* ══════════════════════════════════════
   イントロドン！ — game.js
   ══════════════════════════════════════ */

const GENRES = [
  { id: 'jpop', label: 'J-POP', emoji: '🎌', term: 'japanese pop', country: 'jp' },
  { id: 'anime', label: 'アニメ', emoji: '⛩️', term: 'anime', country: 'jp' },
  { id: 'kpop', label: 'K-POP', emoji: '💜', term: 'kpop', country: 'us' },
  { id: 'pop', label: '洋楽 POP', emoji: '🌍', term: 'pop hits', country: 'us' },
  { id: 'rock', label: 'ロック', emoji: '🎸', term: 'rock', country: 'us' },
  { id: 'hiphop', label: 'HIP HOP', emoji: '🎤', term: 'hip hop', country: 'us' },
  { id: 'classic', label: '懐メロ', emoji: '📻', term: 'classic hits', country: 'jp' },
  { id: 'random', label: 'ランダム', emoji: '🎲', term: 'music', country: 'jp' },
];

const LEVELS = [
  { seconds: 1, label: '1秒', pts: 500 },
  { seconds: 3, label: '3秒', pts: 400 },
  { seconds: 5, label: '5秒', pts: 300 },
  { seconds: 10, label: '10秒', pts: 200 },
  { seconds: 30, label: '30秒', pts: 100 },
];

const WBAR_COUNT = 32;
const MIN_SONGS_REQUIRED = 4;
const MAX_ARTIST_RESULTS = 8;
const FALLBACK_SHARE_URL = 'https://example.com/mainichi/day_05';

let state = {
  playMode: 'genre',
  selectedGenre: null,
  questionCount: 10,
  artistResults: [],
  selectedArtist: null,
  selectedArtistSongs: [],
  selectedArtistLoading: false,
  selectedArtistError: '',
  songs: [],
  queue: [],
  currentSong: null,
  choices: [],
  qIndex: 0,
  score: 0,
  level: 0,
  history: [],
  isPlaying: false,
  hasPlayed: false,
  answered: false,
  playTimer: null,
  retryConfig: null,
};

const artistSongCache = new Map();
let shareFeedbackTimer = null;

const $ = id => document.getElementById(id);
const screens = {
  title: $('screen-title'),
  loading: $('screen-loading'),
  quiz: $('screen-quiz'),
  result: $('screen-result'),
};
const audio = $('audio-player');

function showScreen(name) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  if (screens[name]) screens[name].classList.add('active');
}

function initApp() {
  buildWaveformBars();
  renderGenreButtons();
  bindTitleControls();
  bindGameControls();
  setPlayMode(state.playMode);
  setLoadingMessage('楽曲を読み込み中...');
  setSearchStatus('アーティスト名で検索して、遊びたい1組を選んでください。');
  updateShareUrlLabel();
  syncStartButton();
  showScreen('title');
}

function bindTitleControls() {
  document.querySelectorAll('.mode-btn').forEach(button => {
    button.addEventListener('click', () => {
      setPlayMode(button.dataset.mode);
    });
  });

  $('artist-search-form').addEventListener('submit', handleArtistSearch);

  document.querySelectorAll('.count-btn').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.count-btn').forEach(node => node.classList.remove('active'));
      button.classList.add('active');
      state.questionCount = Number(button.dataset.count);
      renderSelectedArtist();
      syncStartButton();
    });
  });

  $('start-btn').addEventListener('click', startGame);
}

function bindGameControls() {
  $('btn-play').addEventListener('click', playAudio);
  $('btn-hint').addEventListener('click', handleHint);
  $('btn-quiz-title').addEventListener('click', returnToTitle);
  $('btn-answer-next').addEventListener('click', advanceAfterAnswer);
  $('btn-answer-title').addEventListener('click', returnToTitle);
  $('btn-share-x').addEventListener('click', shareToX);
  $('btn-copy-url').addEventListener('click', copyShareUrl);
  $('btn-retry').addEventListener('click', retryGame);
  $('btn-title').addEventListener('click', returnToTitle);
  audio.addEventListener('ended', finishPlaybackCycle);
}

function setPlayMode(mode) {
  state.playMode = mode;

  document.querySelectorAll('.mode-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });

  $('mode-panel-genre').classList.toggle('active', mode === 'genre');
  $('mode-panel-artist').classList.toggle('active', mode === 'artist');

  syncStartButton();
}

function renderGenreButtons() {
  const grid = $('genre-grid');
  grid.innerHTML = '';

  GENRES.forEach(genre => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'genre-btn';
    button.dataset.id = genre.id;

    if (state.selectedGenre?.id === genre.id) {
      button.classList.add('selected');
    }

    button.innerHTML = `
      <span class="genre-emoji">${genre.emoji}</span>
      <span class="genre-name">${escHtml(genre.label)}</span>
    `;

    button.addEventListener('click', () => {
      state.selectedGenre = genre;
      setPlayMode('genre');
      renderGenreButtons();
      syncStartButton();
    });

    grid.appendChild(button);
  });
}

async function handleArtistSearch(event) {
  event.preventDefault();
  setPlayMode('artist');

  const query = $('artist-search-input').value.trim();
  if (!query) {
    state.artistResults = [];
    renderArtistResults();
    setSearchStatus('検索したいアーティスト名を入力してください。', 'error');
    return;
  }

  toggleArtistSearchLoading(true);
  setSearchStatus(`「${query}」を検索中...`);

  try {
    const artists = await fetchArtists(query);
    state.artistResults = artists;
    renderArtistResults();

    if (artists.length === 0) {
      setSearchStatus('候補が見つかりませんでした。別の名前で試してください。', 'error');
      return;
    }

    setSearchStatus(`${artists.length}件見つかりました。遊びたいアーティストを選んでください。`, 'success');
  } catch (error) {
    console.error(error);
    state.artistResults = [];
    renderArtistResults();
    setSearchStatus('検索に失敗しました。少し時間を置いてもう一度お試しください。', 'error');
  } finally {
    toggleArtistSearchLoading(false);
  }
}

async function fetchArtists(query) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&attribute=artistTerm&limit=${MAX_ARTIST_RESULTS * 2}&lang=ja_jp&country=jp`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('artist search failed');
  }

  const data = await response.json();
  const seen = new Set();

  return data.results
    .filter(artist => artist.artistId && artist.artistName)
    .filter(artist => {
      if (seen.has(artist.artistId)) return false;
      seen.add(artist.artistId);
      return true;
    })
    .slice(0, MAX_ARTIST_RESULTS)
    .map(artist => ({
      artistId: artist.artistId,
      artistName: artist.artistName,
      displayArtistName: resolveArtistDisplayName(artist.artistName, artist.artistLinkUrl, {
        preferJapanese: containsJapanese(query),
      }),
      primaryGenreName: artist.primaryGenreName || 'Music',
      country: artist.country || 'Unknown',
      artistLinkUrl: artist.artistLinkUrl || '',
    }));
}

function renderArtistResults() {
  const resultsEl = $('artist-results');
  resultsEl.innerHTML = '';

  state.artistResults.forEach(artist => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'artist-result-card';

    if (state.selectedArtist?.artistId === artist.artistId) {
      button.classList.add('selected');
    }

    button.innerHTML = `
      <span class="artist-result-icon">${escHtml(buildArtistMark(getArtistLabel(artist)))}</span>
      <span class="artist-result-body">
        <span class="artist-result-name">${escHtml(getArtistLabel(artist))}</span>
        <span class="artist-result-meta">${escHtml(artist.primaryGenreName)} / ${escHtml(artist.country)}</span>
      </span>
    `;

    button.addEventListener('click', () => {
      selectArtist(artist);
    });

    resultsEl.appendChild(button);
  });
}

async function selectArtist(artist) {
  state.selectedArtist = artist;
  state.selectedArtistSongs = [];
  state.selectedArtistLoading = true;
  state.selectedArtistError = '';

  setPlayMode('artist');
  renderArtistResults();
  renderSelectedArtist();
  syncStartButton();
  setSearchStatus(`${getArtistLabel(artist)} のプレビュー曲を確認中...`);

  try {
    const songs = await ensureArtistSongs(artist);

    if (!state.selectedArtist || state.selectedArtist.artistId !== artist.artistId) {
      return;
    }

    state.selectedArtistSongs = songs;
    state.selectedArtistLoading = false;
    state.selectedArtistError = songs.length < MIN_SONGS_REQUIRED
      ? 'プレビュー付きの曲が4曲未満のため、このアーティストでは出題できません。'
      : '';

    syncArtistDisplayNameFromSongs(state.selectedArtist, songs);
    renderArtistResults();
    renderSelectedArtist();
    syncStartButton();

    if (state.selectedArtistError) {
      setSearchStatus(state.selectedArtistError, 'error');
      return;
    }

    const playableCount = Math.min(state.questionCount, songs.length);
    setSearchStatus(`${getArtistLabel(artist)} で遊べます。プレビュー曲 ${songs.length} 曲、出題は最大 ${playableCount} 問です。`, 'success');
  } catch (error) {
    console.error(error);

    if (!state.selectedArtist || state.selectedArtist.artistId !== artist.artistId) {
      return;
    }

    state.selectedArtistSongs = [];
    state.selectedArtistLoading = false;
    state.selectedArtistError = '曲の取得に失敗しました。別のアーティストを試してください。';
    renderSelectedArtist();
    syncStartButton();
    setSearchStatus(state.selectedArtistError, 'error');
  }
}

async function ensureArtistSongs(artist) {
  if (artistSongCache.has(artist.artistId)) {
    return artistSongCache.get(artist.artistId);
  }

  const url = `https://itunes.apple.com/lookup?id=${artist.artistId}&entity=song&limit=200&lang=ja_jp&country=jp`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('artist lookup failed');
  }

  const data = await response.json();
  const songs = normalizeSongs(data.results);
  artistSongCache.set(artist.artistId, songs);
  return songs;
}

async function fetchSongsByGenre(genre) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(genre.term)}&entity=song&media=music&limit=100&country=${genre.country}&lang=ja_jp`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('genre search failed');
  }

  const data = await response.json();
  return normalizeSongs(data.results);
}

function normalizeSongs(results) {
  const seen = new Set();

  return results
    .filter(item =>
      item.trackId &&
      item.trackName &&
      item.artistName &&
      item.previewUrl &&
      item.artworkUrl100 &&
      (!item.wrapperType || item.wrapperType === 'track') &&
      (!item.kind || item.kind === 'song')
    )
    .filter(item => {
      if (seen.has(item.trackId)) return false;
      seen.add(item.trackId);
      return true;
    })
    .map(item => ({
      ...item,
      displayTrackName: item.trackName,
      displayArtistName: resolveArtistDisplayName(item.artistName, item.artistViewUrl, {
        preferJapanese: item.country === 'JPN',
      }),
      artworkUrl300: item.artworkUrl100.replace('100x100', '300x300'),
    }));
}

function renderSelectedArtist() {
  const card = $('selected-artist-card');
  const noteEl = $('selected-artist-note');

  if (!state.selectedArtist) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  $('selected-artist-name').textContent = getArtistLabel(state.selectedArtist);

  if (state.selectedArtistLoading) {
    $('selected-artist-meta').textContent = `${state.selectedArtist.primaryGenreName} / 曲を確認中...`;
    noteEl.className = 'artist-selected-note muted';
    noteEl.textContent = 'プレビュー付きの曲数をチェックしています。少しだけお待ちください。';
    renderSelectedArtistArt();
    return;
  }

  const songsCount = state.selectedArtistSongs.length;
  const playableCount = Math.min(state.questionCount, songsCount);

  $('selected-artist-meta').textContent = `${state.selectedArtist.primaryGenreName} / プレビュー曲 ${songsCount} 曲`;

  if (state.selectedArtistError) {
    noteEl.className = 'artist-selected-note error';
    noteEl.textContent = state.selectedArtistError;
  } else if (songsCount < state.questionCount) {
    noteEl.className = 'artist-selected-note';
    noteEl.textContent = `${state.questionCount}問を選んでも、出題は利用できる ${playableCount} 問になります。`;
  } else {
    noteEl.className = 'artist-selected-note';
    noteEl.textContent = `${playableCount}問のイントロドンをこのアーティストで遊べます。`;
  }

  renderSelectedArtistArt();
}

function renderSelectedArtistArt() {
  const artEl = $('selected-artist-art');
  artEl.innerHTML = '';

  const song = state.selectedArtistSongs[0];
  if (song?.artworkUrl300) {
    artEl.classList.remove('artist-selected-placeholder');
    const image = document.createElement('img');
    image.src = song.artworkUrl300;
    image.alt = `${getArtistLabel(state.selectedArtist)} artwork`;
    artEl.appendChild(image);
    return;
  }

  artEl.classList.add('artist-selected-placeholder');
  artEl.textContent = buildArtistMark(getArtistLabel(state.selectedArtist));
}

function syncStartButton() {
  let disabled = true;
  let label = 'ジャンルを選んでスタート';

  if (state.playMode === 'genre') {
    disabled = !state.selectedGenre;
    label = state.selectedGenre ? 'ゲームスタート' : 'ジャンルを選んでスタート';
  } else {
    disabled = !state.selectedArtist || state.selectedArtistLoading || Boolean(state.selectedArtistError);

    if (!state.selectedArtist) {
      label = 'アーティストを選んでスタート';
    } else if (state.selectedArtistLoading) {
      label = '曲を確認中...';
    } else if (state.selectedArtistError) {
      label = '別のアーティストを選んでください';
    } else {
      label = 'ゲームスタート';
    }
  }

  $('start-btn').disabled = disabled;
  $('start-btn-label').textContent = label;
}

function toggleArtistSearchLoading(isLoading) {
  $('artist-search-btn').disabled = isLoading;
  $('artist-search-btn').textContent = isLoading ? '検索中...' : '検索';
}

function setSearchStatus(message, tone = 'normal') {
  const statusEl = $('search-status');
  statusEl.className = `search-status ${tone}`;
  statusEl.textContent = message;
}

function setLoadingMessage(message) {
  $('loading-text').textContent = message;
}

async function startGame() {
  const config = getCurrentGameConfig();
  if (!config) {
    return;
  }

  state.retryConfig = config.mode === 'genre'
    ? { mode: 'genre', genreId: config.genre.id }
    : { mode: 'artist', artist: { ...config.artist } };

  setLoadingMessage(config.loadingMessage);
  showScreen('loading');

  try {
    const songs = await resolveSongsForConfig(config);

    if (songs.length < MIN_SONGS_REQUIRED) {
      if (config.mode === 'artist') {
        state.selectedArtistError = 'プレビュー付きの曲が4曲未満のため、このアーティストでは出題できません。';
        renderSelectedArtist();
        syncStartButton();
      }

      alert('楽曲の取得に失敗しました。別のジャンルまたはアーティストで試してください。');
      showScreen('title');
      return;
    }

    prepareGameSession(songs);
    loadQuestion();
  } catch (error) {
    console.error(error);
    alert('通信エラーが発生しました。もう一度お試しください。');
    showScreen('title');
  }
}

function getCurrentGameConfig() {
  if (state.playMode === 'genre') {
    if (!state.selectedGenre) return null;
    return {
      mode: 'genre',
      genre: state.selectedGenre,
      loadingMessage: `${state.selectedGenre.label} の楽曲を読み込み中...`,
    };
  }

  if (!state.selectedArtist || state.selectedArtistLoading || state.selectedArtistError) {
    return null;
  }

  return {
    mode: 'artist',
    artist: state.selectedArtist,
    loadingMessage: `${getArtistLabel(state.selectedArtist)} の楽曲を読み込み中...`,
  };
}

async function resolveSongsForConfig(config) {
  if (config.mode === 'genre') {
    return fetchSongsByGenre(config.genre);
  }

  const songs = state.selectedArtistSongs.length
    ? state.selectedArtistSongs
    : await ensureArtistSongs(config.artist);

  state.selectedArtistSongs = songs;
  return songs;
}

function prepareGameSession(songs) {
  const totalQuestions = Math.min(state.questionCount, songs.length);

  state.songs = songs;
  state.queue = shuffle(songs).slice(0, totalQuestions);
  state.currentSong = null;
  state.choices = [];
  state.qIndex = 0;
  state.score = 0;
  state.level = 0;
  state.history = [];
  state.isPlaying = false;
  state.hasPlayed = false;
  state.answered = false;
  clearTimeout(state.playTimer);
  state.playTimer = null;
}

function loadQuestion() {
  if (state.qIndex >= state.queue.length) {
    showResult();
    return;
  }

  state.currentSong = state.queue[state.qIndex];
  state.level = 0;
  state.hasPlayed = false;
  state.answered = false;

  clearTimeout(state.playTimer);
  state.playTimer = null;

  audio.pause();
  audio.src = state.currentSong.previewUrl;
  audio.load();

  $('q-genre-badge').textContent = getCurrentChallengeName();
  $('q-count-label').textContent = `問題 ${state.qIndex + 1} / ${state.queue.length}`;
  $('score-display').textContent = state.score.toLocaleString();
  $('progress-bar').style.width = `${(state.qIndex / state.queue.length) * 100}%`;

  const artEl = $('album-art');
  artEl.src = state.currentSong.artworkUrl300 || state.currentSong.artworkUrl100;
  artEl.alt = `${getSongTrackLabel(state.currentSong)} artwork`;
  artEl.classList.add('blurred');
  $('art-overlay').classList.remove('hidden');

  updateLevelUI();
  buildChoices();
  resetAudioState();

  showScreen('quiz');
  hideAnswerOverlay();
}

function buildChoices() {
  const choicesEl = $('choices');
  choicesEl.innerHTML = '';

  const pool = state.songs.filter(song => song.trackId !== state.currentSong.trackId);
  const wrongs = shuffle(pool).slice(0, 3);
  const all = shuffle([state.currentSong, ...wrongs]);
  state.choices = all;

  all.forEach(song => {
    const button = document.createElement('button');
    button.className = 'choice-btn';
    button.dataset.trackId = String(song.trackId);
    button.innerHTML = `
      <span class="choice-track">${escHtml(getSongTrackLabel(song))}</span>
      <span class="choice-artist">${escHtml(getSongArtistLabel(song))}</span>
    `;

    button.addEventListener('click', () => {
      if (!state.hasPlayed || state.answered) return;
      answer(song);
    });

    choicesEl.appendChild(button);
  });
}

function buildWaveformBars() {
  const wrap = $('waveform-bars');
  wrap.innerHTML = '';

  for (let index = 0; index < WBAR_COUNT; index += 1) {
    const bar = document.createElement('div');
    bar.className = 'wbar';

    const minHeight = 6 + Math.random() * 8;
    const maxHeight = 20 + Math.random() * 32;
    bar.style.cssText = `--h-min:${minHeight}px; --h-max:${maxHeight}px; height:${minHeight}px; animation-delay:${(index * 0.04).toFixed(2)}s; animation-duration:${(0.3 + Math.random() * 0.4).toFixed(2)}s;`;
    wrap.appendChild(bar);
  }
}

function updateLevelUI() {
  const level = LEVELS[state.level];
  $('duration-now').textContent = level.label;

  document.querySelectorAll('.dot').forEach((dot, index) => {
    dot.classList.remove('active', 'used');
    if (index < state.level) dot.classList.add('used');
    if (index === state.level) dot.classList.add('active');
  });
}

async function playAudio() {
  if (state.isPlaying || state.answered) {
    return;
  }

  const level = LEVELS[state.level];
  state.isPlaying = true;
  state.hasPlayed = true;

  $('btn-play').disabled = true;
  $('btn-play').classList.add('playing');
  $('play-icon').textContent = '♪';
  $('play-label').textContent = `${level.label}再生中...`;
  $('btn-hint').disabled = true;
  $('waveform').classList.add('playing');

  try {
    audio.currentTime = 0;
    await audio.play();
  } catch (error) {
    console.error(error);
    resetAudioState();
    alert('音声の再生に失敗しました。');
    return;
  }

  clearTimeout(state.playTimer);
  state.playTimer = window.setTimeout(finishPlaybackCycle, level.seconds * 1000);
}

function finishPlaybackCycle() {
  if (!state.isPlaying) {
    return;
  }

  resetAudioState({
    disablePlay: state.answered,
    disableHint: state.answered,
  });
}

function resetAudioState({ disablePlay = false, disableHint = false } = {}) {
  clearTimeout(state.playTimer);
  state.playTimer = null;
  state.isPlaying = false;

  audio.pause();
  $('waveform').classList.remove('playing');
  $('btn-play').classList.remove('playing');
  $('btn-play').disabled = disablePlay || state.answered;
  $('play-icon').textContent = '▶';
  $('play-label').textContent = state.hasPlayed ? 'もう一度聴く' : '再生する';
  $('btn-hint').disabled = disableHint || state.answered || state.level >= LEVELS.length - 1;
}

function handleHint() {
  if (state.level >= LEVELS.length - 1 || state.answered) {
    return;
  }

  state.level += 1;
  updateLevelUI();
  playAudio();
}

function answer(song) {
  if (state.answered) {
    return;
  }

  const answerContinueTime = Math.max(0, audio.currentTime - 0.35);
  state.answered = true;
  clearTimeout(state.playTimer);
  state.playTimer = null;
  state.isPlaying = false;
  audio.pause();
  $('waveform').classList.remove('playing');
  $('btn-play').classList.remove('playing');
  $('btn-play').disabled = true;
  $('btn-hint').disabled = true;

  const isCorrect = song.trackId === state.currentSong.trackId;
  const pts = isCorrect ? LEVELS[state.level].pts : 0;

  if (isCorrect) {
    state.score += pts;
  }

  document.querySelectorAll('.choice-btn').forEach(button => {
    const trackId = Number(button.dataset.trackId);
    button.disabled = true;

    if (trackId === state.currentSong.trackId) {
      button.classList.add('correct');
    } else if (trackId === song.trackId && !isCorrect) {
      button.classList.add('wrong');
    } else {
      button.classList.add('dim');
    }
  });

  $('album-art').classList.remove('blurred');
  $('art-overlay').classList.add('hidden');

  if (isCorrect) {
    spawnConfetti();
  } else {
    spawnFlash();
  }

  state.history.push({
    song: state.currentSong,
    correct: isCorrect,
    pts,
    level: state.level,
  });

  showAnswerOverlay(isCorrect, pts);
  playAnswerAudio(answerContinueTime);
}

function showAnswerOverlay(isCorrect, pts) {
  const verdict = $('answer-verdict');
  verdict.textContent = isCorrect ? '🎉 正解！' : '😢 不正解...';
  verdict.className = `answer-verdict ${isCorrect ? 'correct' : 'wrong'}`;

  $('ans-art').src = state.currentSong.artworkUrl300 || state.currentSong.artworkUrl100;
  $('ans-art').alt = `${getSongTrackLabel(state.currentSong)} artwork`;
  $('ans-track').textContent = getSongTrackLabel(state.currentSong);
  $('ans-artist').textContent = getSongArtistLabel(state.currentSong);
  $('ans-pts').textContent = isCorrect ? `+${pts}pt` : '0pt';
  $('btn-answer-next').textContent = state.qIndex >= state.queue.length - 1 ? '結果を見る' : '次に進む';

  $('answer-overlay').classList.remove('hidden');
}

function hideAnswerOverlay() {
  $('answer-overlay').classList.add('hidden');
}

async function playAnswerAudio(startTime) {
  try {
    state.isPlaying = true;
    audio.currentTime = Math.max(0, Number.isFinite(startTime) ? startTime : audio.currentTime);
    $('waveform').classList.add('playing');
    await audio.play();
  } catch (error) {
    console.error(error);
    state.isPlaying = false;
    $('waveform').classList.remove('playing');
  }
}

function advanceAfterAnswer() {
  if (!state.answered) {
    return;
  }

  hideAnswerOverlay();
  state.qIndex += 1;
  loadQuestion();
}

function spawnConfetti() {
  const colors = ['#00e5ff', '#ff2d78', '#ffe500', '#00ff88', '#ffffff'];

  for (let index = 0; index < 40; index += 1) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left: ${Math.random() * 100}vw;
      top: -10px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration: ${0.8 + Math.random() * 1.2}s;
      animation-delay: ${Math.random() * 0.4}s;
      transform: rotate(${Math.random() * 360}deg);
      width: ${6 + Math.random() * 8}px;
      height: ${6 + Math.random() * 8}px;
    `;

    document.body.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove());
  }

  const scoreEl = $('score-display');
  scoreEl.textContent = state.score.toLocaleString();
  scoreEl.classList.remove('score-pop');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('score-pop');
}

function spawnFlash() {
  const flash = document.createElement('div');
  flash.className = 'flash';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());
}

function showResult() {
  resetAudioState({ disablePlay: true, disableHint: true });
  $('progress-bar').style.width = '100%';

  const correctCount = state.history.filter(entry => entry.correct).length;
  const totalCount = state.history.length;
  const correctRate = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;
  const avgLevel = totalCount
    ? state.history.reduce((sum, entry) => sum + entry.level, 0) / totalCount
    : 0;

  $('result-context').textContent = buildResultContext();
  $('result-score').textContent = state.score.toLocaleString();
  $('result-rank').textContent = buildRankText(correctRate);
  $('result-stats').innerHTML = `
    <div><strong>${correctCount} / ${totalCount}</strong>正解</div>
    <div><strong>${correctRate}%</strong>正答率</div>
    <div><strong>${(avgLevel + 1).toFixed(1)}</strong>平均ヒント</div>
  `;

  const historyEl = $('result-history');
  historyEl.innerHTML = '';

  state.history.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <img class="history-art" src="${escHtml(entry.song.artworkUrl100)}" alt="" />
      <div class="history-info">
        <div class="history-track">${escHtml(getSongTrackLabel(entry.song))}</div>
        <div class="history-artist">${escHtml(getSongArtistLabel(entry.song))}</div>
      </div>
      <span class="history-pts ${entry.correct ? 'correct' : 'wrong'}">
        ${entry.correct ? `+${entry.pts}` : '✗'}
      </span>
    `;
    historyEl.appendChild(item);
  });

  updateShareUrlLabel();
  setShareFeedback('');
  showScreen('result');
}

function retryGame() {
  if (!state.retryConfig) {
    return;
  }

  if (state.retryConfig.mode === 'genre') {
    const genre = GENRES.find(item => item.id === state.retryConfig.genreId);
    if (!genre) return;

    state.selectedGenre = genre;
    setPlayMode('genre');
    renderGenreButtons();
    syncStartButton();
  } else {
    state.selectedArtist = state.retryConfig.artist;
    state.selectedArtistSongs = artistSongCache.get(state.retryConfig.artist.artistId) || [];
    state.selectedArtistLoading = false;
    state.selectedArtistError = state.selectedArtistSongs.length < MIN_SONGS_REQUIRED
      ? 'プレビュー付きの曲が4曲未満のため、このアーティストでは出題できません。'
      : '';

    setPlayMode('artist');
    renderArtistResults();
    renderSelectedArtist();
    syncStartButton();
  }

  startGame();
}

function returnToTitle() {
  resetAudioState({ disablePlay: true, disableHint: true });
  audio.src = '';
  hideAnswerOverlay();
  renderGenreButtons();
  renderArtistResults();
  renderSelectedArtist();
  syncStartButton();
  showScreen('title');
}

function buildRankText(correctRate) {
  if (correctRate === 100) return '🏆 パーフェクト！イントロマスター！';
  if (correctRate >= 80) return '🌟 かなり強い！曲の記憶が冴えています。';
  if (correctRate >= 60) return '🎵 ナイス！しっかり聴けています。';
  if (correctRate >= 40) return '🎶 もう少しで伸びそう！';
  return '🎸 次はもっと上を狙いましょう！';
}

function buildResultContext() {
  if (state.playMode === 'genre') {
    return state.selectedGenre?.id === 'random'
      ? 'ランダム選曲で挑戦'
      : `${state.selectedGenre.label} ジャンルで挑戦`;
  }

  return `${getArtistLabel(state.selectedArtist)} の曲で挑戦`;
}

function shareToX() {
  if (state.history.length === 0) {
    return;
  }

  const url = getShareUrl();
  const text = buildShareText();
  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

function buildShareText() {
  const correctCount = state.history.filter(entry => entry.correct).length;
  const totalCount = state.history.length;
  const correctRate = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;
  return `「${getCurrentChallengeName()} イントロドン」で ${state.score}pt。${correctCount}/${totalCount}問正解 (${correctRate}%) #イントロドン`;
}

async function copyShareUrl() {
  const url = getShareUrl();

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      fallbackCopy(url);
    }

    setShareFeedback('URLをコピーしました。', 'success');
  } catch (error) {
    console.error(error);
    setShareFeedback('URLのコピーに失敗しました。', 'error');
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) {
    throw new Error('copy failed');
  }
}

function updateShareUrlLabel() {
  $('result-share-url').textContent = getShareUrl();
}

function setShareFeedback(message, tone = 'normal') {
  clearTimeout(shareFeedbackTimer);

  const feedbackEl = $('share-feedback');
  feedbackEl.className = `share-feedback ${tone}`;
  feedbackEl.textContent = message;

  if (!message) {
    return;
  }

  shareFeedbackTimer = window.setTimeout(() => {
    feedbackEl.textContent = '';
    feedbackEl.className = 'share-feedback';
  }, 2200);
}

function getShareUrl() {
  return /^https?:$/.test(window.location.protocol) ? window.location.href : FALLBACK_SHARE_URL;
}

function getCurrentChallengeName() {
  return state.playMode === 'genre'
    ? (state.selectedGenre?.label || 'ジャンル')
    : getArtistLabel(state.selectedArtist);
}

function buildArtistMark(name) {
  const compact = String(name).trim();
  return compact ? compact.charAt(0).toUpperCase() : '♪';
}

function getArtistLabel(artist) {
  return artist?.displayArtistName || artist?.artistName || 'アーティスト';
}

function getSongTrackLabel(song) {
  return song?.displayTrackName || song?.trackName || '';
}

function getSongArtistLabel(song) {
  return song?.displayArtistName || song?.artistName || '';
}

function syncArtistDisplayNameFromSongs(artist, songs) {
  if (!artist) {
    return;
  }

  const directSong = songs.find(song => song.artistId === artist.artistId && containsJapanese(getSongArtistLabel(song)));
  if (directSong) {
    artist.displayArtistName = getSongArtistLabel(directSong);
    return;
  }

  const localizedFromUrl = resolveArtistDisplayName(artist.artistName, artist.artistLinkUrl, {
    preferJapanese: true,
  });

  if (containsJapanese(localizedFromUrl)) {
    artist.displayArtistName = localizedFromUrl;
  }
}

function resolveArtistDisplayName(rawName, artistUrl, options = {}) {
  const fallback = rawName || '';
  const localized = extractAppleNameFromUrl(artistUrl);

  if (!localized || localized === fallback) {
    return fallback;
  }

  if (containsJapanese(fallback)) {
    return fallback;
  }

  if (options.preferJapanese && containsJapanese(localized)) {
    return localized;
  }

  return fallback;
}

function extractAppleNameFromUrl(url) {
  if (!url) {
    return '';
  }

  try {
    const { pathname } = new URL(url);
    const segments = pathname.split('/').filter(Boolean);
    const keyIndex = Math.max(segments.indexOf('artist'), segments.indexOf('album'));
    const slug = keyIndex >= 0 ? segments[keyIndex + 1] : '';

    return slug ? decodeURIComponent(slug).replace(/\+/g, ' ').trim() : '';
  } catch {
    return '';
  }
}

function containsJapanese(text) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(String(text || ''));
}

function shuffle(items) {
  const array = [...items];

  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }

  return array;
}

function escHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.addEventListener('DOMContentLoaded', initApp);
