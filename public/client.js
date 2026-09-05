const socket = io();

let codigoSala = '';
let esAnfitrion = false;

const vistaInicio = document.getElementById('vista-inicio');
const vistaLobby = document.getElementById('vista-lobby');
const vistaJuego = document.getElementById('vista-juego');
const vistaResultados = document.getElementById('vista-resultados');

document.getElementById('btn-crear').addEventListener('click', () => {
    const nombre = document.getElementById('input-nombre').value.trim();
    if (!nombre) return mostrarError('Ingresa tu nombre.');
    const rol = document.querySelector('input[name="rol"]:checked').value;
    esAnfitrion = true;
    socket.emit('crear-sala', { nombre, rol });
});

document.getElementById('btn-unirse').addEventListener('click', () => {
    const nombre = document.getElementById('input-nombre').value.trim();
    const codigo = document.getElementById('input-codigo').value.trim().toUpperCase();
    if (!nombre) return mostrarError('Ingresa tu nombre.');
    if (!codigo || codigo.length < 5) return mostrarError('Ingresa un código válido.');
    const rol = document.querySelector('input[name="rol"]:checked').value;
    esAnfitrion = false;
    socket.emit('unirse-sala', { codigo, nombre, rol });
});

socket.on('sala-creada', (data) => {
    codigoSala = data.codigo;
    cambiarVista(vistaLobby);
    document.getElementById('span-codigo').textContent = codigoSala;
    document.getElementById('btn-iniciar').classList.remove('hidden');
    document.getElementById('esperando-texto').classList.add('hidden');
});

socket.on('sala-unida', (data) => {
    codigoSala = data.codigo;
    cambiarVista(vistaLobby);
    document.getElementById('span-codigo').textContent = codigoSala;
});

socket.on('error-conexion', (msg) => {
    mostrarError(msg);
});

socket.on('actualizar-sala', (sala) => {
    document.getElementById('count-jugadores').textContent = sala.jugadores.length;
    document.getElementById('lista-jugadores').innerHTML = sala.jugadores.map(j => `<li>👤 ${j.nombre}</li>`).join('');
    document.getElementById('count-espectadores').textContent = sala.espectadores.length;
    document.getElementById('lista-espectadores').innerHTML = sala.espectadores.map(e => `<li>📺 ${e.nombre}</li>`).join('');
});

document.getElementById('btn-iniciar').addEventListener('click', () => {
    socket.emit('iniciar-juego', { codigo: codigoSala });
});

let temporizadorInterval = null;

socket.on('comenzar-ronda', (data) => {
    cambiarVista(vistaJuego);
    const p = data.pregunta;
    document.getElementById('info-ronda').textContent = `Ronda ${data.ronda}/${data.total}`;
    document.getElementById('badge-categoria').textContent = `${p.categoria} (${p.puntos} pts)`;
    document.getElementById('texto-pregunta').textContent = p.pregunta;
    
    const feedback = document.getElementById('feedback-respuesta');
    feedback.classList.add('hidden');

    const btnSiguiente = document.getElementById('btn-siguiente-ronda');
    if (esAnfitrion) {
        btnSiguiente.classList.remove('hidden');
        btnSiguiente.onclick = () => {
            socket.emit('siguiente-ronda', { codigo: codigoSala });
        };
    } else {
        btnSiguiente.classList.add('hidden');
    }

    let tiempo = 15;
    document.getElementById('temporizador').textContent = `${tiempo}s`;

    const grid = document.getElementById('grid-opciones');
    grid.innerHTML = '';
    p.opciones.forEach((op, idx) => {
        const btn = document.createElement('button');
        btn.className = 'btn-opcion';
        btn.textContent = op;
        btn.onclick = () => {
            document.querySelectorAll('.btn-opcion').forEach(b => b.disabled = true);
            btn.classList.add('seleccionada');
            socket.emit('enviar-respuesta', { codigo: codigoSala, respuestaIndex: idx });
            
            const esCorrecta = (idx === p.correcta);
            feedback.textContent = esCorrecta ? `¡Correcto! 🎉` : `¡Incorrecto! ❌`;
            feedback.style.color = esCorrecta ? 'var(--secondary)' : 'var(--danger)';
            feedback.classList.remove('hidden');
        };
        grid.appendChild(btn);
    });

    clearInterval(temporizadorInterval);
    temporizadorInterval = setInterval(() => {
        tiempo--;
        document.getElementById('temporizador').textContent = `${tiempo}s`;
        if (tiempo <= 0) clearInterval(temporizadorInterval);
    }, 1000);
});

socket.on('actualizar-puntajes', (jugadores) => {
    const list = document.getElementById('lista-puntajes-vivo');
    const ordenados = [...jugadores].sort((a, b) => b.puntaje - a.puntaje);
    list.innerHTML = ordenados.map(j => `<li><span>${j.nombre}</span> <strong>${j.puntaje} pts</strong></li>`).join('');
});

socket.on('fin-juego', (jugadores) => {
    cambiarVista(vistaResultados);
    const ordenados = [...jugadores].sort((a, b) => b.puntaje - a.puntaje);
    const podio = document.getElementById('lista-podio');
    podio.innerHTML = ordenados.map((j, idx) => {
        const medalla = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅';
        return `<li>${medalla} ${j.nombre} — ${j.puntaje} pts</li>`;
    }).join('');
});

function cambiarVista(vista) {
    [vistaInicio, vistaLobby, vistaJuego, vistaResultados].forEach(v => v.classList.add('hidden'));
    vista.classList.remove('hidden');
}

function mostrarError(msg) {
    const err = document.getElementById('error-msg');
    err.textContent = msg;
    setTimeout(() => err.textContent = '', 3500);
}