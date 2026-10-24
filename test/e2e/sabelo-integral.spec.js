const { test, expect } = require('@playwright/test');
const { createTriviaServer } = require('../../server');

function privateFixture() {
  const question = (index, points = (index + 1) * 100) => ({
    id: `e2e-${index + 1}`,
    points,
    q: `Pregunta privada de prueba ${index + 1}`,
    options: ['Alternativa 1', 'Alternativa 2', 'Alternativa 3'],
    // Este valor solo vive en el proceso Node de pruebas: nunca se envía al navegador.
    correct: 2,
    reference: 'Prueba local aislada'
  });
  return {
    biblia: {
      title: 'Biblia de prueba',
      subcategories: Object.fromEntries(Array.from({ length: 7 }, (_, subIndex) => [
        `pruebas-${subIndex + 1}`,
        { title: `Pruebas ${subIndex + 1}`, questions: Array.from({ length: 3 }, (_, pointIndex) => question((subIndex * 3) + pointIndex, (pointIndex + 1) * 100)) }
      ]))
    }
  };
}

const tutorial = [
  { id: 'tutorial-e2e-1', points: 0, q: 'Tutorial privado 1', options: ['A', 'B', 'C'], correct: 2 },
  { id: 'tutorial-e2e-2', points: 0, q: 'Tutorial privado 2', options: ['A', 'B', 'C'], correct: 2 }
];

let service;
let baseURL;

async function createPlayerPage(context, name, spectator = false) {
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.locator('#input-name').fill(name);
  if (spectator) {
    await page.locator('#btn-role-spectator').click();
    await expect(page.locator('#btn-role-spectator')).toHaveClass(/active-role/);
  }
  await page.getByRole('button', { name: 'Siguiente' }).click();
  return page;
}

async function createFastContext(browser, viewport, resultDelay) {
  const context = await browser.newContext({ viewport });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Solo en el navegador de prueba: acorta la placa visual de resultado.
  // No modifica el servidor, el protocolo Socket.IO ni las reglas de juego.
  await context.addInitScript(delayForResult => {
    window.__sabeloSocketEvents = [];
    window.__sabeloPageErrors = [];
    window.addEventListener('error', event => window.__sabeloPageErrors.push(event.message));
    window.addEventListener('unhandledrejection', event => window.__sabeloPageErrors.push(String(event.reason)));
    let socketFactory;
    Object.defineProperty(window, 'io', {
      configurable: true,
      get: () => socketFactory,
      set: factory => {
        socketFactory = (...args) => {
          const socket = factory(...args);
          const originalOn = socket.on.bind(socket);
          socket.on = (event, callback) => originalOn(event, (...eventArgs) => {
            window.__sabeloSocketEvents.push(event);
            return callback(...eventArgs);
          });
          return socket;
        };
      }
    });
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, delay >= 1_000 && delay <= 1_500 ? delayForResult : delay, ...args);
  }, resultDelay);
  return context;
}

async function waitForAnswerPage(host, player) {
  await expect.poll(async () => {
    for (const page of [host, player]) {
      const option = page.locator('#team-options-container .option-btn').first();
      if (await option.isVisible().catch(() => false) && await option.isEnabled().catch(() => false)) return true;
    }
    return false;
  }, { timeout: 8_000 }).toBe(true);
  for (const page of [host, player]) {
    const option = page.locator('#team-options-container .option-btn').first();
    if (await option.isVisible().catch(() => false) && await option.isEnabled().catch(() => false)) return page;
  }
  throw new Error('No se encontró un participante habilitado para responder.');
}

async function playWrongAttempt(host, player, { settle = true } = {}) {
  const page = await waitForAnswerPage(host, player);
  await page.locator('#team-options-container .option-btn').first().click();
  // Espera el ciclo de Socket.IO y la placa de resultado antes del próximo intento.
  // No se basa en el texto efímero de la animación para evitar falsos negativos.
  if (settle) await page.waitForTimeout(100);
}

async function waitForIndividualAnswerPage(host, player) {
  await expect.poll(async () => {
    for (const page of [host, player]) {
      const option = page.locator('#options-container .option-btn').first();
      if (await option.isVisible().catch(() => false) && await option.isEnabled().catch(() => false)) return true;
    }
    return false;
  }, { timeout: 8_000 }).toBe(true);
  for (const page of [host, player]) {
    const option = page.locator('#options-container .option-btn').first();
    if (await option.isVisible().catch(() => false) && await option.isEnabled().catch(() => false)) return page;
  }
  throw new Error('No se encontró un jugador habilitado para responder.');
}

async function playWrongIndividual(host, player) {
  const page = await waitForIndividualAnswerPage(host, player);
  await page.locator('#options-container .option-btn').first().click();
  await page.waitForTimeout(100);
}

