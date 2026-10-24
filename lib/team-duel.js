const { randomUUID } = require('node:crypto');

const TEAM_KEYS = ['blue', 'red'];
const TURN_MS = 30_000;
const ROUNDS = 10;

function biblicalQuestions(trivia) {
  return Object.entries(trivia.biblia.subcategories).flatMap(([subKey, subcategory]) => subcategory.questions.map((question, qIndex) => ({ ...question, subKey, qIndex, key: question.id || `legacy-${subKey}-${qIndex}` })));
}

function createDuel(room, trivia, { responseMode, isTest, captains = {} } = {}) {
  if (!['individual', 'captain-fixed', 'captain-rotating'].includes(responseMode)) return { error: 'Modalidad de respuesta inválida.' };
  if (room.players.length < 2) return { error: 'Se requieren al menos dos jugadores para el duelo.' };
  const members = { blue: [], red: [] };
  const explicitTeams = room.mode === 'teams';
  if (explicitTeams && room.players.some(player => !TEAM_KEYS.includes(player.teamKey))) return { error: 'Todos los jugadores deben elegir un equipo antes de comenzar.' };
  room.players.forEach((player, index) => members[explicitTeams ? player.teamKey : TEAM_KEYS[index % 2]].push(player.id));
  if (!members.blue.length || !members.red.length) return { error: 'Cada equipo necesita al menos un integrante.' };
  const duel = {
    id: randomUUID(), isTest: Boolean(isTest), responseMode, status: 'playing', round: 1, turnNumber: 0, startTeamIndex: 0,
    teams: TEAM_KEYS.reduce((teams, key) => ({ ...teams, [key]: { name: room.teamLabels?.[key] || (key === 'blue' ? 'Equipo Azul' : 'Equipo Rojo'), members: members[key], captainId: members[key].includes(captains[key]) ? captains[key] : members[key][0], rotationIndex: 0, score: 0 } }), {}),
    usedQuestionKeys: new Set(), activeTurn: null, result: null
  };
  room.teamDuel = duel;
  openTurn(room, trivia);
  return { duel };
}

function activeTeamKey(duel) { return TEAM_KEYS[duel.startTeamIndex]; }
function responderId(duel, teamKey) {
  const team = duel.teams[teamKey];
  if (duel.responseMode === 'captain-fixed') return team.captainId;
  return team.members[team.rotationIndex % team.members.length];
}
function openTurn(room, trivia, now = Date.now()) {
  const duel = room.teamDuel; if (!duel || duel.status !== 'playing') return null;
  const teamKey = activeTeamKey(duel); const question = biblicalQuestions(trivia).find(item => !duel.usedQuestionKeys.has(item.key));
  if (!question) return finishDuel(duel);
  duel.activeTurn = { id: randomUUID(), teamKey, responderId: responderId(duel, teamKey), questionKey: question.key, subKey: question.subKey, qIndex: question.qIndex, endsAt: now + TURN_MS, attemptedTeamKeys: [] };
  return duel.activeTurn;
}
function getQuestion(duel, trivia) { const active = duel.activeTurn; return active.privateQuestion || trivia.biblia.subcategories[active.subKey].questions[active.qIndex]; }
function publicDuel(room) {
  const duel = room.teamDuel; if (!duel) return null;
  return { isTest: duel.isTest, responseMode: duel.responseMode, status: duel.status, round: duel.round, turnNumber: duel.turnNumber, totalTurns: ROUNDS * 2,
    teams: Object.fromEntries(TEAM_KEYS.map(key => [key, { name: duel.teams[key].name, members: duel.teams[key].members, captainId: duel.teams[key].captainId, score: duel.teams[key].score }])),
    activeTurn: duel.activeTurn && { id: duel.activeTurn.id, teamKey: duel.activeTurn.teamKey, responderId: duel.activeTurn.responderId, tutorial: Boolean(duel.activeTurn.tutorial), endsAt: duel.activeTurn.endsAt },
    tutorial: duel.tutorial && { status: duel.tutorial.status, completed: duel.tutorial.completed, total: duel.tutorial.sequence.length }, result: duel.result };
}
function publicQuestion(room, trivia) { const question = getQuestion(room.teamDuel, trivia); return { q: question.q, options: question.options, points: 100, reference: question.reference }; }
function canAnswer(room, participantId) { return room.teamDuel?.activeTurn?.responderId === participantId; }
function finishQuestion(room, trivia, correct) {
  const duel = room.teamDuel; const active = duel.activeTurn; const team = duel.teams[active.teamKey];
  if (active.tutorial) return finishTutorialTurn(room);
  duel.usedQuestionKeys.add(active.questionKey);
  if (correct) team.score += 100;
  active.attemptedTeamKeys.forEach(key => { const roster = duel.teams[key]; if (duel.responseMode !== 'captain-fixed') roster.rotationIndex = (roster.rotationIndex + 1) % roster.members.length; });
  duel.turnNumber += 1; duel.round = Math.floor(duel.turnNumber / 2) + 1;
  if (duel.turnNumber >= ROUNDS * 2) return finishDuel(duel);
  duel.startTeamIndex = (duel.startTeamIndex + 1) % TEAM_KEYS.length;
  const next = openTurn(room, trivia);
  return { finished: false, next };
}
function answer(room, participantId, answerIndex, trivia, now = Date.now()) {
  const duel = room.teamDuel; if (!duel?.activeTurn || !canAnswer(room, participantId)) return { ok: false, error: 'Solo la persona activa puede responder.' };
  const question = getQuestion(duel, trivia);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= question.options.length) return { ok: false, error: 'Respuesta inválida.' };
  const correct = answerIndex === question.correct; const active = duel.activeTurn;
  active.attemptedTeamKeys.push(active.teamKey);
  if (correct) return { ok: true, result: 'correct', ...finishQuestion(room, trivia, true) };
  return failAttempt(room, trivia, now, 'incorrect');
}
function failAttempt(room, trivia, now, result) {
  const duel = room.teamDuel; const active = duel.activeTurn;
  const nextTeamKey = TEAM_KEYS.find(key => !active.attemptedTeamKeys.includes(key));
  if (!nextTeamKey) return { ok: true, result, exhausted: true, ...finishQuestion(room, trivia, false) };
  active.teamKey = nextTeamKey; active.responderId = responderId(duel, nextTeamKey); active.endsAt = now + TURN_MS;
  return { ok: true, result, rebound: true, activeTurn: active };
}
function timeout(room, trivia, now = Date.now()) {
  if (!room.teamDuel?.activeTurn) return null;
  room.teamDuel.activeTurn.attemptedTeamKeys.push(room.teamDuel.activeTurn.teamKey);
  return failAttempt(room, trivia, now, 'timeout');
}
function finishDuel(duel) {
  duel.activeTurn = null; duel.status = 'finished';
  const blue = duel.teams.blue.score; const red = duel.teams.red.score;
  duel.result = { winner: blue === red ? null : blue > red ? 'blue' : 'red', tie: blue === red };
  return { finished: true, result: duel.result };
}

