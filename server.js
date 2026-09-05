const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Banco de preguntas integrado
const BANCO_PREGUNTAS = [
    { categoria: "Cultura General", pregunta: "¿Cuál es el país más grande del mundo por superficie?", opciones: ["Canadá", "China", "Rusia", "Estados Unidos"], correcta: 2, puntos: 100 },
    { categoria: "Cultura General", pregunta: "¿Qué gas abunda más en la atmósfera de la Tierra?", opciones: ["Oxígeno", "Nitrógeno", "Dióxido de Carbono", "Hidrógeno"], correcta: 1, puntos: 100 },
    { categoria: "Biblia", pregunta: "¿Cómo se llamaba el gigante filisteo que enfrentó David?", opciones: ["Goliat", "Sansón", "Saúl", "Absalón"], correcta: 0, puntos: 150 },
    { categoria: "Biblia", pregunta: "¿En qué monte recibió Moisés las tablas de la ley?", opciones: ["Monte Carmelo", "Monte Sinaí", "Monte de los Olivos", "Monte Ararat"], correcta: 1, puntos: 150 },
    { categoria: "Películas & Series", pregunta: "¿Cuál es el nombre del protagonista en 'Volver al Futuro'?", opciones: ["Marty McFly", "Emmett Brown", "Biff Tannen", "John Connor"], correcta: 0, puntos: 100 },
    { categoria: "Películas & Series", pregunta: "¿Qué nave espacial capitanea Han Solo en Star Wars?", opciones: ["Destructor Estelar", "Halcón Milenario", "Caza TIE", "X-Wing"], correcta: 1, puntos: 100 },
    { categoria: "Argentina General", pregunta: "¿En qué año se declaró la Independencia de Argentina?", opciones: ["1810", "1816", "1820", "1806"], correcta: 1, puntos: 200 },
    { categoria: "Argentina General", pregunta: "¿Cuál es el pico más alto de Argentina y de América?", opciones: ["Monte Aconcagua", "Cerro Chaltén", "Volcán Llullaillaco", "Cerro Catedral"], correcta: 0, puntos: 200 },
    { categoria: "Música & Hits", pregunta: "¿Quién es conocido como 'El Rey del Rock and Roll'?", opciones: ["Freddie Mercury", "Michael Jackson", "Elvis Presley", "John Lennon"], correcta: 2, puntos: 100 },
    { categoria: "Música & Hits", pregunta: "¿De qué país es originaria la banda de rock U2?", opciones: ["Reino Unido", "Estados Unidos", "Irlanda", "Australia"], correcta: 2, puntos: 150 },
    { categoria: "Deportes & Fútbol", pregunta: "¿Con qué selección ganó Lionel Messi la Copa del Mundo en Qatar 2022?", opciones: ["Brasil", "Francia", "Argentina", "Alemania"], correcta: 2, puntos: 100 },
    { categoria: "Deportes & Fútbol", pregunta: "¿Cada cuántos años se celebran los Juegos Olímpicos?", opciones: ["2 años", "3 años", "4 años", "5 años"], correcta: 2, puntos: 100 },
    { categoria: "Ciencia & Tecnología", pregunta: "¿Qué unidad se utiliza para medir la resistencia eléctrica?", opciones: ["Voltio", "Amperio", "Ohmio", "Vatio"], correcta: 2, puntos: 200 },
    { categoria: "Ciencia & Tecnología", pregunta: "¿Quién formuló la teoría de la relatividad?", opciones: ["Isaac Newton", "Albert Einstein", "Nikola Tesla", "Galileo Galilei"], correcta: 1, puntos: 100 },
    { categoria: "Curiosidades & Absurdos", pregunta: "¿Cuál es el animal terrestre más rápido del mundo?", opciones: ["León", "Guepardo", "Antílope", "Cebra"], correcta: 1, puntos: 100 },
    { categoria: "Curiosidades & Absurdos", pregunta: "¿Cuántos corazones tiene un pulpo?", opciones: ["Uno", "Dos", "Tres", "Cuatro"], correcta: 2, puntos: 200 }
];

const salas = {};

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    socket.on('crear-sala', ({ nombre, rol }) => {
        const codigo = Math.random().toString(36).substring(2, 7).toUpperCase();
        socket.join(codigo);

        salas[codigo] = {
            anfitrion: socket.id,
            jugadores: [],
            espectadores: [],
            rondaActual: 0,
            preguntas: []
        };

        if (rol === 'espectador') {
            salas[codigo].espectadores.push({ id: socket.id, nombre });
        } else {
            salas[codigo].jugadores.push({ id: socket.id, nombre, puntaje: 0 });
        }

        socket.emit('sala-creada', { codigo, rol });
        io.to(codigo).emit('actualizar-sala', salas[codigo]);
    });

    socket.on('unirse-sala', ({ codigo, nombre, rol }) => {
        if (!salas[codigo]) {
            return socket.emit('error-conexion', 'La sala no existe.');
        }

        socket.join(codigo);
        if (rol === 'espectador') {
            salas[codigo].espectadores.push({ id: socket.id, nombre });
        } else {
            salas[codigo].jugadores.push({ id: socket.id, nombre, puntaje: 0 });
        }

        socket.emit('sala-unida', { codigo, rol });
        io.to(codigo).emit('actualizar-sala', salas[codigo]);
    });

    socket.on('iniciar-juego', ({ codigo }) => {
        if (!salas[codigo]) return;
        // Seleccionar 8 preguntas aleatorias por partida
        salas[codigo].preguntas = [...BANCO_PREGUNTAS].sort(() => 0.5 - Math.random()).slice(0, 8);
        salas[codigo].rondaActual = 0;
        
        io.to(codigo).emit('comenzar-ronda', {
            pregunta: salas[codigo].preguntas[0],
            ronda: 1,
            total: salas[codigo].preguntas.length
        });
    });

    socket.on('enviar-respuesta', ({ codigo, respuestaIndex }) => {
        const sala = salas[codigo];
        if (!sala) return;

        const preguntaActual = sala.preguntas[sala.rondaActual];
        const jugador = sala.jugadores.find(j => j.id === socket.id);

        if (jugador) {
            if (respuestaIndex === preguntaActual.correcta) {
                jugador.puntaje += preguntaActual.puntos;
            }
            io.to(codigo).emit('actualizar-puntajes', sala.jugadores);
        }
    });

    socket.on('siguiente-ronda', ({ codigo }) => {
        const sala = salas[codigo];
        if (!sala) return;

        sala.rondaActual++;
        if (sala.rondaActual < sala.preguntas.length) {
            io.to(codigo).emit('comenzar-ronda', {
                pregunta: sala.preguntas[sala.rondaActual],
                ronda: sala.rondaActual + 1,
                total: sala.preguntas.length
            });
        } else {
            io.to(codigo).emit('fin-juego', sala.jugadores);
        }
    });

    socket.on('disconnect', () => {
        for (const codigo in salas) {
            const sala = salas[codigo];
            sala.jugadores = sala.jugadores.filter(j => j.id !== socket.id);
            sala.espectadores = sala.espectadores.filter(e => e.id !== socket.id);
            io.to(codigo).emit('actualizar-sala', sala);
        }
        console.log(`Usuario desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor de SABELO corriendo en http://localhost:${PORT}`);
});