async function selectIndividualQuestion(host, player) {
  for (let boardPage = 0; boardPage < 2; boardPage += 1) {
    for (const page of [host, player]) {
      const tile = page.locator('button.board-tile:not([disabled])').first();
      if (await tile.isVisible().catch(() => false) && await tile.isEnabled().catch(() => false)) {
        await tile.click();
        return;
      }
    }
    for (const page of [host, player]) {
      const next = page.getByRole('button', { name: 'Siguiente' });
      if (await next.isVisible().catch(() => false) && await next.isEnabled().catch(() => false)) {
        await next.click();
        break;
      }
    }
  }
  throw new Error('No se encontró una pregunta individual disponible.');
}

test.beforeAll(async () => {
  service = createTriviaServer({ trivia: privateFixture(), tutorial, allowedOrigins: ['http://127.0.0.1'] });
  await new Promise(resolve => service.httpServer.listen(0, '127.0.0.1', resolve));
  const address = service.httpServer.address();
  baseURL = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  for (const room of service.rooms.values()) clearTimeout(room.timer);
  // Socket.IO cierra su servidor HTTP asociado; cerrarlo por segunda vez deja
  // el runner esperando un callback que nunca llega en Windows.
  await new Promise(resolve => service.io.close(resolve));
});

test('partida integral: tres sesiones aisladas, tutorial, rebotes y final de equipos', async ({ browser }, testInfo) => {
  const hostContext = await createFastContext(browser, { width: 390, height: 844 }, 25);
  const playerContext = await createFastContext(browser, { width: 390, height: 844 }, 25);
  // Conserva la placa de rebote un poco más en la pantalla 16:9 para capturarla.
  const spectatorContext = await createFastContext(browser, { width: 1920, height: 1080 }, 900);
  const host = await createPlayerPage(hostContext, 'Anfitrión');

  await host.getByRole('button', { name: 'Crear sala' }).click();
  await host.locator('[data-room-mode="teams"]').click();
  await host.locator('[data-response-mode="individual"]').click();
  await expect(host.locator('#btn-create-config')).toHaveText('Crear sala por equipos');
  await host.screenshot({ path: testInfo.outputPath('01-creacion-sala.png'), fullPage: true });
  await host.locator('#btn-create-config').click();
  await host.getByRole('button', { name: 'Unirme a Chicos' }).click();
  const roomCode = await host.locator('#lbl-room').textContent();
  expect(roomCode).toMatch(/^SABELO-/);
  await host.locator('[data-copy-code]').click();
  await expect(host.locator('[data-copy-code]')).toHaveText('¡Código copiado!');
  await host.reload();
  await expect(host.locator('#lbl-room')).toHaveText(roomCode);
  await host.locator('[data-copy-code]').click();
  await expect(host.locator('[data-copy-code]')).toHaveText('¡Código copiado!');

  const player = await createPlayerPage(playerContext, 'Jugadora');
  await player.getByRole('button', { name: 'Unirse a sala' }).click();
  await player.locator('#input-room').fill(roomCode);
  await player.locator('#btn-room-action').click();
  await expect(player.locator('#screen-team-choice')).toHaveClass(/active/);
  await player.screenshot({ path: testInfo.outputPath('02-eleccion-bandos.png'), fullPage: true });
  await player.getByRole('button', { name: 'Unirme a Chicas' }).click();

  const spectator = await createPlayerPage(spectatorContext, 'Pantalla', true);
  await spectator.getByRole('button', { name: 'Unirse a sala' }).click();
  await spectator.locator('#input-room').fill(roomCode);
  await spectator.locator('#btn-room-action').click();
  await expect(spectator.locator('#screen-team-lobby')).toHaveClass(/active/);
  await expect(spectator.locator('#team-lobby-rosters')).toContainText('Anfitrión');
  await expect(spectator.locator('#team-lobby-rosters')).toContainText('Jugadora');
  await expect(spectator.locator('#spectator-broadcast')).toContainText('CHICOS VS. CHICAS');
  await spectator.screenshot({ path: testInfo.outputPath('03-sala-espera.png'), fullPage: true });

  await expect(host.locator('#team-lobby-start')).toBeEnabled();
  await host.locator('#team-lobby-start').click();
  await host.getByRole('button', { name: /Iniciar duelo/ }).click();
  await expect(spectator.locator('#screen-team-question')).toHaveClass(/active/);
  await expect(spectator.locator('#team-test-badge')).toContainText('RONDA 0');
  await expect(spectator.locator('#spectator-broadcast')).toContainText('PRÁCTICA SIN PUNTUACIÓN');
  await spectator.waitForTimeout(380);
  await spectator.screenshot({ path: testInfo.outputPath('04-ronda-0.png'), fullPage: true });

  // La fixture mantiene la solución en el servidor y elige siempre el índice 2.
  // Hacer clic en la primera opción fuerza un rebote sin revelar esa solución al cliente.
  await playWrongAttempt(host, player, { settle: false });
  await expect(spectator.locator('#team-turn-message')).toContainText('REBOTE');
  await expect(spectator.locator('#spectator-broadcast')).toContainText('¡REBOTE!');
  await spectator.waitForTimeout(380);
  await spectator.screenshot({ path: testInfo.outputPath('05-rebote.png'), fullPage: true });
  await spectator.waitForTimeout(550);
  await playWrongAttempt(host, player);
  await expect(host.locator('#tutorial-action')).toBeVisible({ timeout: 5_000 });
  await host.locator('#tutorial-action').click();
  await playWrongAttempt(host, player);
  await playWrongAttempt(host, player);
  await expect(host.locator('#tutorial-action')).toHaveText('Iniciar competencia oficial', { timeout: 5_000 });
  await host.locator('#tutorial-action').click();

  await expect(spectator.locator('#team-progress')).toContainText('Ronda 1 de 10');
  await expect(spectator.locator('#spectator-broadcast')).toContainText('Pregunta privada de prueba 1');
  await spectator.waitForTimeout(550);
  await spectator.screenshot({ path: testInfo.outputPath('06-pregunta-activa.png'), fullPage: true });
  for (let turn = 0; turn < 20; turn += 1) {
    await playWrongAttempt(host, player);
    await playWrongAttempt(host, player);
  }

  await expect(spectator.locator('#screen-team-final')).toHaveClass(/active/, { timeout: 15_000 });
  await expect(spectator.locator('#team-final-title')).toContainText('Empate');
  await expect(spectator.locator('#spectator-broadcast')).toContainText('¡EMPATE!');
  await spectator.waitForTimeout(550);
  await spectator.setViewportSize({ width: 1280, height: 720 });
  await spectator.screenshot({ path: testInfo.outputPath('07-final-equipos-16x9.png'), fullPage: true });
  await expect(spectator.locator('body')).not.toContainText('correctIndex');
  await expect(spectator.locator('body')).not.toContainText('"correct"');

  await hostContext.close();
  await playerContext.close();
  await spectatorContext.close();
});

