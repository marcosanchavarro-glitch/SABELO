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
let currentTeamQuestion = null;
let teamSetupIsTest = false;
let reboundNotice = false;
let currentQuestionId = null;

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
socket.on('team:turn', payload => { currentTeamQuestion = payload; if (!transitionPending) renderTeamTurn(); });
socket.on('team:result', result => showTeamResult(result));
socket.on('team:finished', duel => renderTeamFinished(duel));
socket.on('tutorial:step-complete', () => { /* el estado público siguiente determina la pantalla de espera */ });

function ownPlayer() { return roomState?.players.find(player => player.id === session()?.participantId); }
function turnPlayer() { return roomState?.players.find(player => player.id === roomState.turnPlayerId); }
function isMyTurn() { return roomState?.turnPlayerId === session()?.participantId; }

function renderState() {
  if (!roomState) return;
  const own = ownPlayer();
  document.getElementById('current-score').textContent = own ? own.score : '—';
  if (transitionPending) return;
  if (roomState.teamDuel?.status === 'tutorial') return roomState.teamDuel.activeTurn ? renderTeamTurn() : renderTutorialWaiting();
  if (roomState.tutorial) return roomState.activeQuestion ? undefined : renderTutorialWaiting();
  if (roomState.teamDuel?.status === 'playing') return currentTeamQuestion ? renderTeamTurn() : undefined;
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
  if (isHost) {
    const duel = document.createElement('button'); duel.className = 'category-card';
    duel.innerHTML = '<h3>⚔️ Duelo de Equipos</h3><p>Trivia bíblica · 10 rondas · 30 segundos por turno</p>';
    duel.onclick = () => abrirConfiguracionDuelo(false); container.append(duel);
    const practice = document.createElement('button'); practice.className = 'category-card';
    practice.innerHTML = '<h3>🧪 Partida de prueba</h3><p>Probá equipos, turnos y sincronización sin historial competitivo.</p>';
    practice.onclick = () => abrirConfiguracionDuelo(true); container.append(practice);
  }
  changeScreen('screen-categories');
}

function integrantesPorEquipo() {
  const groups = { blue: [], red: [] };
  roomState.players.forEach((player, index) => groups[index % 2 ? 'red' : 'blue'].push(player));
  return groups;
}
function abrirConfiguracionDuelo(isTest) {
  if (!isHost) return;
  if (roomState.players.length < 2) return notifyError('Se requieren al menos dos jugadores para formar los equipos.');
  teamSetupIsTest = isTest;
  document.getElementById('team-setup-test-badge').hidden = !isTest;
  const teams = integrantesPorEquipo();
  document.getElementById('team-config-note').textContent = `Asignación automática: Azul (${teams.blue.map(p => p.name).join(', ')}) vs. Rojo (${teams.red.map(p => p.name).join(', ')}).`;
  ['blue', 'red'].forEach(key => {
    const select = document.getElementById(`${key}-captain`); select.replaceChildren();
    teams[key].forEach(player => { const option = document.createElement('option'); option.value = player.id; option.textContent = player.name; select.append(option); });
  });
  actualizarCapitanes(); changeScreen('screen-team-setup');
}
function actualizarCapitanes() {
  const fixed = document.getElementById('team-response-mode').value === 'captain-fixed';
  document.getElementById('captains-config').hidden = !fixed;
}
function iniciarDueloEquipos() {
  const responseMode = document.getElementById('team-response-mode').value;
  const captains = { blue: document.getElementById('blue-captain').value, red: document.getElementById('red-captain').value };
  socket.emit('team:begin', { responseMode, isTest: teamSetupIsTest, captains }, reportError);
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
  currentQuestionId = payload.id;
  const isTutorial = payload.tutorial;
  const category = !isTutorial && roomState.catalog[payload.categoryKey]; const subcategory = category?.subcategories[payload.subKey];
  document.getElementById('q-category').textContent = isTutorial ? 'RONDA 0 · TUTORIAL' : `${category.title} › ${subcategory.title}`;
  document.getElementById('q-points').textContent = isTutorial ? 'Práctica · 0 pts' : `Valor: ${payload.question.points} pts`;
  document.getElementById('q-text').textContent = payload.question.q;
  const turn = turnPlayer();
  const rebound = reboundNotice ? '¡REBOTE! ' : '';
  reboundNotice = false;
  document.getElementById('question-turn-message').textContent = `${rebound}${isMyTurn() ? '¡ES TU TURNO! Elegí una respuesta antes de que termine el minuto.' : `ES EL TURNO DE ${turn?.name || 'un jugador'}.`}`;
  const options = document.getElementById('options-container'); options.replaceChildren();
  payload.question.options.forEach((option, answer) => {
    const button = document.createElement('button'); button.className = 'option-btn'; button.textContent = option; button.disabled = !isMyTurn();
    button.onclick = () => socket.emit('answer:submit', { answer, questionId: currentQuestionId }, reportError);
    options.append(button);
  });
  startTimer(payload.endsAt); changeScreen('screen-question');
}

