const { randomUUID } = require('node:crypto');

const QUESTION_TIME_MS = 60_000;

function safeCatalog(trivia) {
  return Object.fromEntries(Object.entries(trivia).map(([key, category]) => [key, {
    title: category.title,
    subcategories: Object.fromEntries(Object.entries(category.subcategories).map(([subKey, subcategory]) => [subKey, {
      title: subcategory.title,
      questions: subcategory.questions.map(({ points }) => ({ points }))
    }]))
  }]));
}

function createRoom({ code, hostSocketId, hostName }) {
  const host = createParticipant(hostSocketId, hostName, 'jugador');
  return { code, hostId: host.id, categoryKey: null, matchStatus: 'waiting', usedQuestions: new Set(), activeQuestion: null,
    players: [host], spectators: [], turnIndex: 0, timer: null };
}

function createParticipant(socketId, name, role) {
  return { id: randomUUID(), token: randomUUID(), socketId, name, role, score: 0, connected: true };
}

function publicState(room, trivia) {
  const turn = currentPlayer(room);
  return {
    code: room.code, hostId: room.hostId, categoryKey: room.categoryKey, matchStatus: room.matchStatus,
    catalog: safeCatalog(trivia), usedQuestions: [...room.usedQuestions],
    activeQuestion: room.activeQuestion && publicActiveQuestion(room.activeQuestion),
    players: room.players.map(({ id, name, score, connected }) => ({ id, name, score, connected })),
    spectators: room.spectators.filter(item => item.connected).map(({ id, name }) => ({ id, name })),
    turnPlayerId: turn?.id ?? null
  };
}

function publicActiveQuestion(activeQuestion) {
  return { categoryKey: activeQuestion.categoryKey, subKey: activeQuestion.subKey, qIndex: activeQuestion.qIndex, endsAt: activeQuestion.endsAt };
}

function publicQuestion(activeQuestion, trivia) {
  const question = getQuestion(activeQuestion, trivia);
  return { ...publicActiveQuestion(activeQuestion), question: { points: question.points, q: question.q, options: question.options } };
}

function currentPlayer(room) { return room.players.length ? room.players[room.turnIndex % room.players.length] : null; }
function advanceTurn(room) { if (room.players.length) room.turnIndex = (room.turnIndex + 1) % room.players.length; }
function questionKey(activeQuestion) { return `${activeQuestion.categoryKey}:${activeQuestion.subKey}:${activeQuestion.qIndex}`; }
function getQuestion(activeQuestion, trivia) { return trivia[activeQuestion.categoryKey].subcategories[activeQuestion.subKey].questions[activeQuestion.qIndex]; }
function totalQuestions(room, trivia) { return Object.values(trivia[room.categoryKey].subcategories).reduce((total, sub) => total + sub.questions.length, 0); }

function selectCategory(room, categoryKey, trivia) {
  if (!trivia[categoryKey] || room.categoryKey) return false;
  room.categoryKey = categoryKey; room.matchStatus = 'playing'; room.usedQuestions.clear(); room.turnIndex = 0;
  room.players.forEach(player => { player.score = 0; });
  return true;
}

function selectQuestion(room, actorId, subKey, qIndex, trivia, now = Date.now()) {
  if (room.matchStatus !== 'playing' || room.activeQuestion || currentPlayer(room)?.id !== actorId) return null;
  const question = trivia[room.categoryKey]?.subcategories[subKey]?.questions[qIndex];
  const activeQuestion = { categoryKey: room.categoryKey, subKey, qIndex, endsAt: now + QUESTION_TIME_MS, attemptedPlayerIds: [] };
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
  if (correct) player.score += question.points;
  activeQuestion.attemptedPlayerIds.push(actorId);
  if (correct || activeQuestion.attemptedPlayerIds.length >= room.players.length) return { ok: true, correct, finished: finishQuestion(room, trivia) };
  advanceTurn(room); activeQuestion.endsAt = now + QUESTION_TIME_MS;
  return { ok: true, correct: false, passed: true, activeQuestion };
}

function timeout(room, trivia) { return room.activeQuestion ? finishQuestion(room, trivia) : null; }
function finishQuestion(room, trivia) {
  room.usedQuestions.add(questionKey(room.activeQuestion)); room.activeQuestion = null; advanceTurn(room);
  if (room.usedQuestions.size >= totalQuestions(room, trivia)) room.matchStatus = 'finished';
  return { finishedGame: room.matchStatus === 'finished' };
}

function resetMatch(room) {
  room.categoryKey = null; room.matchStatus = 'waiting'; room.usedQuestions.clear(); room.activeQuestion = null; room.turnIndex = 0;
  room.players.forEach(player => { player.score = 0; });
}

function podium(room) { return [...room.players].sort((a, b) => b.score - a.score).slice(0, 3).map(({ name, score }) => ({ name, score })); }

module.exports = { QUESTION_TIME_MS, createRoom, createParticipant, publicState, publicQuestion, currentPlayer, selectCategory, selectQuestion, answer, timeout, resetMatch, podium };