test('modo individual: tutorial y podio final en pantalla de espectador', async ({ browser }, testInfo) => {
  const hostContext = await createFastContext(browser, { width: 390, height: 844 }, 25);
  const playerContext = await createFastContext(browser, { width: 390, height: 844 }, 25);
  const spectatorContext = await createFastContext(browser, { width: 1440, height: 810 }, 25);
  const host = await createPlayerPage(hostContext, 'Individual A');
  await host.getByRole('button', { name: 'Crear sala' }).click();
  await host.locator('#btn-create-config').click();
  const roomCode = await host.locator('#lbl-room').textContent();
  const player = await createPlayerPage(playerContext, 'Individual B');
  await player.getByRole('button', { name: 'Unirse a sala' }).click();
  await player.locator('#input-room').fill(roomCode);
  await player.locator('#btn-room-action').click();
  const spectator = await createPlayerPage(spectatorContext, 'Pantalla individual', true);
  await spectator.getByRole('button', { name: 'Unirse a sala' }).click();
  await spectator.locator('#input-room').fill(roomCode);
  await spectator.locator('#btn-room-action').click();
  await expect(spectator.locator('#screen-categories')).toHaveClass(/active/);
  await expect(spectator.locator('#lbl-role')).toHaveText('Espectador');

  await host.getByRole('button', { name: /Biblia de prueba/ }).click();
  await expect.poll(() => [...service.rooms.values()].find(room => room.code === roomCode)?.categoryKey).toBe('biblia');
  await expect.poll(() => spectator.evaluate(() => window.__sabeloSocketEvents.includes('question:opened'))).toBe(true);
  await expect.poll(() => spectator.evaluate(() => window.__sabeloPageErrors.join('\n'))).toBe('');
  await expect(spectator.locator('#screen-question')).toHaveClass(/active/);
  await playWrongIndividual(host, player);
  await playWrongIndividual(host, player);
  await expect(host.locator('#tutorial-action')).toBeVisible();
  await host.locator('#tutorial-action').click();
  await playWrongIndividual(host, player);
  await playWrongIndividual(host, player);
  await expect(host.locator('#tutorial-action')).toHaveText('Iniciar competencia oficial');
  await host.locator('#tutorial-action').click();

  await expect(host.locator('.board-heading')).toHaveCount(6);
  await expect(host.getByText('Página 1 de 2')).toBeVisible();
  await expect(host.getByRole('button', { name: 'Anterior' })).toBeDisabled();
  await host.getByRole('button', { name: 'Siguiente' }).click();
  await expect(host.locator('.board-heading')).toHaveCount(1);
  await expect(host.getByText('Página 2 de 2')).toBeVisible();
  await host.getByRole('button', { name: 'Anterior' }).click();

  for (let question = 0; question < 20; question += 1) {
    await selectIndividualQuestion(host, player);
    await playWrongIndividual(host, player);
    await playWrongIndividual(host, player);
  }

  await expect(spectator.locator('#screen-podium')).toHaveClass(/active/, { timeout: 10_000 });
  await expect(spectator.locator('#podium-leaders')).toContainText('Individual A');
  await expect(spectator.locator('#podium-leaders')).toContainText('Individual B');
  await spectator.screenshot({ path: testInfo.outputPath('08-podio-individual-16x9.png'), fullPage: true });
  await expect(spectator.locator('body')).not.toContainText('correctIndex');
  await hostContext.close();
  await playerContext.close();
  await spectatorContext.close();
});
