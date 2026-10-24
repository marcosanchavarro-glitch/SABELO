// Cliente SABELO: solo consume estado público. Las respuestas correctas viven en el servidor.
const socket = io();
const SESSION_KEY = 'sabelo-reconnect-session';
const ACTION_TIMEOUT_MS = 8000;
let roomState = null;
let roomStateVersion = 0;
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
let currentBroadcastQuestion = null;
let broadcastNotice = null;
let identityRequest = 0;
let pendingAction = null;
let restoreTimeout = null;
let roomCreateConfig = { mode: 'individual', responseMode: null };
let boardPage = 0;
const BOARD_PAGE_SIZE = 6;
const flowTimings = [];

const categoryIcons = {
  cultura: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="22"/><path d="M10 32h44M32 10c7 7 10 15 10 22s-3 15-10 22c-7-7-10-15-10-22s3-15 10-22Z"/></svg>',
  biblia: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 16c9-5 18-3 22 3v31c-6-6-14-7-22-3V16Zm44 0c-9-5-18-3-22 3v31c6-6 14-7 22-3V16Z"/><path d="M17 25h9m21 0h-9M17 33h9m21 0h-9"/></svg>',
  peliculas: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 23h40v29H12zM12 14h40v9H12zM20 14l7 9m8-9 7 9"/><path d="M23 34h18"/></svg>',
  musica: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M42 13v31"/><path d="M42 14 24 19v28"/><circle cx="18" cy="48" r="7"/><circle cx="36" cy="44" r="7"/></svg>',
  deportes: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="21"/><path d="m17 19 12 9-4 14m22-23-12 9 4 14m-17 8 10-8 10 8"/></svg>',
  argentina: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 18h40v28H12z"/><path d="M12 27h40"/><circle cx="32" cy="32" r="5"/></svg>',
  tecnologia: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="13" width="36" height="38" rx="3"/><path d="M25 56h14M32 51v5M22 23h20M22 31h13"/></svg>',
  ciencia_nat: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="32" rx="23" ry="10"/><ellipse cx="32" cy="32" rx="23" ry="10" transform="rotate(60 32 32)"/><ellipse cx="32" cy="32" rx="23" ry="10" transform="rotate(120 32 32)"/><circle cx="32" cy="32" r="4"/></svg>',
  random: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 16h32v32H16z"/><circle cx="25" cy="25" r="3"/><circle cx="39" cy="25" r="3"/><circle cx="25" cy="39" r="3"/><circle cx="39" cy="39" r="3"/></svg>'
};
function displayTitle(value) { return String(value).replace(/^[^\p{L}\p{N}]+/u, '').trim(); }

