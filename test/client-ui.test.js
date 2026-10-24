const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('la vista de equipos permite renderizar la Ronda 0', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  assert.match(client, /\['playing', 'tutorial'\]\.includes\(duel\.status\)/);
  assert.match(client, /roomState\.teamDuel\?\.status === 'tutorial'/);
  assert.match(client, /roomState\.teamDuel\?\.status === 'playing'/);
  assert.match(client, /function showTeamResult[\s\S]*?transitionPending = false;[\s\S]*?renderState\(\);/);
  assert.match(client, /roomState\?\.teamDuel\?\.status === 'finished'[\s\S]*?renderTeamFinished/);
});

test('el cliente deriva el anfitrión del estado del servidor y protege los eventos de otra sala', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  assert.match(client, /function syncIdentityFromState/);
  assert.match(client, /roomState\.hostId === participantId/);
  assert.match(client, /state\.code/);
  assert.match(client, /return restoreSession\(\);/);
});

test('el cliente comunica conexión, evita operaciones sin socket y vuelve al inicio si falta la sala', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(client, /const ACTION_TIMEOUT_MS = 8000/);
  assert.match(client, /if \(!socket\.connected\)/);
  assert.match(client, /socket\.on\('disconnect'/);
  assert.match(client, /socket\.on\('connect_error'/);
  assert.match(client, /ROOM_NOT_FOUND/);
  assert.match(client, /No pudimos confirmar la sesión todavía/);
  assert.match(client, /changeScreen\('screen-identity'\)/);
  assert.match(html, /id="connection-status"/);
  assert.match(html, /id="action-status"/);
});

test('el cliente contiene la creación por modalidad, elección voluntaria de bando y finales separados', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(client, /roomCreateConfig/);
  assert.match(client, /team:choose/);
  assert.match(client, /team:assign/);
  assert.match(client, /screen-team-final/);
  assert.match(client, /screen-podium/);
  assert.match(html, /Elegí tu bando/);
  assert.match(html, /Unirme a Chicos/);
  assert.match(html, /Unirme a Chicas/);
  assert.match(client, /let previousScore = null;/);
  assert.match(client, /if \(player\.score !== previousScore\) currentRank = index \+ 1;/);
});

test('la transmisión del espectador es una capa de solo lectura basada en estado público', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
  assert.match(client, /function isSpectatorSession/);
  assert.match(client, /function renderSpectatorBroadcast/);
  assert.match(client, /function toggleBroadcastFullscreen/);
  assert.match(client, /currentBroadcastQuestion/);
  assert.match(client, /previousScore = null;[\s\S]*?return \{ \.\.\.player, rank \}/);
  assert.doesNotMatch(client.match(/function renderSpectatorBroadcast[\s\S]*?function syncBroadcastTimer/)?.[0] || '', /correctIndex|\.correct\b/);
  assert.match(html, /id="spectator-broadcast"/);
  assert.match(html, /id="broadcast-main"/);
  assert.match(css, /\.spectator-mode \.stage-frame \{ display: none;/);
  assert.match(css, /\.broadcast-crt/);
});

test('el tablero pagina subcategorías en columnas independientes, no crea preguntas vacías y confirma acciones antes de abrirlas', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
  assert.match(client, /const BOARD_PAGE_SIZE = 6/);
  assert.match(client, /Página \$\{boardPage \+ 1\} de \$\{totalPages\}/);
  assert.match(client, /if \(qIndex < 0\).*board-empty/);
  assert.match(client, /function selectBoardQuestion/);
  assert.match(client, /PREPARANDO PREGUNTA/);
  assert.match(client, /column\.className = 'board-column'/);
  assert.match(client, /table\.append\(column\)/);
  assert.match(client, /function hasDisplayName/);
  assert.match(css, /\.board-column \{ min-width: 0; display: grid;/);
  assert.match(css, /\.game-launch-overlay\[hidden\] \{ display: none;/);
  assert.match(css, /repeat\(var\(--board-columns\), minmax\(0, 1fr\)\)/);
});

test('el código de sala se copia sin exponer datos de sesión', () => {
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(client, /function copyRoomCode/);
  assert.match(client, /navigator\.clipboard\?\.writeText/);
  assert.match(client, /document\.execCommand\('copy'\)/);
  assert.match(client, /¡Código copiado!/);
  assert.doesNotMatch(client.match(/function copyRoomCode[\s\S]*?function resetToIdentity/)?.[0] || '', /reconnectToken|participantId/);
  assert.match(html, /data-copy-code/);
});