function renderTutorialWaiting() {
  const tutorial = roomState.teamDuel?.tutorial || roomState.tutorial;
  if (!tutorial) return;
  const complete = tutorial.status === 'complete';
  document.getElementById('tutorial-title').textContent = complete ? 'Ronda 0 completada' : 'Práctica guiada';
  document.getElementById('tutorial-message').textContent = complete
    ? 'La práctica terminó. El anfitrión puede iniciar la competencia oficial; los marcadores comenzarán en cero.'
    : `Práctica ${tutorial.completed} de ${tutorial.total} completada. El anfitrión decide cuándo continúa el siguiente turno.`;
  const button = document.getElementById('tutorial-action'); button.hidden = !isHost;
  button.textContent = complete ? 'Iniciar competencia oficial' : 'Continuar práctica';
  changeScreen('screen-tutorial');
}
function avanzarTutorial() {
  const tutorial = roomState?.teamDuel?.tutorial || roomState?.tutorial;
  socket.emit(tutorial?.status === 'complete' ? 'tutorial:begin-official' : 'tutorial:advance', {}, reportError);
}

function showAnswerResult(result) {
  document.querySelectorAll('.option-btn').forEach(button => { button.disabled = true; button.classList.remove('correct', 'incorrect'); });
  const message = result.status === 'correct' ? 'respondió correctamente.' : result.status === 'timeout' ? 'agotó el tiempo.' : 'respondió incorrectamente.';
  document.getElementById('question-turn-message').textContent = `${result.playerName} ${message}`;
  reboundNotice = result.status !== 'correct';
  clearInterval(timerInterval); transitionPending = true;
  window.setTimeout(() => {
    transitionPending = false;
    if (pendingQuestion) { const next = pendingQuestion; pendingQuestion = null; renderQuestion(next); }
    else renderState();
  }, 1200);
}

function startTimer(endsAt, targetId = 'timer') {
  clearInterval(timerInterval);
  const update = () => {
    const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    document.getElementById(targetId).textContent = `Tiempo: ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (!seconds) clearInterval(timerInterval);
  };
  update(); timerInterval = window.setInterval(update, 250);
}

function participantName(id) { return roomState.players.find(player => player.id === id)?.name || 'Participante'; }
function renderTeamTurn() {
  const payload = currentTeamQuestion; const duel = roomState?.teamDuel || payload?.duel;
  if (!payload || !duel || duel.status !== 'playing') return;
  const active = duel.activeTurn; const teamInfo = duel.teams[active.teamKey]; const responder = participantName(active.responderId);
  document.getElementById('team-test-badge').hidden = !(duel.isTest || active.tutorial);
  document.getElementById('team-test-badge').textContent = active.tutorial ? 'RONDA 0 · TUTORIAL' : 'MODO PRUEBA';
  document.getElementById('team-progress').textContent = active.tutorial ? `Tutorial ${duel.tutorial.completed + 1} de ${duel.tutorial.total}` : `Ronda ${duel.round} de 10 · Turno ${duel.turnNumber + 1} de ${duel.totalTurns}`;
  document.getElementById('team-active-label').textContent = `${teamInfo.name.toUpperCase()} · ${responder}`;
  document.getElementById('team-scores').innerHTML = ['blue', 'red'].map(key => `<div class="team-score ${key} ${key === active.teamKey ? 'active' : ''}">${duel.teams[key].name}: ${duel.teams[key].score}</div>`).join('');
  const mine = session()?.participantId === active.responderId;
  document.getElementById('team-turn-message').textContent = mine ? '¡ES TU TURNO! Enviá la respuesta del equipo.' : `Turno de ${responder} · ${teamInfo.name}.`;
  document.getElementById('team-q-text').textContent = payload.question.q;
  const options = document.getElementById('team-options-container'); options.replaceChildren();
  payload.question.options.forEach((option, answer) => { const button = document.createElement('button'); button.className = 'option-btn'; button.textContent = option; button.disabled = !mine; button.onclick = () => socket.emit('team:answer', { answer, questionId: active.id }, reportError); options.append(button); });
  startTimer(active.endsAt, 'team-timer'); changeScreen('screen-team-question');
}
function showTeamResult(result) {
  document.querySelectorAll('#team-options-container .option-btn').forEach(button => { button.disabled = true; });
  const base = result.status === 'correct' ? 'Respuesta registrada: +100 puntos para el equipo.' : result.status === 'timeout' ? 'Tiempo agotado. Sin puntos.' : 'Respuesta incorrecta. Sin puntos.';
  document.getElementById('team-turn-message').textContent = result.rebound ? `${base} ¡REBOTE! El otro equipo responde ahora.` : base;
  clearInterval(timerInterval); transitionPending = true;
  window.setTimeout(() => { transitionPending = false; if (roomState?.teamDuel?.status === 'playing') renderTeamTurn(); }, 1100);
}
function renderTeamFinished(duel) {
  clearInterval(timerInterval); currentTeamQuestion = null;
  const blue = duel.teams.blue; const red = duel.teams.red;
  const text = duel.result.tie ? `Empate: Azul ${blue.score} · Rojo ${red.score}` : `Ganó ${duel.result.winner === 'blue' ? blue.name : red.name}: ${blue.score} · ${red.score}`;
  document.getElementById('final-message').textContent = `${duel.isTest ? 'MODO PRUEBA · ' : ''}Duelo finalizado. ${text}`;
  document.querySelector('#screen-gameover .btn-primary').style.display = isHost ? '' : 'none'; changeScreen('screen-gameover');
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
