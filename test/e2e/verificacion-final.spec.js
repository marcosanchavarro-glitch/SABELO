const { test, expect } = require('@playwright/test');
const { createTriviaServer } = require('../../server');
const fs = require('node:fs');
const path = require('node:path');

const tutorial = [
  { id: 'tutorial-verificacion-1', points: 0, q: 'Tutorial local 1', options: ['A', 'B', 'C'], correct: 2 },
  { id: 'tutorial-verificacion-2', points: 0, q: 'Tutorial local 2', options: ['A', 'B', 'C'], correct: 2 }
];

let service;
let baseURL;
const captureDirectory = path.join(process.cwd(), 'artifacts', 'verificacion-final');

async function createContext(browser, viewport) {
  const context = await browser.newContext({ viewport });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await context.addInitScript(() => {
    window.__sabeloMetrics = [];
    const record = (kind, event) => window.__sabeloMetrics.push({ kind, event, at: performance.now() });
    let socketFactory;
    Object.defineProperty(window, 'io', {
      configurable: true,
      get: () => socketFactory,
      set: factory => {
        socketFactory = (...args) => {
          const socket = factory(...args);
          const originalEmit = socket.emit.bind(socket);
          const originalOn = socket.on.bind(socket);
          socket.emit = (event, ...eventArgs) => {
            record('emit', event);
            const callback = eventArgs.at(-1);
            if (typeof callback === 'function') {
              eventArgs[eventArgs.length - 1] = (...response) => { record('ack', event); return callback(...response); };
            }
            const delay = window.__sabeloDelayEvent === event ? 350 : 0;
            if (delay) { window.setTimeout(() => originalEmit(event, ...eventArgs), delay); return socket; }
            return originalEmit(event, ...eventArgs);
          };
          socket.on = (event, listener) => originalOn(event, (...eventArgs) => { record('event', event); return listener(...eventArgs); });
          return socket;
        };
      }
    });
  });
  return context;
}

async function openParticipant(context, name, spectator = false) {
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.locator('#connection-status')).toHaveText('Conectado');
  await page.locator('#input-name').fill(name);
  if (spectator) await page.locator('#btn-role-spectator').click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  return page;
}

async function createIndividualRoom(page) {
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await page.locator('#btn-create-config').click();
  return page.locator('#lbl-room').textContent();
}

async function answerTutorial(page) {
  await expect(page.locator('#options-container .option-btn')).toHaveCount(3);
  await page.locator('#options-container .option-btn').nth(2).click();
  await expect(page.locator('#tutorial-action')).toBeVisible({ timeout: 5_000 });
}

async function recentMetric(page, kind, event, after) {
  return page.evaluate(({ kind, event, after }) => window.__sabeloMetrics.find(item => item.kind === kind && item.event === event && item.at >= after)?.at ?? null, { kind, event, after });
}

