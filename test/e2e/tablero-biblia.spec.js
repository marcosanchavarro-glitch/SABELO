const { test, expect } = require('@playwright/test');
const { createTriviaServer } = require('../../server');

const tutorial = [
  { id: 'tutorial-tablero-1', points: 0, q: 'Tutorial local 1', options: ['A', 'B', 'C'], correct: 2 },
  { id: 'tutorial-tablero-2', points: 0, q: 'Tutorial local 2', options: ['A', 'B', 'C'], correct: 2 }
];

let service;
let baseURL;

async function openParticipant(context, name) {
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.locator('#input-name').fill(name);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  return page;
}

async function answerTutorial(page) {
  await expect(page.locator('#options-container .option-btn')).toHaveCount(3);
  await page.locator('#options-container .option-btn').nth(2).click();
  await expect(page.locator('#tutorial-action')).toBeVisible({ timeout: 5_000 });
}

test.beforeAll(async () => {
  service = createTriviaServer({ tutorial, allowedOrigins: ['http://127.0.0.1'] });
  await new Promise(resolve => service.httpServer.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${service.httpServer.address().port}`;
});

test.afterAll(async () => {
  for (const room of service.rooms.values()) clearTimeout(room.timer);
  await new Promise(resolve => service.io.close(resolve));
});

test('Biblia usa columnas independientes, pagina seis subcategorías y conserva jugador y casilla usada', async ({ browser }, testInfo) => {
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const host = await openParticipant(hostContext, 'Anfitrión real');
  host.on('pageerror', error => errors.push(error.message));
  host.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await host.getByRole('button', { name: 'Crear sala' }).click();
  await host.locator('#btn-create-config').click();
  const roomCode = await host.locator('#lbl-room').textContent();

  const player = await openParticipant(playerContext, 'Jugador real');
  await player.getByRole('button', { name: 'Unirse a sala' }).click();
  await player.locator('#input-room').fill(roomCode);
  await player.locator('#btn-room-action').click();

  await host.getByRole('button', { name: /Biblia/ }).click();
  await answerTutorial(host);
  await host.locator('#tutorial-action').click();
  await answerTutorial(player);
  await expect(host.locator('#tutorial-action')).toHaveText('Iniciar competencia oficial');
  await host.locator('#tutorial-action').click();
  await expect(host.locator('#game-launch-overlay')).toBeHidden();

  const board = host.locator('.jeopardy-board');
  await expect(board.locator(':scope > .board-column')).toHaveCount(6);
  await expect(board.locator(':scope > .board-column > .board-heading')).toHaveCount(6);
  await expect(board.locator(':scope > .board-column > .board-tile')).toHaveCount(30);
  await expect(host.getByText('Página 1 de 2')).toBeVisible();
  await expect(host.getByText('Génesis y patriarcas', { exact: true })).not.toBeVisible();
  await expect(host.locator('#turn-label')).toHaveText('TURNO DE: Anfitrión real — ¡ES TU TURNO!');
  await expect(host.locator('#players-scoreboard')).toContainText('Anfitrión real: 0');
  await expect(host.locator('#players-scoreboard')).toContainText('Jugador real: 0');

  await host.getByRole('button', { name: 'Siguiente' }).click();
  await expect(board.locator(':scope > .board-column')).toHaveCount(6);
  await expect(host.getByText('Página 2 de 2')).toBeVisible();
  await expect(host.getByText('Génesis y patriarcas', { exact: true })).toBeVisible();
  await expect(host.getByText('Personajes bíblicos', { exact: true })).not.toBeVisible();
  await host.getByRole('button', { name: 'Anterior' }).click();

  await host.getByRole('button', { name: 'Personajes bíblicos: 100 puntos' }).click();
  await expect(host.locator('#screen-question')).toHaveClass(/active/);
  await host.locator('#options-container .option-btn').first().click();
  await expect(player.locator('#question-turn-message')).toContainText('¡ES TU TURNO!');
  await player.locator('#options-container .option-btn').nth(2).click();
  await expect(host.locator('#screen-subcategories')).toHaveClass(/active/, { timeout: 5_000 });
  await expect(host.getByRole('button', { name: 'Personajes bíblicos: pregunta de 100 puntos, ya jugada' })).toBeDisabled();
  await expect(host.locator('#players-scoreboard')).toContainText('Anfitrión real: 0');
  await expect(host.locator('#players-scoreboard')).toContainText('Jugador real: 100');
  await expect(host.locator('#turn-label')).not.toContainText('TURNO DE: ,');
  await host.screenshot({ path: testInfo.outputPath('tablero-biblia-corregido.png'), fullPage: true });
  expect(errors).toEqual([]);

  await hostContext.close();
  await playerContext.close();
});
