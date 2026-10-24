// Cliente SABELO: solo consume estado público. Las respuestas correctas viven en el servidor.
const socket = io();
const SESSION_KEY = 'sabelo-reconnect-session';
let roomState = null;
let roomAction = 'unirse';
let playerRole = 'jugador';
let playerName = '';
let isHost = false;
let transitionPending = false;
let pendingQuestion = null;
let timerInterval = null;

function changeScreen(id) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === id));
}
function notifyError(message) { window.alert(message); }
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
function session() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function saveSession(data) { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); }

function seleccionarRol(role) {
  playerRole = role;
  document.getElementById('btn-role-player').classList.toggle('active-role', role === 'jugador');
  document.getElementById('btn-role-spectator').classList.toggle('active-role', role === 'espectador');
}

function irASala() {
  const name = document.getElementById('input-name').value.trim();
  if (!name) return notifyError('Por favor, ingresá tu nombre o alias.');
  playerName = name;
  document.getElementById('lbl-username').textContent = name;
  document.getElementById('lbl-role').textContent = playerRole === 'jugador' ? 'Jugador' : 'Espectador';
  document.getElementById('create-room-option').style.display = playerRole === 'espectador' ? 'none' : '';
  mostrarOpcionSala('unirse');
  changeScreen('screen-room');
}

function mostrarOpcionSala(action) {
  if (action === 'crear' && playerRole === 'espectador') return;
  roomAction = action;
  const input = document.getElementById('input-room');
  document.getElementById('room-action-container').style.display = 'block';
  document.getElementById('room-input-label').textContent = action === 'crear' ? 'Código para la nueva sala' : 'Código de sala existente';
  document.getElementById('btn-room-action').textContent = action === 'crear' ? 'Crear sala' : 'Unirme';
  input.value = action === 'crear' ? `TRIVIA-${Math.floor(1000 + Math.random() * 9000)}` : '';
}

function acceptRoom(response, code) {
  if (response.error) return notifyError(response.error);
  isHost = response.isHost;
  roomState = response.state;
  saveSession({ code, participantId: response.participantId, reconnectToken: response.reconnectToken });
  const participant = roomState.players.find(player => player.id === response.participantId) || roomState.spectators.find(item => item.id === response.participantId);
  if (participant) playerName = participant.name;
  document.getElementById('lbl-username').textContent = playerName;
  document.getElementById('lbl-room').textContent = code;
  document.getElementById('header-user-info').style.display = 'flex';
  renderState();
}

function procesarIngresoSala() {
  const code = document.getElementById('input-room').value.trim().toUpperCase();
  if (!code) return notifyError('Ingresá un código de sala válido.');
  const event = roomAction === 'crear' ? 'room:create' : 'room:join';
  socket.emit(event, { code, name: playerName, role: playerRole }, response => acceptRoom(response, code));
}

function restoreSession() {
  const saved = session();
  if (!saved) return;
  socket.emit('room:rejoin', saved, response => {
    if (response.error) return localStorage.removeItem(SESSION_KEY);
    acceptRoom(response, saved.code);
  });
}

socket.on('connect', restoreSession);
socket.on('room:state', state => { roomState = state; renderState(); });
socket.on('question:opened', renderQuestion);
socket.on('question:passed', payload => { pendingQuestion = payload; });
socket.on('answer:result', showAnswerResult);
socket.on('game:finished', () => { if (!transitionPending) renderPodium(); });

function ownPlayer() { return roomState?.players.find(player => player.id === session()?.participantId); }
function turnPlayer() { return roomState?.players.find(player => player.id === roomState.turnPlayerId); }
function isMyTurn() { return roomState?.turnPlayerId === session()?.participantId; }

function renderState() {
  if (!roomState) return;
  const own = ownPlayer();
  document.getElementById('current-score').textContent = own ? own.score : '—';
  if (transitionPending) return;
  if (roomState.matchStatus === 'finished') return renderPodium();
  if (!roomState.categoryKey) return renderCategories();
  renderBoard();
  if (roomState.activeQuestion && document.getElementById('screen-question').classList.contains('active')) startTimer(roomState.activeQuestion.endsAt);
}

function renderCategories() {
  const container = document.getElementById('main-categories-container');
  container.replaceChildren();
  const note = document.createElement('p'); note.className = 'room-note';
  note.textContent = isHost ? 'Elegí una categoría para iniciar una partida.' : 'Esperando que el anfitrión elija la categoría.';
  container.append(note);
  Object.entries(roomState.catalog).forEach(([key, category]) => {
    const card = document.createElement('button'); card.className = 'category-card';
    card.innerHTML = `<h3>${category.title}</h3><p>6 subcategorías · 100 a 500 puntos</p>`;
    card.disabled = !isHost;
    card.onclick = () => socket.emit('category:select', { categoryKey: key }, reportError);
    container.append(card);
  });
  changeScreen('screen-categories');
}

