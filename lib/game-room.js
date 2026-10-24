const { randomUUID } = require('node:crypto');

const QUESTION_TIME_MS = 60_000;
// El token solo identifica una sesión de navegador; nunca forma parte del estado público.
const SESSION_TTL_MS = 12 * 60 * 60 * 1_000;

function safeCatalog(trivia) {
  return Object.fromEntries(Object.entries(trivia).map(([key, category]) => [key, {
    title: category.title,
    subcategories: Object.fromEntries(Object.entries(category.subcategories).map(([subKey, subcategory]) => [subKey, {
      title: subcategory.title,
      questions: subcategory.questions.map(({ points }) => ({ points }))
    }]))
  }]));
}

function createRoom({ code, hostSocketId, hostName, mode = 'individual', responseMode = null }) {
  const host = createParticipant(hostSocketId, hostName, 'jugador');
  return { code, hostId: host.id, mode, responseMode, teamLabels: mode === 'teams' ? { blue: 'Chicos', red: 'Chicas' } : null, categoryKey: null, matchStatus: 'waiting', stateVersion: 0, usedQuestions: new Set(), activeQuestion: null,
    players: [host], spectators: [], startIndex: 0, turnIndex: 0, timer: null };
}

function createParticipant(socketId, name, role, now = Date.now()) {
  return { id: randomUUID(), token: randomUUID(), tokenExpiresAt: now + SESSION_TTL_MS, socketId, name, role, teamKey: null, score: 0, connected: true };
}

function rotateReconnectToken(participant, now = Date.now()) {
  participant.token = randomUUID();
  participant.tokenExpiresAt = now + SESSION_TTL_MS;
  return participant.token;
}

function publicState(room, trivia) {
  const turn = currentPlayer(room);
  return {
    code: room.code, version: room.stateVersion || 0, hostId: room.hostId, mode: room.mode || 'individual', responseMode: room.responseMode || null, teamLabels: room.teamLabels || null, categoryKey: room.categoryKey, matchStatus: room.matchStatus,
    catalog: safeCatalog(trivia), usedQuestions: [...room.usedQuestions],
    activeQuestion: room.activeQuestion && publicActiveQuestion(room.activeQuestion),
    tutorial: room.tutorial && { status: room.tutorial.status, completed: room.tutorial.completed, total: room.tutorial.total },
    players: room.players.map(({ id, name, score, connected, teamKey }) => ({ id, name, score, connected, teamKey: teamKey || null })),
    spectators: room.spectators.filter(item => item.connected).map(({ id, name }) => ({ id, name })),
    turnPlayerId: turn?.id ?? null
  };
}

function publicActiveQuestion(activeQuestion) {
  return { id: activeQuestion.id, categoryKey: activeQuestion.categoryKey, subKey: activeQuestion.subKey, qIndex: activeQuestion.qIndex, tutorial: Boolean(activeQuestion.tutorial), endsAt: activeQuestion.endsAt };
}

function publicQuestion(activeQuestion, trivia) {
  const question = getQuestion(activeQuestion, trivia);
  return { ...publicActiveQuestion(activeQuestion), question: { points: question.points, q: question.q, options: question.options } };
}

function currentPlayer(room) { return room.players.length ? room.players[room.turnIndex % room.players.length] : null; }
function advanceTurn(room) { if (room.players.length) room.turnIndex = (room.turnIndex + 1) % room.players.length; }
function nextEligiblePlayer(room, attemptedPlayerIds) {
  for (let offset = 1; offset <= room.players.length; offset += 1) {
    const index = (room.turnIndex + offset) % room.players.length;
    const player = room.players[index];
    if (player.connected && !attemptedPlayerIds.includes(player.id)) return index;
  }
  return -1;
}
function questionKey(activeQuestion) { return `${activeQuestion.categoryKey}:${activeQuestion.subKey}:${activeQuestion.qIndex}`; }
function getQuestion(activeQuestion, trivia) { return activeQuestion.privateQuestion || trivia[activeQuestion.categoryKey].subcategories[activeQuestion.subKey].questions[activeQuestion.qIndex]; }
function totalQuestions(room, trivia) { return Object.values(trivia[room.categoryKey].subcategories).reduce((total, sub) => total + sub.questions.length, 0); }

function selectCategory(room, categoryKey, trivia) {
  if (!trivia[categoryKey] || room.categoryKey) return false;
  room.categoryKey = categoryKey; room.matchStatus = 'playing'; room.usedQuestions.clear(); room.startIndex = 0; room.turnIndex = 0;
  room.players.forEach(player => { player.score = 0; });
  return true;
}

function selectQuestion(room, actorId, subKey, qIndex, trivia, now = Date.now()) {
  if (room.matchStatus !== 'playing' || room.tutorial || room.activeQuestion || currentPlayer(room)?.id !== actorId) return null;
  const question = trivia[room.categoryKey]?.subcategories[subKey]?.questions[qIndex];
  const activeQuestion = { id: randomUUID(), categoryKey: room.categoryKey, subKey, qIndex, endsAt: now + QUESTION_TIME_MS, attemptedPlayerIds: [] };
  if (!question || room.usedQuestions.has(questionKey(activeQuestion))) return null;
  room.activeQuestion = activeQuestion;
  return activeQuestion;
}