function isSpectatorSession() {
  return Boolean(roomState?.spectators?.some(spectator => spectator.id === session()?.participantId));
}
function changeScreen(id) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === id));
  renderSpectatorBroadcast(id);
}
function toggleBroadcastFullscreen() {
  const broadcast = document.getElementById('spectator-broadcast');
  if (!document.fullscreenElement) broadcast?.requestFullscreen?.();
  else document.exitFullscreen?.();
}
function broadcastScoreboard() {
  if (roomState?.teamDuel) {
    const duel = roomState.teamDuel;
    const active = duel.activeTurn?.teamKey;
    return ['blue', 'red'].map(key => `<article class="tv-team-score ${key === active ? 'is-active' : ''} ${key}"><span>${escapeHtml(duel.teams[key].name)}</span><b>${duel.teams[key].score}</b></article>`).join('<span class="tv-score-divider">—</span>');
  }
  return (roomState?.players || []).slice(0, 6).map(player => `<article class="tv-player-score ${player.id === roomState.turnPlayerId ? 'is-active' : ''}"><span>${escapeHtml(player.name)}</span><b>${player.score}</b></article>`).join('');
}
function renderSpectatorBroadcast(screenId = '') {
  const broadcast = document.getElementById('spectator-broadcast');
  if (!broadcast) return;
  const spectator = isSpectatorSession();
  document.body.classList.toggle('spectator-mode', spectator);
  broadcast.hidden = !spectator;
  if (!spectator || !roomState) return;

  const main = document.getElementById('broadcast-main');
  const footer = document.getElementById('broadcast-footer');
  const round = document.getElementById('broadcast-round');
  const duel = roomState.teamDuel;
  const active = duel?.activeTurn;
  const question = currentBroadcastQuestion?.question;
  const activePlayer = duel ? participantName(active?.responderId) : turnPlayer()?.name;
  const teamName = duel && active ? duel.teams[active.teamKey]?.name : null;
  const eventNotice = broadcastNotice;
  const isFinal = screenId === 'screen-team-final' || duel?.status === 'finished' || screenId === 'screen-podium' || roomState.matchStatus === 'finished';
  let markup;

  if (screenId === 'screen-team-final' || duel?.status === 'finished') {
    const result = duel?.result || {};
    const winner = result.winner ? duel.teams[result.winner].name : null;
    round.textContent = 'RESULTADO FINAL';
    markup = `<section class="tv-final ${result.tie ? 'tie' : result.winner || ''}"><p>RESULTADO OFICIAL</p><h2>${result.tie ? '¡EMPATE!' : `¡GANARON ${escapeHtml(winner || 'EL EQUIPO')}!`}</h2><div class="tv-final-scores">${broadcastScoreboard()}</div><span>Gracias por ser parte de SABELO EN VIVO</span></section>`;
  } else if (screenId === 'screen-podium' || roomState.matchStatus === 'finished') {
    let previousScore = null;
    let rank = 0;
    const ranking = [...roomState.players].sort((a, b) => b.score - a.score).slice(0, 3).map((player, index) => {
      if (player.score !== previousScore) rank = index + 1;
      previousScore = player.score;
      return { ...player, rank };
    });
    round.textContent = 'CLASIFICACIÓN FINAL';
    markup = `<section class="tv-podium"><p>RESULTADO OFICIAL</p><h2>EL PODIO</h2><div class="tv-podium-places">${ranking.map(player => `<article><span>${player.rank}</span><strong>${escapeHtml(player.name)}</strong><b>${player.score} PTS</b></article>`).join('')}</div></section>`;
  } else if (screenId === 'screen-team-lobby' || ((!duel && !roomState.categoryKey && !roomState.tutorial)) || (roomState.mode === 'teams' && !duel)) {
    const labels = roomState.teamLabels || { blue: 'Chicos', red: 'Chicas' };
    const groups = integrantesPorEquipo();
    round.textContent = 'PRÓXIMAMENTE';
    markup = roomState.mode === 'teams'
      ? `<section class="tv-waiting"><p>SABELO — CHICOS VS. CHICAS</p><h2>LA TRANSMISIÓN ESTÁ POR COMENZAR</h2><div class="tv-rosters">${['blue', 'red'].map(key => `<article class="${key}"><h3>${escapeHtml(labels[key])}</h3><p>${groups[key].map(player => escapeHtml(player.name)).join(' · ') || 'Esperando integrantes'}</p></article>`).join('')}</div><div class="tv-room-code">Código · ${escapeHtml(roomState.code)} ${copyButtonMarkup()}</div></section>`
      : `<section class="tv-waiting"><p>SABELO — TODOS CONTRA TODOS</p><h2>LA TRANSMISIÓN ESTÁ POR COMENZAR</h2><div class="tv-rosters solo"><article><h3>PARTICIPANTES</h3><p>${roomState.players.map(player => escapeHtml(player.name)).join(' · ') || 'Esperando participantes'}</p></article></div><div class="tv-room-code">Código · ${escapeHtml(roomState.code)} ${copyButtonMarkup()}</div></section>`;
  } else if (screenId === 'screen-tutorial' || duel?.status === 'tutorial' || roomState.tutorial) {
    round.textContent = 'RONDA 0 · TUTORIAL';
    const notice = eventNotice ? `<div class="tv-event ${eventNotice.kind}"><strong>${eventNotice.title}</strong><span>${escapeHtml(eventNotice.detail)}</span></div>` : '';
    markup = `<section class="tv-plate tutorial">${notice}<p>RONDA 0</p><h2>TUTORIAL</h2><strong>PRÁCTICA SIN PUNTUACIÓN</strong><span>${active ? `Turno de ${escapeHtml(teamName || activePlayer || 'un participante')}` : 'El anfitrión prepara el próximo turno.'}</span></section>`;
  } else if (question && (screenId === 'screen-question' || screenId === 'screen-team-question')) {
    round.textContent = duel ? `RONDA ${duel.round} · TURNO ${duel.turnNumber + 1}` : 'PREGUNTA EN JUEGO';
    const endsAt = active?.endsAt || currentBroadcastQuestion?.endsAt;
    const title = teamName ? `TURNO DE ${teamName.toUpperCase()}` : `TURNO DE ${escapeHtml(activePlayer || 'PARTICIPANTE')}`;
    const notice = eventNotice ? `<div class="tv-event ${eventNotice.kind}"><strong>${eventNotice.title}</strong><span>${escapeHtml(eventNotice.detail)}</span></div>` : '';
    markup = `<section class="tv-question ${eventNotice ? 'has-event' : ''}">${notice}<div class="tv-question-meta"><span>${title}</span><time data-broadcast-ends-at="${endsAt || ''}">TIEMPO EN JUEGO</time></div><h2>${escapeHtml(question.q)}</h2><div class="tv-options">${question.options.map(option => `<article>${escapeHtml(option)}</article>`).join('')}</div></section>`;
  } else {
    round.textContent = 'EN ESPERA';
    markup = `<section class="tv-plate"><p>SABELO EN VIVO</p><h2>PREPARANDO LA PRÓXIMA PREGUNTA</h2><span>La transmisión continúa en instantes.</span></section>`;
  }
  main.innerHTML = markup;
  footer.hidden = isFinal;
  footer.innerHTML = isFinal ? '' : broadcastScoreboard();
  syncBroadcastTimer();
}
function syncBroadcastTimer() {
  const timer = document.querySelector('[data-broadcast-ends-at]');
  if (!timer) return;
  const update = () => {
    const seconds = Math.max(0, Math.ceil((Number(timer.dataset.broadcastEndsAt) - Date.now()) / 1000));
    timer.textContent = `TIEMPO ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };
  update();
}
function notifyError(message) { window.alert(message); }
function setConnectionStatus(state, message) {
  const status = document.getElementById('connection-status');
  status.dataset.state = state;
  status.textContent = message;
}
function setActionStatus(message = '') {
  const status = document.getElementById('action-status');
  status.hidden = !message;
  status.textContent = message;
}
function markFlow(stage) {
  flowTimings.push({ stage, at: performance.now() });
  if (flowTimings.length > 30) flowTimings.shift();
  // Instrumentación local y temporal: útil para diagnosticar latencias sin enviar datos privados.
  window.__sabeloFlowTimings = flowTimings.slice();
}
function showLaunchFeedback(message) {
  const overlay = document.getElementById('game-launch-overlay');
  document.getElementById('game-launch-message').textContent = message;
  overlay.hidden = false;
}
function hideLaunchFeedback() { document.getElementById('game-launch-overlay').hidden = true; }
function copyButtonMarkup() {
  return '<button type="button" data-copy-code onclick="copyRoomCode()" aria-label="Copiar código de sala"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="1"></rect><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"></path></svg><span>Copiar</span></button>';
}
async function copyRoomCode() {
  const code = roomState?.code || document.getElementById('lbl-room').textContent;
  if (!/^SABELO-[A-Z0-9]+$/.test(code || '')) return setActionStatus('Todavía no hay un código de sala para copiar.');
  const buttons = [...document.querySelectorAll('[data-copy-code]')];
  const setCopyState = (text, failed = false) => buttons.forEach(button => {
    button.textContent = text; button.classList.toggle('copy-failed', failed); button.disabled = true;
  });
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
    else {
      const input = document.createElement('textarea'); input.value = code; input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select();
      const copied = document.execCommand('copy'); input.remove(); if (!copied) throw new Error('COPY_UNAVAILABLE');
    }
    setCopyState('¡Código copiado!');
  } catch {
    setCopyState('No se pudo copiar', true);
    setActionStatus('No se pudo copiar el código. Podés seleccionarlo y copiarlo manualmente.');
  }
  window.setTimeout(() => buttons.forEach(button => { button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="1"></rect><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0 1 1h3"></path></svg><span>Copiar</span>'; button.classList.remove('copy-failed'); button.disabled = false; }), 2000);
}
function resetToIdentity(message = '') {
  clearInterval(timerInterval);
  roomState = null; roomStateVersion = 0; currentTeamQuestion = null; pendingQuestion = null; isHost = false; boardPage = 0; hideLaunchFeedback();
  localStorage.removeItem(SESSION_KEY);
  document.getElementById('header-user-info').style.display = 'none';
  changeScreen('screen-identity');
  if (message) notifyError(message);
}
function finishPendingAction() {
  if (!pendingAction) return;
  clearTimeout(pendingAction.timer);
  if (pendingAction.button) pendingAction.button.disabled = false;
  pendingAction = null;
  setActionStatus('');
}
function sendAction(event, payload, { label, button, onSuccess, onError, onTimeout }) {
  if (!socket.connected) {
    setActionStatus('Sin conexión. Esperá a que SABELO se reconecte antes de continuar.');
    return notifyError('No hay conexión con la sala. Intentá nuevamente cuando figure “Conectado”.');
  }
  if (pendingAction) return;
  if (button) button.disabled = true;
  setActionStatus(label);
  const timer = setTimeout(() => {
    const wasCreateOrJoin = event === 'room:create' || event === 'room:join';
    finishPendingAction();
    const message = wasCreateOrJoin
      ? 'No recibimos confirmación. La solicitud podría haberse procesado; no la repitas hasta actualizar la página.'
      : 'No recibimos confirmación del servidor. Revisá la conexión e intentá de nuevo.';
    setActionStatus(message);
    onTimeout?.();
    notifyError(message);
  }, ACTION_TIMEOUT_MS);
  pendingAction = { timer, button };
  socket.emit(event, payload, response => {
    finishPendingAction();
    if (response?.error) return onError ? onError(response) : reportError(response);
    onSuccess?.(response || {});
  });
}
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
function session() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function saveSession(data) { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); }
function sameSession(left, right) {
  return Boolean(left && right
    && left.code === right.code
    && left.participantId === right.participantId
    && left.reconnectToken === right.reconnectToken);
}
function savedParticipantId() { return session()?.participantId || null; }
function syncIdentityFromState(participantId = savedParticipantId()) {
  if (!roomState || !participantId) return;
  const player = roomState.players.find(item => item.id === participantId);
  const spectator = roomState.spectators.find(item => item.id === participantId);
  const participant = player || spectator;
  const participantRole = spectator ? 'espectador' : 'jugador';
  isHost = Boolean(participant && roomState.hostId === participantId);
  if (participant) {
    playerName = participant.name;
    document.body.dataset.role = participantRole;
    document.getElementById('lbl-username').textContent = participant.name;
  }
  document.getElementById('lbl-role').textContent = isHost ? 'Anfitrión' : (participantRole === 'espectador' ? 'Espectador' : 'Jugador');
}

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
  if (action === 'crear') {
    seleccionarModalidadSala('individual');
    return changeScreen('screen-create-config');
  }
  const input = document.getElementById('input-room');
  document.getElementById('room-action-container').style.display = 'block';
  document.getElementById('room-input-label').textContent = action === 'crear' ? 'Código seguro (se genera al crear la sala)' : 'Código de sala existente';
  document.getElementById('btn-room-action').textContent = action === 'crear' ? 'Crear sala' : 'Unirme';
  input.value = '';
  input.disabled = action === 'crear';
}

function seleccionarModalidadSala(mode) {
  roomCreateConfig.mode = mode;
  roomCreateConfig.responseMode = mode === 'teams' ? 'individual' : null;
  document.querySelectorAll('[data-room-mode]').forEach(button => button.classList.toggle('active-role', button.dataset.roomMode === mode));
  document.getElementById('team-response-options').hidden = mode !== 'teams';
  document.getElementById('btn-create-config').textContent = mode === 'teams' ? 'Crear sala por equipos' : 'Crear sala individual';
  seleccionarRespuestaEquipo(roomCreateConfig.responseMode || 'individual');
}
function seleccionarRespuestaEquipo(responseMode) {
  roomCreateConfig.responseMode = roomCreateConfig.mode === 'teams' ? responseMode : null;
  document.querySelectorAll('[data-response-mode]').forEach(button => button.classList.toggle('active-role', button.dataset.responseMode === responseMode));
}
function crearSalaConfigurada() {
  const requestId = ++identityRequest;
  const button = document.getElementById('btn-create-config');
  sendAction('room:create', { name: playerName, ...roomCreateConfig }, {
    label: 'Creando sala…', button,
    onSuccess: response => acceptRoom(response, response.state?.code, requestId),
    onError: response => notifyError(response.error || 'No se pudo crear la sala.')
  });
}

function acceptRoom(response, code, requestId) {
  if (requestId !== identityRequest) return;
  if (response.error) return notifyError(response.error);
  const incomingVersion = Number.isInteger(response.state?.version) ? response.state.version : 0;
  const previousCategoryKey = roomState?.categoryKey;
  if (!roomState || incomingVersion >= roomStateVersion) {
    roomState = response.state;
    roomStateVersion = incomingVersion;
  }
  const actualCode = response.state?.code || code;
  if (previousCategoryKey !== roomState?.categoryKey) boardPage = 0;
  saveSession({ code: actualCode, participantId: response.participantId, reconnectToken: response.reconnectToken });
  syncIdentityFromState(response.participantId);
  document.getElementById('lbl-room').textContent = actualCode;
  document.getElementById('header-user-info').style.display = 'flex';
  renderState();
}

function procesarIngresoSala() {
  const code = document.getElementById('input-room').value.trim().toUpperCase();
  const event = roomAction === 'crear' ? 'room:create' : 'room:join';
  if (event === 'room:join' && !code) return notifyError('Ingresá un código de sala válido.');
  const requestId = ++identityRequest;
  const payload = event === 'room:create' ? { name: playerName } : { code, name: playerName, role: playerRole };
  sendAction(event, payload, {
    label: event === 'room:create' ? 'Creando sala…' : 'Uniéndote a la sala…',
    button: document.getElementById('btn-room-action'),
    onSuccess: response => acceptRoom(response, code, requestId),
    onError: response => notifyError(response.error || 'No se pudo completar la operación.')
  });
}

function restoreSession() {
  const saved = session();
  if (!saved || !socket.connected || pendingAction) return;
  const requestId = identityRequest;
  clearTimeout(restoreTimeout);
  restoreTimeout = setTimeout(() => {
    setActionStatus('No pudimos confirmar la sesión todavía. Verificá tu conexión antes de continuar.');
  }, ACTION_TIMEOUT_MS);
  socket.emit('room:rejoin', saved, response => {
    clearTimeout(restoreTimeout);
    // Una creación/unión iniciada después de la restauración siempre prevalece.
    // Así una respuesta atrasada no puede convertir al nuevo anfitrión en otra sesión.
    if (requestId !== identityRequest || !sameSession(session(), saved)) return;
    if (response?.error) {
      const message = response.code === 'ROOM_NOT_FOUND'
        ? 'La sala ya no existe en el servidor. Volvé a crearla o unirte a una sala activa.'
        : 'No se pudo recuperar tu sesión. Volvé a ingresar a una sala.';
      return resetToIdentity(message);
    }
    acceptRoom(response, saved.code, requestId);
  });
}

socket.on('connect', () => { setConnectionStatus('connected', 'Conectado'); restoreSession(); });
socket.on('disconnect', () => { clearTimeout(restoreTimeout); setConnectionStatus('reconnecting', 'Reconectando…'); });
socket.on('connect_error', () => setConnectionStatus('disconnected', 'Sin conexión'));
socket.on('room:state', state => {
  // Un evento de una sala anterior nunca puede conservar permisos visuales.
  const saved = session();
  if (!sameSession(saved, { ...saved, code: state.code })) return;
  const incomingVersion = Number.isInteger(state.version) ? state.version : 0;
  if (roomState && incomingVersion < roomStateVersion) return;
  const previousCategoryKey = roomState?.categoryKey;
  roomState = state;
  roomStateVersion = incomingVersion;
  if (previousCategoryKey !== state.categoryKey) boardPage = 0;
  if (state.categoryKey || state.activeQuestion) { markFlow('state:confirmed'); hideLaunchFeedback(); }
  syncIdentityFromState();
  renderState();
});
socket.on('question:opened', renderQuestion);
socket.on('question:passed', payload => { pendingQuestion = payload; });
socket.on('answer:result', showAnswerResult);
socket.on('game:finished', () => { if (!transitionPending) renderPodium(); });
socket.on('team:turn', payload => { currentTeamQuestion = payload; if (!transitionPending) renderTeamTurn(); });
socket.on('team:result', result => showTeamResult(result));
socket.on('team:finished', duel => renderTeamFinished(duel));
socket.on('tutorial:step-complete', () => { /* el estado público siguiente determina la pantalla de espera */ });
socket.on('room:closed', () => resetToIdentity('La sala fue cerrada por el anfitrión.'));

function ownPlayer() { return roomState?.players.find(player => player.id === session()?.participantId); }
function turnPlayer() { return roomState?.players.find(player => player.id === roomState.turnPlayerId); }
function isMyTurn() { return roomState?.turnPlayerId === session()?.participantId; }

function renderState() {
  if (!roomState) return;
  const own = ownPlayer();
  document.getElementById('current-score').textContent = own ? own.score : '—';
  if (transitionPending) return;
  if (roomState.mode === 'teams' && !roomState.teamDuel && !roomState.categoryKey) {
    const isSpectator = roomState.spectators.some(spectator => spectator.id === session()?.participantId);
    if (!isSpectator && !own?.teamKey) return renderTeamChoice();
    return renderTeamLobby();
  }
  if (roomState.teamDuel?.status === 'tutorial') return roomState.teamDuel.activeTurn ? renderTeamTurn() : renderTutorialWaiting();
  if (roomState.tutorial) return roomState.activeQuestion ? undefined : renderTutorialWaiting();
  if (roomState.teamDuel?.status === 'playing') return currentTeamQuestion ? renderTeamTurn() : undefined;
  if (roomState.matchStatus === 'finished') return renderPodium();
  if (!roomState.categoryKey) return renderCategories();
  renderBoard();
  if (roomState.activeQuestion && document.getElementById('screen-question').classList.contains('active')) startTimer(roomState.activeQuestion.endsAt);
}

function renderTeamChoice() {
  changeScreen('screen-team-choice');
}
function elegirBando(teamKey) {
  sendAction('team:choose', { teamKey }, {
    label: 'Guardando tu bando…',
    onSuccess: () => {},
    onError: reportError
  });
}
function integrantesPorEquipo() {
  const groups = { blue: [], red: [] };
  roomState.players.forEach((player, index) => {
    const key = roomState.mode === 'teams' ? player.teamKey : (index % 2 ? 'red' : 'blue');
    if (groups[key]) groups[key].push(player);
  });
  return groups;
}
function renderTeamLobby() {
  const groups = integrantesPorEquipo();
  const labels = roomState.teamLabels || { blue: 'Chicos', red: 'Chicas' };
  const note = document.getElementById('team-lobby-note');
  const pending = roomState.players.filter(player => !player.teamKey);
  note.textContent = pending.length
    ? `Falta elegir bando: ${pending.map(player => player.name).join(', ')}.`
    : 'Equipos listos. El anfitrión puede preparar la Ronda 0.';
  const roster = document.getElementById('team-lobby-rosters'); roster.replaceChildren();
  ['blue', 'red'].forEach(teamKey => {
    const panel = document.createElement('section'); panel.className = `team-roster ${teamKey}`;
    const members = groups[teamKey];
    panel.innerHTML = `<p class="team-choice-kicker">${teamKey === 'blue' ? 'EQUIPO AZUL' : 'EQUIPO ROJO'}</p><h3>${labels[teamKey]}</h3><p class="team-roster-count">${members.length} integrante${members.length === 1 ? '' : 's'}</p>`;
    const list = document.createElement('ul');
    members.forEach(player => {
      const item = document.createElement('li');
      item.textContent = `${player.name}${player.connected ? '' : ' · desconectado'}`;
      if (isHost) {
        const move = document.createElement('button'); move.className = 'team-move'; move.textContent = `Mover a ${labels[teamKey === 'blue' ? 'red' : 'blue']}`;
        move.onclick = () => asignarEquipo(player.id, teamKey === 'blue' ? 'red' : 'blue'); item.append(move);
      }
      list.append(item);
    });
    panel.append(list); roster.append(panel);
  });
  if (isHost && pending.length) {
    const panel = document.createElement('section'); panel.className = 'team-roster pending'; panel.innerHTML = '<p class="team-choice-kicker">PENDIENTES</p><h3>Sin bando</h3>';
    const list = document.createElement('ul');
    pending.forEach(player => {
      const item = document.createElement('li'); item.textContent = player.name;
      ['blue', 'red'].forEach(teamKey => { const move = document.createElement('button'); move.className = 'team-move'; move.textContent = `Asignar a ${labels[teamKey]}`; move.onclick = () => asignarEquipo(player.id, teamKey); item.append(move); });
      list.append(item);
    }); panel.append(list); roster.append(panel);
  }
  const start = document.getElementById('team-lobby-start');
  const ready = !pending.length && groups.blue.length > 0 && groups.red.length > 0;
  start.hidden = !isHost; start.disabled = !ready;
  changeScreen('screen-team-lobby');
}
function asignarEquipo(participantId, teamKey) {
  sendAction('team:assign', { participantId, teamKey }, { label: 'Actualizando equipos…', onSuccess: () => {}, onError: reportError });
}
function prepararDueloConfigurado() {
  if (!isHost) return;
  abrirConfiguracionDuelo(false);
}

function renderCategories() {
  const container = document.getElementById('main-categories-container');
  container.replaceChildren();
  const note = document.createElement('p'); note.className = 'room-note';
  note.textContent = isHost ? 'Elegí una categoría para iniciar una partida.' : 'Esperando que el anfitrión elija la categoría.';
  container.append(note);
  Object.entries(roomState.catalog).forEach(([key, category]) => {
    const card = document.createElement('button'); card.className = 'category-card';
    card.innerHTML = `<span class="category-icon">${categoryIcons[key] || categoryIcons.random}</span><h3>${escapeHtml(displayTitle(category.title))}</h3><p>Subcategorías · tablero de puntajes</p>`;
    card.disabled = !isHost || Boolean(pendingAction);
    card.onclick = () => selectCategory(key);
    container.append(card);
  });
  if (isHost) {
    const duel = document.createElement('button'); duel.className = 'category-card';
    duel.innerHTML = `<span class="category-icon">${categoryIcons.deportes}</span><h3>Duelo de equipos</h3><p>Trivia bíblica · 10 rondas · 30 segundos por turno</p>`;
    duel.onclick = () => abrirConfiguracionDuelo(false); container.append(duel);
    const practice = document.createElement('button'); practice.className = 'category-card';
    practice.innerHTML = `<span class="category-icon">${categoryIcons.ciencia_nat}</span><h3>Partida de prueba</h3><p>Probá equipos, turnos y sincronización sin historial competitivo.</p>`;
    practice.onclick = () => abrirConfiguracionDuelo(true); container.append(practice);
  }
  changeScreen('screen-categories');
}
function selectCategory(categoryKey) {
  if (!isHost) return notifyError('Esperando la confirmación de tu sesión de anfitrión. Actualizá la página si el problema continúa.');
  markFlow('category:click'); showLaunchFeedback('INICIANDO RONDA 0…');
  sendAction('category:select', { categoryKey }, {
    label: 'Iniciando categoría…',
    onSuccess: () => markFlow('category:ack'),
    onTimeout: () => { hideLaunchFeedback(); markFlow('category:timeout'); },
    onError: response => {
    hideLaunchFeedback(); markFlow('category:error');
    // Safari y navegadores integrados pueden reconectar el socket sin recargar
    // la vista. Reautenticar el token vigente devuelve la identidad al socket.
    if (response.code === 'ROOM_NOT_FOUND') return resetToIdentity('La sala ya no existe en el servidor.');
    if (response.error === 'Solo el anfitrión puede elegir una categoría disponible.') return restoreSession();
    reportError(response);
    }
  });
}

function abrirConfiguracionDuelo(isTest) {
  if (!isHost) return;
  if (roomState.players.length < 2) return notifyError('Se requieren al menos dos jugadores para formar los equipos.');
  teamSetupIsTest = isTest;
  if (!isTest && roomState.mode === 'teams') document.getElementById('team-response-mode').value = roomState.responseMode;
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
  sendAction('team:begin', { responseMode, isTest: teamSetupIsTest, captains }, { label: 'Iniciando Ronda 0…', onSuccess: () => {}, onError: reportError });
}

function hasDisplayName(participant) { return typeof participant?.name === 'string' && /[\p{L}\p{N}]/u.test(participant.name); }
function renderTurnStatus() {
  const turn = turnPlayer();
  const label = hasDisplayName(turn)
    ? `TURNO DE: ${turn.name}${isMyTurn() ? ' — ¡ES TU TURNO!' : ''}`
    : roomState.turnPlayerId ? 'Sincronizando participante activo…' : 'Esperando jugadores';
  document.getElementById('turn-label').textContent = label;
  document.getElementById('spectators-label').textContent = roomState.spectators.length ? roomState.spectators.filter(hasDisplayName).map(item => item.name).join(', ') || 'Sincronizando' : 'Ninguno';
  const scoreboard = roomState.players.filter(hasDisplayName).map(player => `<span class="player-score ${player.id === roomState.turnPlayerId ? 'is-turn' : ''} ${!player.connected ? 'is-offline' : ''}">${escapeHtml(player.name)}: ${player.score}</span>`).join('');
  document.getElementById('players-scoreboard').innerHTML = scoreboard || '<span class="player-score state-pending">Sincronizando participantes…</span>';
}

function renderBoard() {
  const category = roomState.catalog[roomState.categoryKey];
  if (!category) return;
  document.getElementById('active-category-title').textContent = displayTitle(category.title);
  document.getElementById('btn-exit-match').style.display = isHost ? '' : 'none';
  renderTurnStatus();
  const entries = Object.entries(category.subcategories);
  const totalPages = Math.max(1, Math.ceil(entries.length / BOARD_PAGE_SIZE));
  boardPage = Math.min(Math.max(0, boardPage), totalPages - 1);
  const pageEntries = entries.slice(boardPage * BOARD_PAGE_SIZE, (boardPage + 1) * BOARD_PAGE_SIZE);
  const points = [...new Set(pageEntries.flatMap(([, sub]) => sub.questions.map(question => question.points)))].sort((a, b) => a - b);
  const controls = document.createElement('nav'); controls.className = 'board-pagination'; controls.setAttribute('aria-label', 'Páginas de subcategorías');
  controls.innerHTML = `<button type="button" class="btn-secondary" ${boardPage === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${boardPage + 1} de ${totalPages}</span><button type="button" class="btn-secondary" ${boardPage >= totalPages - 1 ? 'disabled' : ''}>Siguiente</button>`;
  const [previous, next] = controls.querySelectorAll('button');
  previous.onclick = () => { boardPage -= 1; renderBoard(); };
  next.onclick = () => { boardPage += 1; renderBoard(); };
  const table = document.createElement('div'); table.className = 'jeopardy-board'; table.style.setProperty('--board-columns', pageEntries.length); table.style.setProperty('--board-rows', points.length);
  pageEntries.forEach(([subKey, sub]) => {
    const column = document.createElement('section'); column.className = 'board-column';
    column.setAttribute('aria-label', `Subcategoría ${sub.title}`);
    const heading = document.createElement('h3'); heading.className = 'board-heading'; heading.textContent = sub.title; column.append(heading);
    points.forEach(pointsValue => {
      const qIndex = sub.questions.findIndex(question => question.points === pointsValue);
      if (qIndex < 0) { const empty = document.createElement('div'); empty.className = 'board-tile board-empty'; empty.textContent = '—'; empty.setAttribute('aria-label', `${sub.title}: sin pregunta para ${pointsValue} puntos`); column.append(empty); return; }
      const used = roomState.usedQuestions.includes(`${roomState.categoryKey}:${subKey}:${qIndex}`);
      const button = document.createElement('button'); button.className = `board-tile ${used ? 'used' : ''}`;
      button.textContent = used ? 'JUGADA' : pointsValue;
      button.disabled = used || !isMyTurn() || Boolean(roomState.activeQuestion) || Boolean(pendingAction);
      button.title = used ? 'Pregunta consumida' : isMyTurn() ? 'Seleccionar pregunta' : 'Esperá tu turno';
      button.setAttribute('aria-label', `${sub.title}: ${used ? 'pregunta de ' : ''}${pointsValue} puntos${used ? ', ya jugada' : ''}`);
      button.onclick = () => selectBoardQuestion(subKey, qIndex, button);
      column.append(button);
    });
    table.append(column);
  });
  document.getElementById('subcategories-container').replaceChildren(controls, table);
  if (!roomState.activeQuestion) changeScreen('screen-subcategories');
}
function selectBoardQuestion(subKey, qIndex, button) {
  markFlow('question:click'); showLaunchFeedback('PREPARANDO PREGUNTA…');
  sendAction('question:select', { subKey, qIndex }, {
    label: 'Preparando pregunta…', button,
    onSuccess: () => markFlow('question:ack'),
    onTimeout: () => { hideLaunchFeedback(); markFlow('question:timeout'); },
    onError: response => { hideLaunchFeedback(); markFlow('question:error'); reportError(response); }
  });
}

function renderQuestion(payload) {
  if (Number.isInteger(payload.stateVersion)) roomStateVersion = Math.max(roomStateVersion, payload.stateVersion);
  currentQuestionId = payload.id;
  markFlow('question:render'); hideLaunchFeedback();
  currentBroadcastQuestion = payload;
  // Las preguntas de tutorial no pertenecen a un catálogo competitivo.
  // Reconocerlas también por ausencia de categoría evita que un estado tardío
  // pueda intentar leer una subcategoría inexistente al conectar espectadores.
  const isTutorial = Boolean(payload.tutorial || payload.categoryKey == null);
  const category = !isTutorial && roomState?.catalog?.[payload.categoryKey]; const subcategory = category?.subcategories?.[payload.subKey];
  if (!isTutorial && (!category || !subcategory)) return;
  document.getElementById('q-category').textContent = isTutorial ? 'RONDA 0 · TUTORIAL' : `${displayTitle(category.title)} › ${subcategory.title}`;
  document.getElementById('q-points').textContent = isTutorial ? 'Práctica · 0 pts' : `Valor: ${payload.question.points} pts`;
  document.getElementById('q-text').textContent = payload.question.q;
  document.getElementById('broadcast-scoreboard').innerHTML = roomState.players.map(player => `<span class="broadcast-score ${player.id === roomState.turnPlayerId ? 'is-active' : ''}">${escapeHtml(player.name)} <b>${player.score}</b></span>`).join('');
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
  broadcastNotice = {
    kind: result.status,
    title: result.status === 'correct' ? '¡CORRECTO!' : result.status === 'timeout' ? '¡TIEMPO AGOTADO!' : result.rebound ? '¡REBOTE!' : '¡INCORRECTO!',
    detail: result.rebound ? 'La pregunta continúa con el siguiente participante.' : 'El resultado fue registrado.'
  };
  renderSpectatorBroadcast(document.querySelector('.screen.active')?.id);
  clearInterval(timerInterval); transitionPending = true;
  window.setTimeout(() => {
    transitionPending = false;
    broadcastNotice = null;
    if (pendingQuestion) { const next = pendingQuestion; pendingQuestion = null; renderQuestion(next); }
    else renderState();
  }, 1200);
}

function startTimer(endsAt, targetId = 'timer') {
  clearInterval(timerInterval);
  const update = () => {
    const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    document.getElementById(targetId).textContent = `Tiempo: ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    const broadcastTimer = document.querySelector('[data-broadcast-ends-at]');
    if (broadcastTimer && Number(broadcastTimer.dataset.broadcastEndsAt) === Number(endsAt)) broadcastTimer.textContent = `TIEMPO ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (!seconds) clearInterval(timerInterval);
  };
  update(); timerInterval = window.setInterval(update, 250);
}

function participantName(id) { return roomState.players.find(player => player.id === id)?.name || 'Participante'; }
function renderTeamTurn() {
  const payload = currentTeamQuestion; const duel = roomState?.teamDuel || payload?.duel;
  if (!payload || !duel || !['playing', 'tutorial'].includes(duel.status)) return;
  const active = duel.activeTurn; const teamInfo = duel.teams[active.teamKey]; const responder = participantName(active.responderId);
  currentBroadcastQuestion = payload;
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
  broadcastNotice = {
    kind: result.status,
    title: result.status === 'correct' ? '¡CORRECTO!' : result.status === 'timeout' ? '¡TIEMPO AGOTADO!' : result.rebound ? '¡REBOTE!' : '¡INCORRECTO!',
    detail: result.rebound ? 'El otro equipo tiene la oportunidad.' : base
  };
  renderSpectatorBroadcast(document.querySelector('.screen.active')?.id);
  clearInterval(timerInterval); transitionPending = true;
  window.setTimeout(() => {
    transitionPending = false;
    broadcastNotice = null;
    // Al cerrar un turno de tutorial no queda activeTurn: el anfitrión debe ver
    // la pantalla de avance, no intentar renderizar un turno inexistente.
    if (roomState?.teamDuel?.status === 'finished') return renderTeamFinished(roomState.teamDuel);
    renderState();
  }, 1100);
}
function renderTeamFinished(duel) {
  clearInterval(timerInterval); currentTeamQuestion = null;
  const blue = duel.teams.blue; const red = duel.teams.red;
  const winner = duel.result.winner === 'blue' ? blue : duel.result.winner === 'red' ? red : null;
  document.getElementById('team-final-title').textContent = duel.result.tie ? '¡Empate!' : `¡Ganaron ${winner.name}!`;
  document.getElementById('team-final-message').textContent = duel.isTest ? 'Modo prueba finalizado' : duel.result.tie ? 'Los equipos terminaron con la misma puntuación.' : `${winner.name} se impuso en el duelo.`;
  document.getElementById('team-final-scores').innerHTML = ['blue', 'red'].map(key => {
    const entry = duel.teams[key]; return `<div class="team-final-score ${key}"><span>${key === 'blue' ? 'EQUIPO AZUL' : 'EQUIPO ROJO'}</span><strong>${escapeHtml(entry.name)}</strong><b>${entry.score} puntos</b></div>`;
  }).join('');
  document.getElementById('team-final-reset').hidden = !isHost;
  changeScreen('screen-team-final');
}

function renderPodium() {
  if (!roomState?.categoryKey) return;
  clearInterval(timerInterval);
  let previousScore = null;
  let currentRank = 0;
  const ranked = [...roomState.players].sort((a, b) => b.score - a.score).map((player, index) => {
    if (player.score !== previousScore) currentRank = index + 1;
    previousScore = player.score;
    return { ...player, rank: currentRank };
  });
  const leaders = ranked.slice(0, 3);
  document.getElementById('podium-title').textContent = `Podio · ${displayTitle(roomState.catalog[roomState.categoryKey].title)}`;
  document.getElementById('podium-leaders').innerHTML = leaders.map(player => `<article class="podium-place"><span>PUESTO ${player.rank}</span><strong>${escapeHtml(player.name)}</strong><b>${player.score} puntos</b></article>`).join('');
  document.getElementById('podium-ranking').innerHTML = ranked.map(player => `<p><span>${player.rank}. ${escapeHtml(player.name)}</span><b>${player.score} puntos</b></p>`).join('');
  document.getElementById('podium-reset').hidden = !isHost;
  changeScreen('screen-podium');
}

function reportError(response) { if (response?.error) notifyError(response.error); }
function volverACategorias() { socket.emit('match:reset', {}, reportError); }
function reiniciarJuegoCompleto() { socket.emit('match:reset', {}, reportError); }