function tutorialSequence(duel) {
  // Ronda 0 siempre tiene tres etapas: Azul, Rojo y Azul. Las preguntas son
  // prácticas; la competencia oficial vuelve a iniciar ambas rotaciones en cero.
  return [0, 1, 2].map(index => {
    const teamKey = TEAM_KEYS[index % TEAM_KEYS.length];
    return { teamKey, responderId: responderId(duel, teamKey) };
  });
}
function startTutorial(room, questions, now = Date.now()) {
  const duel = room.teamDuel;
  if (!duel || !Array.isArray(questions) || !questions.length || duel.turnNumber !== 0 || duel.usedQuestionKeys.size) return null;
  // El turno provisional creado al configurar el duelo aún no fue jugado: se reemplaza por Ronda 0.
  duel.activeTurn = null;
  duel.teams.blue.score = 0; duel.teams.red.score = 0;
  duel.tutorial = { status: 'playing', completed: 0, questions, sequence: tutorialSequence(duel) };
  duel.status = 'tutorial'; return openTutorialTurn(room, now);
}
function openTutorialTurn(room, now = Date.now()) {
  const duel = room.teamDuel; const tutorial = duel?.tutorial;
  if (!tutorial || tutorial.status !== 'playing') return null;
  const entry = tutorial.sequence[tutorial.completed]; const question = tutorial.questions[tutorial.completed % tutorial.questions.length];
  duel.activeTurn = { id: randomUUID(), tutorial: true, teamKey: entry.teamKey, responderId: entry.responderId, privateQuestion: question, endsAt: now + TURN_MS, attemptedTeamKeys: [] };
  return duel.activeTurn;
}
function finishTutorialTurn(room) {
  const duel = room.teamDuel; const tutorial = duel.tutorial;
  duel.activeTurn = null; tutorial.completed += 1;
  tutorial.status = tutorial.completed >= tutorial.sequence.length ? 'complete' : 'awaiting-host';
  return { finished: true, tutorial: true, tutorialComplete: tutorial.status === 'complete' };
}
function advanceTutorial(room, now = Date.now()) {
  const tutorial = room.teamDuel?.tutorial;
  if (!tutorial || room.teamDuel.activeTurn || tutorial.status !== 'awaiting-host') return null;
  tutorial.status = 'playing'; return openTutorialTurn(room, now);
}
function beginOfficialDuel(room, trivia) {
  const duel = room.teamDuel;
  if (!duel?.tutorial || duel.tutorial.status !== 'complete' || duel.activeTurn) return null;
  duel.tutorial = null; duel.status = 'playing'; duel.round = 1; duel.turnNumber = 0; duel.startTeamIndex = 0; duel.usedQuestionKeys.clear();
  TEAM_KEYS.forEach(key => { duel.teams[key].score = 0; duel.teams[key].rotationIndex = 0; });
  return openTurn(room, trivia);
}

module.exports = { TURN_MS, ROUNDS, biblicalQuestions, createDuel, openTurn, publicDuel, publicQuestion, canAnswer, answer, timeout, startTutorial, advanceTutorial, beginOfficialDuel };