function answer(room, actorId, answerIndex, trivia, now = Date.now()) {
  const activeQuestion = room.activeQuestion;
  if (!activeQuestion || currentPlayer(room)?.id !== actorId) return { ok: false, error: 'No es tu turno para responder.' };
  const question = getQuestion(activeQuestion, trivia);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= question.options.length) return { ok: false, error: 'Respuesta inválida.' };
  const player = currentPlayer(room); const correct = answerIndex === question.correct;
  if (correct && !activeQuestion.tutorial) player.score += question.points;
  activeQuestion.attemptedPlayerIds.push(actorId);
  if (correct) return { ok: true, result: 'correct', finished: finishQuestion(room, trivia) };
  return failAttempt(room, trivia, now, 'incorrect');
}

function failAttempt(room, trivia, now, reason) {
  const activeQuestion = room.activeQuestion;
  const nextIndex = nextEligiblePlayer(room, activeQuestion.attemptedPlayerIds);
  if (nextIndex === -1) return { ok: true, result: reason, finished: finishQuestion(room, trivia), exhausted: true };
  room.turnIndex = nextIndex; activeQuestion.endsAt = now + QUESTION_TIME_MS;
  return { ok: true, result: reason, rebound: true, activeQuestion };
}
function timeout(room, trivia, now = Date.now()) {
  if (!room.activeQuestion) return null;
  const player = currentPlayer(room); room.activeQuestion.attemptedPlayerIds.push(player.id);
  return failAttempt(room, trivia, now, 'timeout');
}
function finishQuestion(room, trivia) {
  if (room.activeQuestion.tutorial) return finishTutorialQuestion(room);
  room.usedQuestions.add(questionKey(room.activeQuestion)); room.activeQuestion = null;
  if (room.players.length) { room.startIndex = (room.startIndex + 1) % room.players.length; room.turnIndex = room.startIndex; }
  if (room.usedQuestions.size >= totalQuestions(room, trivia)) room.matchStatus = 'finished';
  return { finishedGame: room.matchStatus === 'finished' };
}

function startTutorial(room, questions, now = Date.now()) {
  if (room.activeQuestion || !Array.isArray(questions) || !questions.length || !room.players.length) return null;
  room.players.forEach(player => { player.score = 0; });
  room.startIndex = 0; room.turnIndex = 0;
  room.tutorial = { status: 'playing', completed: 0, total: room.players.length, questions };
  return openTutorialQuestion(room, now);
}
function openTutorialQuestion(room, now = Date.now()) {
  const tutorial = room.tutorial;
  if (!tutorial || tutorial.status !== 'playing') return null;
  const question = tutorial.questions[tutorial.completed % tutorial.questions.length];
  room.activeQuestion = { id: randomUUID(), tutorial: true, categoryKey: null, subKey: null, qIndex: tutorial.completed, privateQuestion: question, endsAt: now + QUESTION_TIME_MS, attemptedPlayerIds: [] };
  return room.activeQuestion;
}
function finishTutorialQuestion(room) {
  const tutorial = room.tutorial;
  room.activeQuestion = null; tutorial.completed += 1;
  if (room.players.length) { room.startIndex = (room.startIndex + 1) % room.players.length; room.turnIndex = room.startIndex; }
  tutorial.status = tutorial.completed >= tutorial.total ? 'complete' : 'awaiting-host';
  return { finishedGame: false, tutorial: true, tutorialComplete: tutorial.status === 'complete' };
}
function advanceTutorial(room, now = Date.now()) {
  if (!room.tutorial || room.activeQuestion || room.tutorial.status !== 'awaiting-host') return null;
  room.tutorial.status = 'playing'; return openTutorialQuestion(room, now);
}
function beginOfficialMatch(room) {
  if (!room.tutorial || room.tutorial.status !== 'complete' || room.activeQuestion) return false;
  room.tutorial = null; room.startIndex = 0; room.turnIndex = 0;
  room.players.forEach(player => { player.score = 0; });
  return true;
}

function resetMatch(room) {
  room.categoryKey = null; room.matchStatus = 'waiting'; room.usedQuestions.clear(); room.activeQuestion = null; room.tutorial = null; room.startIndex = 0; room.turnIndex = 0;
  room.players.forEach(player => { player.score = 0; });
}

function podium(room) { return [...room.players].sort((a, b) => b.score - a.score).slice(0, 3).map(({ name, score }) => ({ name, score })); }

module.exports = { QUESTION_TIME_MS, SESSION_TTL_MS, createRoom, createParticipant, rotateReconnectToken, publicState, publicQuestion, currentPlayer, selectCategory, selectQuestion, answer, timeout, startTutorial, advanceTutorial, beginOfficialMatch, resetMatch, podium };