test.beforeAll(async () => {
  fs.mkdirSync(captureDirectory, { recursive: true });
  service = createTriviaServer({ tutorial, allowedOrigins: ['http://127.0.0.1'] });
  await new Promise(resolve => service.httpServer.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${service.httpServer.address().port}`;
});

test.afterAll(async () => {
  for (const room of service.rooms.values()) clearTimeout(room.timer);
  await new Promise(resolve => service.io.close(resolve));
});

test('verificación visual, copia, reconexión y mediciones de un tablero bíblico real', async ({ browser }) => {
  const hostContext = await createContext(browser, { width: 1440, height: 960 });
  const playerContext = await createContext(browser, { width: 390, height: 844 });
  const spectatorContext = await createContext(browser, { width: 1280, height: 720 });
  const host = await openParticipant(hostContext, 'Anfitrión prueba');
  const connectAt = await recentMetric(host, 'event', 'connect', 0);
  expect(connectAt).not.toBeNull();
  const roomCode = await createIndividualRoom(host);

  await host.locator('[data-copy-code]').click();
  await expect(host.locator('[data-copy-code]')).toHaveText('¡Código copiado!');
  await expect.poll(() => host.evaluate(() => navigator.clipboard.readText())).toBe(roomCode);

  const player = await openParticipant(playerContext, 'Jugador prueba');
  await player.getByRole('button', { name: 'Unirse a sala' }).click();
  await player.locator('#input-room').fill(roomCode);
  await player.locator('#btn-room-action').click();
  await expect(player.locator('#lbl-role')).toHaveText('Jugador');
  const spectator = await openParticipant(spectatorContext, 'Espectador prueba', true);
  await spectator.getByRole('button', { name: 'Unirse a sala' }).click();
  await spectator.locator('#input-room').fill(roomCode);
  await spectator.locator('#btn-room-action').click();
  await expect(spectator.locator('#lbl-role')).toHaveText('Espectador');
  await expect(spectator.locator('#screen-categories')).toHaveClass(/active/);

  await host.reload();
  await expect(host.locator('#connection-status')).toHaveText('Conectado');
  await expect(host.locator('#lbl-role')).toHaveText('Anfitrión');
  await expect(host.locator('#lbl-room')).toHaveText(roomCode);
  await host.locator('[data-copy-code]').click();
  await expect(host.locator('[data-copy-code]')).toHaveText('¡Código copiado!');

  // Captura deliberada del feedback pendiente: solo retrasa el envío en este navegador de prueba.
  await host.evaluate(() => { window.__sabeloDelayEvent = 'category:select'; });
  const feedbackStart = await host.evaluate(() => performance.now());
  await host.getByRole('button', { name: /Biblia/ }).click();
  await expect(host.locator('#game-launch-overlay')).toBeVisible();
  const feedbackVisibleAt = await host.evaluate(() => performance.now());
  await host.screenshot({ path: path.join(captureDirectory, '04-preparando-pregunta.png'), fullPage: true });
  await host.evaluate(() => { window.__sabeloDelayEvent = null; });
  await expect(host.locator('#screen-question')).toHaveClass(/active/);

  await answerTutorial(host);
  await host.locator('#tutorial-action').click();
  await answerTutorial(player);
  await expect(host.locator('#tutorial-action')).toHaveText('Iniciar competencia oficial');
  await host.locator('#tutorial-action').click();
  await expect(host.locator('#game-launch-overlay')).toBeHidden();
  const board = host.locator('.jeopardy-board');
  await expect(board.locator(':scope > .board-column')).toHaveCount(6);
  await expect(host.getByText('Página 1 de 2')).toBeVisible();
  await host.screenshot({ path: path.join(captureDirectory, '01-tablero-pagina-1.png'), fullPage: true });
  await player.screenshot({ path: path.join(captureDirectory, '05-tablero-movil.png'), fullPage: true });
  expect(await player.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const mobileCopyButton = await player.locator('[data-copy-code]').boundingBox();
  const mobileCode = await player.locator('#lbl-room').boundingBox();
  expect(mobileCopyButton).not.toBeNull();
  expect(mobileCode).not.toBeNull();
  expect(mobileCopyButton.x + mobileCopyButton.width).toBeLessThanOrEqual(390);
  expect(mobileCopyButton.x).toBeGreaterThanOrEqual(mobileCode.x + mobileCode.width);
  await expect(host.locator('#players-scoreboard')).toContainText('Anfitrión prueba: 0');
  await expect(host.locator('#players-scoreboard')).toContainText('Jugador prueba: 0');

  await host.getByRole('button', { name: 'Siguiente' }).click();
  await expect(host.getByText('Página 2 de 2')).toBeVisible();
  await expect(board.locator(':scope > .board-column')).toHaveCount(6);
  await host.screenshot({ path: path.join(captureDirectory, '02-tablero-pagina-2.png'), fullPage: true });
  await host.getByRole('button', { name: 'Anterior' }).click();

  const questionStart = await host.evaluate(() => performance.now());
  await host.getByRole('button', { name: 'Personajes bíblicos: 100 puntos' }).click();
  await expect(host.locator('#screen-question')).toHaveClass(/active/);
  const questionVisibleAt = await host.evaluate(() => performance.now());
  await host.screenshot({ path: path.join(captureDirectory, '03-pregunta-activa.png'), fullPage: true });
  const tileAck = await recentMetric(host, 'ack', 'question:select', questionStart);
  expect(tileAck).not.toBeNull();

  const timings = {
    initialConnectionMs: Math.round(connectAt),
    visualFeedbackMs: Math.round(feedbackVisibleAt - feedbackStart),
    tileSocketAckMs: Math.round(tileAck - questionStart),
    tileQuestionVisibleMs: Math.round(questionVisibleAt - questionStart)
  };
  console.log(`VERIFICACION_TABLERO_TIMINGS ${JSON.stringify(timings)}`);
  await hostContext.close();
  await playerContext.close();
  await spectatorContext.close();
});

test('tres inicios de categoría con socket ya conectado responden sin demora excesiva', async ({ browser }) => {
  const samples = [];
  for (let index = 0; index < 3; index += 1) {
    const context = await createContext(browser, { width: 1280, height: 800 });
    const page = await openParticipant(context, `Medición ${index + 1}`);
    await createIndividualRoom(page);
    const start = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: /Biblia/ }).click();
    await expect(page.locator('#screen-question')).toHaveClass(/active/);
    const questionAt = await page.evaluate(() => performance.now());
    const ackAt = await recentMetric(page, 'ack', 'category:select', start);
    expect(ackAt).not.toBeNull();
    samples.push({ ackMs: Math.round(ackAt - start), roundZeroMs: Math.round(questionAt - start) });
    await context.close();
  }
  console.log(`VERIFICACION_CATEGORIA_TIMINGS ${JSON.stringify(samples)}`);
  expect(samples.every(sample => sample.ackMs < 1_000 && sample.roundZeroMs < 1_000)).toBe(true);
});