function renderTurnStatus() {
  const turn = turnPlayer();
  const label = turn ? `TURNO DE: ${turn.name}${isMyTurn() ? ' — ¡ES TU TURNO!' : ''}` : 'Esperando jugadores';
  document.getElementById('turn-label').textContent = label;
  document.getElementById('spectators-label').textContent = roomState.spectators.length ? roomState.spectators.map(item => item.name).join(', ') : 'Ninguno';
  document.getElementById('players-scoreboard').innerHTML = roomState.players.map(player => `<span class="player-score ${player.id === roomState.turnPlayerId ? 'is-turn' : ''} ${!player.connected ? 'is-offline' : ''}">${escapeHtml(player.name)}: ${player.score}</span>`).join('');
}

function renderBoard() {
  const category = roomState.catalog[roomState.categoryKey];
  if (!category) return;
  document.getElementById('active-category-title').textContent = category.title;
  document.getElementById('btn-exit-match').style.display = isHost ? '' : 'none';
  renderTurnStatus();
  const entries = Object.entries(category.subcategories);
  const points = [...new Set(entries.flatMap(([, sub]) => sub.questions.map(question => question.points)))].sort((a, b) => a - b);
  const table = document.createElement('div'); table.className = 'jeopardy-board';
  table.innerHTML = `<div class="corner">Puntos</div>${entries.map(([, sub]) => `<div class="board-heading">${sub.title}</div>`).join('')}`;
  points.forEach(pointsValue => {
    table.insertAdjacentHTML('beforeend', `<div class="point-label">${pointsValue}</div>`);
    entries.forEach(([subKey, sub]) => {
      const qIndex = sub.questions.findIndex(question => question.points === pointsValue);
      const used = roomState.usedQuestions.includes(`${roomState.categoryKey}:${subKey}:${qIndex}`);
      const button = document.createElement('button'); button.className = `board-tile ${used ? 'used' : ''}`;
      button.textContent = used ? '✓' : pointsValue;
      button.disabled = used || !isMyTurn() || Boolean(roomState.activeQuestion);
      button.title = used ? 'Pregunta jugada' : isMyTurn() ? 'Seleccionar pregunta' : 'Esperá tu turno';
      button.onclick = () => socket.emit('question:select', { subKey, qIndex }, reportError);
      table.append(button);
    });
  });
  document.getElementById('subcategories-container').replaceChildren(table);
  if (!roomState.activeQuestion) changeScreen('screen-subcategories');
}

function renderQuestion(payload) {
  const category = roomState.catalog[payload.categoryKey]; const subcategory = category.subcategories[payload.subKey];
  document.getElementById('q-category').textContent = `${category.title} › ${subcategory.title}`;
  document.getElementById('q-points').textContent = `Valor: ${payload.question.points} pts`;
  document.getElementById('q-text').textContent = payload.question.q;
  const turn = turnPlayer();
  document.getElementById('question-turn-message').textContent = isMyTurn() ? '¡ES TU TURNO! Elegí una respuesta antes de que termine el minuto.' : `ES EL TURNO DE ${turn?.name || 'un jugador'}.`;
  const options = document.getElementById('options-container'); options.replaceChildren();
  payload.question.options.forEach((option, answer) => {
    const button = document.createElement('button'); button.className = 'option-btn'; button.textContent = option; button.disabled = !isMyTurn();
    button.onclick = () => socket.emit('answer:submit', { answer }, reportError);
    options.append(button);
  });
  startTimer(payload.endsAt); changeScreen('screen-question');
}

function showAnswerResult(result) {
  document.querySelectorAll('.option-btn').forEach(button => { button.disabled = true; button.classList.remove('correct', 'incorrect'); });
  document.getElementById('question-turn-message').textContent = `${result.playerName} respondió ${result.correct ? 'correctamente.' : 'incorrectamente.'}`;
  clearInterval(timerInterval); transitionPending = true;
  window.setTimeout(() => {
    transitionPending = false;
    if (pendingQuestion) { const next = pendingQuestion; pendingQuestion = null; renderQuestion(next); }
    else renderState();
  }, 1200);
}

function startTimer(endsAt) {
  clearInterval(timerInterval);
  const update = () => {
    const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    document.getElementById('timer').textContent = `Tiempo: ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (!seconds) clearInterval(timerInterval);
  };
  update(); timerInterval = window.setInterval(update, 250);
}

function renderPodium() {
  if (!roomState?.categoryKey) return;
  clearInterval(timerInterval);
  const leaders = [...roomState.players].sort((a, b) => b.score - a.score).slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  document.getElementById('final-message').innerHTML = `<strong>Podio de ${roomState.catalog[roomState.categoryKey].title}</strong><br><br>${leaders.map((player, index) => `${medals[index]} ${escapeHtml(player.name)} — ${player.score} pts`).join('<br>')}`;
  document.querySelector('#screen-gameover .btn-primary').style.display = isHost ? '' : 'none';
  changeScreen('screen-gameover');
}

function reportError(response) { if (response?.error) notifyError(response.error); }
function volverACategorias() { socket.emit('match:reset', {}, reportError); }
function reiniciarJuegoCompleto() { socket.emit('match:reset', {}, reportError); }
