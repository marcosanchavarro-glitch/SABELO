// Estado global de la aplicación
const gameState = {
    username: '',
    role: 'jugador', // 'jugador' o 'espectador'
    roomCode: '',
    isHost: false,    // Define si el usuario actual creó la sala y tiene el control
    score: 0,
    activeCategory: null,
    activeSubcategoryKey: null,
    activeQuestion: null
};

// Base de datos completa: 9 Categorías Principales con 6 Subcategorías (Niveles de 100 a 500 pts)
const dbTrivia = {
    cultura: {
        title: "🌍 Cultura General",
        subcategories: {
            geografia: {
                title: "Geografía",
                questions: [
                    { points: 100, q: "¿Cuál es la capital de Australia?", options: ["Sídney", "Melbourne", "Canberra", "Perth"], correct: 2 },
                    { points: 200, q: "¿En qué continente se encuentra el desierto de Kalahari?", options: ["África", "Asia", "América del Sur", "Oceanía"], correct: 0 },
                    { points: 300, q: "¿Cuál es el río más largo del mundo según las mediciones hidrológicas modernas?", options: ["Nilo", "Amazonas", "Yangtsé", "Misisipi"], correct: 1 },
                    { points: 400, q: "¿Qué cordillera separa Europa de Asia?", options: ["Los Alpes", "Los Andes", "Los Urales", "El Cáucaso"], correct: 2 },
                    { points: 500, q: "¿Cuál es el país sin salida al mar más grande del mundo?", options: ["Mongolia", "Kazajistán", "Bolivia", "Paraguay"], correct: 1 }
                ]
            },
            historia: {
                title: "Historia",
                questions: [
                    { points: 100, q: "¿En qué año se produjo la caída del Imperio Romano de Occidente?", options: ["476 d. C.", "1492 d. C.", "33 a. C.", "1066 d. C."], correct: 0 },
                    { points: 200, q: "¿Quién fue el primer emperador de Roma?", options: ["Julio César", "Augusto", "Nerón", "Constantino"], correct: 1 },
                    { points: 300, q: "¿Qué civilización construyó la ciudad de Machu Picchu?", options: ["Azteca", "Maya", "Inca", "Olmeca"], correct: 2 },
                    { points: 400, q: "¿En qué año comenzó la Revolución Francesa?", options: ["1789", "1810", "1750", "1830"], correct: 0 },
                    { points: 500, q: "¿Qué tratado puso fin formalmente a la Primera Guerra Mundial en 1919?", options: ["Tratado de Tordesillas", "Tratado de Versalles", "Paz de Westfalia", "Tratado de Viena"], correct: 1 }
                ]
            },
            ciencia: {
                title: "Ciencia",
                questions: [
                    { points: 100, q: "¿Cuál es el órgano más grande del cuerpo humano?", options: ["El hígado", "El corazón", "El cerebro", "La piel"], correct: 3 },
                    { points: 200, q: "¿Cuál es el símbolo químico del oro?", options: ["Ag", "Au", "Pb", "Fe"], correct: 1 },
                    { points: 300, q: "¿A qué velocidad viaja la luz en el vacío aproximadamente?", options: ["300.000 km/s", "150.000 km/s", "1.080 km/h", "3.000 km/s"], correct: 0 },
                    { points: 400, q: "¿Qué partícula subatómica tiene carga eléctrica negativa?", options: ["Protón", "Neutrón", "Electrón", "Positrón"], correct: 2 },
                    { points: 500, q: "¿Quién formuló la teoría de la relatividad general en 1915?", options: ["Isaac Newton", "Albert Einstein", "Galileo Galilei", "Niels Bohr"], correct: 1 }
                ]
            },
            arte: {
                title: "Arte y Literatura",
                questions: [
                    { points: 100, q: "¿Quién pintó la obra maestra 'La última cena'?", options: ["Miguel Ángel", "Leonardo da Vinci", "Rafael Sanzio", "Donatello"], correct: 1 },
                    { points: 200, q: "¿Quién escribió la novela clásica 'Don Quijote de la Mancha'?", options: ["Gabriel García Márquez", "Lope de Vega", "Miguel de Cervantes", "Jorge Luis Borges"], correct: 2 },
                    { points: 300, q: "¿En qué museo se encuentra expuesta la famosa pintura de 'La Mona Lisa'?", options: ["Museo del Prado", "The Metropolitan Museum", "Museo del Louvre", "Uffizi"], correct: 2 },
                    { points: 400, q: "¿Qué autor escribió la tragedia de 'Hamlet'?", options: ["William Shakespeare", "Charles Dickens", "Victor Hugo", "Fiódor Dostoyevski"], correct: 0 },
                    { points: 500, q: "A qué movimiento artístico vanguardista pertenece la obra 'Guernica' de Pablo Picasso?", options: ["Impresionismo", "Surrealismo", "Cubismo", "Barroco"], correct: 2 }
                ]
            },
            curiosos: {
                title: "Datos Curiosos",
                questions: [
                    { points: 100, q: "¿Cuál es el único mamífero capaz de volar de manera sostenida?", options: ["La ardilla voladora", "El murciélago", "El lémur volador", "El colibrí"], correct: 1 },
                    { points: 200, q: "¿Cuántos corazones tiene un pulpo en su sistema circulatorio?", options: ["Uno", "Dos", "Tres", "Cuatro"], correct: 2 },
                    { points: 300, q: "¿Qué elemento químico es líquido a temperatura ambiente además del mercurio?", options: ["Bromo", "Galio", "Cesio", "Francio"], correct: 0 },
                    { points: 400, q: "¿Cuál es el animal terrestre más rápido del mundo en carreras cortas?", options: ["León", "Gacela de Thomson", "Guepardo", "Antílope americano"], correct: 2 },
                    { points: 500, q: "¿En qué país se originó el juego de ajedrez moderno en su variante primitiva (Chaturanga)?", options: ["Grecia", "China", "India", "Egipto"], correct: 2 }
                ]
            },
            lengua: {
                title: "Lengua y Cultura",
                questions: [
                    { points: 100, q: "¿Cuál es el idioma más hablado del mundo como lengua materna?", options: ["Inglés", "Mandarín", "Español", "Hindi"], correct: 1 },
                    { points: 200, q: "¿Qué figura retórica consiste en exagerar una afirmación de forma desproporcionada?", options: ["Metáfora", "Hipérbole", "Ironía", "Anáfora"], correct: 1 },
                    { points: 300, q: "¿De qué idioma provienen la mayoría de los arabismos presentes en el español?", options: ["Árabe clásico / andalusí", "Persa", "Turco otomano", "Hebreo bíblico"], correct: 0 },
                    { points: 400, q: "¿Qué significa el refrán popular 'A caballo regalado no se le mira el colmillo' (o dientes)?", options: ["Hay que cuidar los animales", "No se debe criticar lo que se recibe gratis", "Los regalos caros son mejores", "Hay que examinar las compras"], correct: 1 },
                    { points: 500, q: "¿Cuál es la única lengua oficial de la Unión Europea que no pertenece a la familia indoeuropea?", options: ["Finés", "Griego", "Estonio", "Húngaro"], correct: 3 }
                ]
            }
        }
    },
    biblia: {
        title: "📖 Biblia",
        subcategories: {
            personajes: {
                title: "Personajes bíblicos",
                questions: [
                    { points: 100, q: "¿Quién construyó el arca para salvar a su familia y animales del diluvio universal?", options: ["Moisés", "Abraham", "Noé", "David"], correct: 2 },
                    { points: 200, q: "¿Qué personaje derrotó al gigante filisteo Goliat usando únicamente una honda?", options: ["Sansón", "Salomón", "Saúl", "David"], correct: 3 },
                    { points: 300, q: "¿Quién fue vendido como esclavo por sus hermanos y llegó a ser gobernador de Egipto?", options: ["José", "Isaac", "Jacob", "Benjamín"], correct: 0 },
                    { points: 400, q: "¿Qué profeta fue tragado por un gran pez tras intentar huir de la misión encomendada por Dios?", options: ["Elías", "Jonás", "Isaías", "Jeremías"], correct: 1 },
                    { points: 500, q: "¿Quién fue la reina de Persia que intercedió con valentía para salvar al pueblo judío del exterminio?", options: ["Rut", "Noemí", "Ester", "Abigail"], correct: 2 }
                ]
            },
            libros: {
                title: "Libros de la Biblia",
                questions: [
                    { points: 100, q: "¿Cuál es el primer libro que compone el Antiguo Testamento y la Biblia?", options: ["Éxodo", "Génesis", "Levítico", "Salmos"], correct: 1 },
                    { points: 200, q: "¿Cuáles son los cuatro primeros libros del Nuevo Testamento (los Evangelios)?", options: ["Génesis, Éxodo, Levítico, Números", "Mateo, Marcos, Lucas, Juan", "Hechos, Romanos, Corintios, Gálatas", "Apocalipsis, Judas, Santiago, Pedro"], correct: 1 },
                    { points: 300, q: "¿Qué libro poético del Antiguo Testamento contiene 150 cánticos y oraciones?", options: ["Proverbios", "Eclesiastés", "Salmos", "Cantares"], correct: 2 },
                    { points: 400, q: "¿Cuál es el último libro de la Biblia cristiana?", options: ["Judas", "Apocalipsis", "Hebreos", "Malaquías"], correct: 1 },
                    { points: 500, q: "¿Quién es tradicionalmente considerado el autor principal de la mayor cantidad de cartas del Nuevo Testamento?", options: ["Pedro", "Juan", "Pablo", "Santiago"], correct: 2 }
                ]
            },
            lugares: {
                title: "Lugares bíblicos",
                questions: [
                    { points: 100, q: "¿En qué ciudad nació Jesús de Nazaret según los relatos evangélicos?", options: ["Nazaret", "Jerusalén", "Belén", "Cafarnaúm"], correct: 2 },
                    { points: 200, q: "¿En qué monte entregó Dios las tablas de la ley (los 10 mandamientos) a Moisés?", options: ["Monte Carmelo", "Monte Sinaí", "Monte de los Olivos", "Monte Nebo"], correct: 1 },
                    { points: 300, q: "¿En qué río fue bautizado Jesús por Juan el Bautista?", options: ["Río Nilo", "Río Éufrates", "Río Jordán", "Río Tigris"], correct: 2 },
                    { points: 400, q: "¿Cómo se llamaba el jardín donde Jesús pasó sus horas de angustia y oración antes de ser arrestado?", options: ["Edén", "Getsemaní", "Getsemaní", "Getsemaní (Huerto de los Olivos)"], correct: 1 },
                    { points: 500, q: "¿A qué isla fue exiliado el apóstol Juan cuando escribió el libro de Apocalipsis?", options: ["Chipre", "Creta", "Patmos", "Malta"], correct: 2 }
                ]
            },
            jesus: {
                title: "Vida de Jesús",
                questions: [
                    { points: 100, q: "¿Cuál fue el primer milagro realizado por Jesús según el Evangelio de Juan?", options: ["Curar a un ciego", "Multiplicar los panes y peces", "Convertir el agua en vino en Caná", "Caminar sobre el agua"], correct: 2 },
                    { points: 200, q: "¿A qué famoso personaje religioso le habló Jesús de noche sobre la necesidad de 'nacer de nuevo'?", options: ["Nicodemo", "Zaqueo", "José de Arimatea", "Gamaliel"], correct: 0 },
                    { points: 300, q: "¿Qué parábola narra la historia de un hijo que abandona su hogar y es recibido con gran misericordia por su padre?", options: ["El buen samaritano", "El sembrador", "El hijo pródigo", "Los talentos"], correct: 2 },
                    { points: 400, q: "¿En qué monte tuvo lugar el famoso Sermón del Monte, donde Jesús pronunció las Bienaventuranzas?", options: ["Monte Tabor", "Un monte en Galilea (Sermón del Monte)", "Monte Carmelo", "Monte Calvario"], correct: 1 },
                    { points: 500, q: "¿A qué amigo resucitó Jesús de entre los muertos en la localidad de Betania?", options: ["Lázaro", "Jairo", "Bartimeo", "Mateo"], correct: 0 }
                ]
            },
            dijoque: {
                title: "¿Quién dijo qué?",
                questions: [
                    { points: 100, q: "¿Quién exclamó: 'Hágase en mí según tu palabra', al aceptar el anuncio del ángel?", options: ["Elisabet", "María", "Marta", "María Magdalena"], correct: 1 },
                    { points: 200, q: "¿Quién dijo ante las autoridades: 'Es necesario obedecer a Dios antes que a los hombres'?", options: ["El apóstol Pedro", "Esteban", "Pablo de Tarso", "Juan el Bautista"], correct: 0 },
                    { points: 300, q: "¿Quién pronunció la famosa frase: 'He peleado la buena batalla, he acabado la carrera, he guardado la fe'?", options: ["Pedro", "Pablo", "Timoteo", "Juan"], correct: 1 },
                    { points: 400, q: "¿Qué gobernador romano se lavó las manos ante la multitud diciendo ser inocente de la sangre de Jesús?", options: ["Herodes Antipas", "Poncio Pilato", "César Augusto", "Félix"], correct: 1 },
                    { points: 500, q: "¿Quién respondió con fe: 'Señor, creo; ayuda mi incredulidad'?", options: ["El padre de un muchacho epiléptico / endemoniado", "Tomás el discípulo", "Pedro al caminar en el agua", "La mujer cananea"], correct: 0 }
                ]
            },
            historias: {
                title: "Historias bíblicas",
                questions: [
                    { points: 100, q: "¿Qué cayó del cielo como alimento milagroso para alimentar a los israelitas en el desierto?", options: ["Maná", "Pan y miel", "Frutos silvestres", "Codornices exclusivamente"], correct: 0 },
                    { points: 200, q: "¿Qué murallas cayeron derrumbadas tras dar vueltas alrededor de ellas y tocar trompetas?", options: ["Nínive", "Babilonia", "Jericó", "Sodoma"], correct: 2 },
                    { points: 300, q: "¿En qué situación milagrosa fueron librados Sadrac, Mesac y Abed-nego?", options: ["Foso de los leones", "Horno de fuego ardiendo", "Prisión de Filipos", "Tempestad en el mar"], correct: 1 },
                    { points: 400, q: "¿Qué profeta fue alimentado milagrosamente por cuervos junto al arroyo de Querit?", options: ["Elías", "Eliseo", "Amós", "Oseas"], correct: 0 },
                    { points: 500, q: "¿Qué señal celestial apareció en el cielo para guiar a los magos de Oriente hasta el lugar donde estaba Jesús?", options: ["Una lluvia de estrellas", "Una estrella brillante", "Un ángel radiante", "Una columna de fuego"], correct: 1 }
                ]
            }
        }
    },
    peliculas: {
        title: "🎬 Películas y Series",
        subcategories: {
            peliculasfam: {
                title: "Películas famosas",
                questions: [
                    { points: 100, q: "¿Cómo se llama el tiburón gigante y aterrorizador del clásico dirigido por Steven Spielberg en 1975?", options: ["Megalodón", "Tiburón (Jaws)", "Willy", "Orca"], correct: 1 },
                    { points: 200, q: "¿Qué actor interpretó al icónico espía James Bond en la película 'Casino Royale' (2006)?", options: ["Pierce Brosnan", "Daniel Craig", "Sean Connery", "Roger Moore"], correct: 1 },
                    { points: 300, q: "¿Qué película de ciencia ficción dirigida por Christopher Nolan explora los sueños dentro de sueños?", options: ["Interstellar", "Memento", "Inception (El origen)", "Tenet"], correct: 2 },
                    { points: 400, q: "¿Cuál es el nombre del parque temático de clonación de dinosaurios creado por John Hammond?", options: ["Prehistoric Land", "Jurassic Park", "Dino World", "Extinction Park"], correct: 1 },
                    { points: 500, q: "¿Qué director ganó el Óscar a Mejor Película con 'Parasite' (Parásitos) en 2020?", options: ["Bong Joon-ho", "Park Chan-wook", "Kim Jee-woon", "Ryusuke Hamaguchi"], correct: 0 }
                ]
            },
            series: {
                title: "Series",
                questions: [
                    { points: 100, q: "¿Cómo se llama el pueblo ficticio donde ocurren los extraños sucesos de la serie 'Stranger Things'?", options: ["Riverdale", "Hawkins", "Sunnydale", "Castle Rock"], correct: 1 },
                    { points: 200, q: "¿Qué bebida consumen habitualmente los personajes en la cafetería Central Perk de 'Friends'?", options: ["Té helado", "Café", "Cerveza de mantequilla", "Malteadas"], correct: 1 },
                    { points: 300, q: "¿Cuál es el nombre del profesor de química que se convierte en fabricante de metanfetamina en 'Breaking Bad'?", options: ["Saul Goodman", "Gustavo Fring", "Walter White", "Jesse Pinkman"], correct: 2 },
                    { points: 400, q: "¿Qué trono fantástico y codiciado es el centro de las disputas políticas en 'Game of Thrones'?", options: ["Trono de Oro", "Trono de Hierro", "Trono de Espadas", "Trono Dragón"], correct: 1 },
                    { points: 500, q: "¿En qué ciudad transcurre principalmente la serie animada de los 'Simpson'?", options: ["Shelbyville", "Capital City", "Springfield", "Ogdenville"], correct: 2 }
                ]
            },
            superheroes: {
                title: "Superhéroes",
                questions: [
                    { points: 100, q: "¿Cuál es la verdadera identidad secreta del superhéroe Batman?", options: ["Clark Kent", "Bruce Wayne", "Tony Stark", "Peter Parker"], correct: 1 },
                    { points: 200, q: "¿De qué planeta proviene el superhéroe Superman?", options: ["Krypton", "Marte", "Asgard", "Vulcano"], correct: 0 },
                    { points: 300, q: "¿Qué martillo mágico y místico utiliza Thor en el universo cinematográfico de Marvel?", options: ["Excalibur", "Mjölnir", "Stormbreaker", "Gungnir"], correct: 1 },
                    { points: 400, q: "¿Cómo se llama el escudo protector y arma principal del Capitán América?", options: ["Vibranium Shield", "Escudo de Adamantium", "Escudo de aleación de Vibranium", "Escudo estelar"], correct: 2 },
                    { points: 500, q: "¿Cuál es el nombre del archienemigo de Batman conocido como el Príncipe Payaso del Crimen?", options: ["El Pingüino", "El Acertijo", "El Guasón (Joker)", "Dos Caras"], correct: 2 }
                ]
            },
            fantasia: {
                title: "Fantasía y animación",
                questions: [
                    { points: 100, q: "¿Cómo se llama el vaquero protagonista de la saga de animación 'Toy Story' de Pixar?", options: ["Buzz Lightyear", "Woody", "Andy", "Rex"], correct: 1 },
                    { points: 200, q: "¿Qué reino helado protagoniza la exitosa película animada de Disney 'Frozen'?", options: ["Arendelle", "Corona", "Agrabah", "DunBroch"], correct: 0 },
                    { points: 300, q: "¿Cuál es el nombre del ogro verde protagonista de la saga de DreamWorks?", options: ["Fiona", "Burro", "Shrek", "Lord Farquaad"], correct: 2 },
                    { points: 400, q: "¿Qué estudio de animación japonés creó películas como 'El viaje de Chihiro' y 'Mi vecino Totoro'?", options: ["Toei Animation", "Studio Ghibli", "Kyoto Animation", "Madhouse"], correct: 1 },
                    { points: 500, q: "¿Cómo se llama el león protagonista que debe reclamar el trono en 'El Rey León'?", options: ["Mufasa", "Scar", "Simba", "Kovu"], correct: 2 }
                ]
            },
            personajes: {
                title: "Personajes",
                questions: [
                    { points: 100, q: "¿Qué arqueólogo y aventurero interpretado por Harrison Ford usa sombrero fedora y látigo?", options: ["Han Solo", "Indiana Jones", "Rick Deckard", "Jack Ryan"], correct: 1 },
                    { points: 200, q: "¿Cuál es el nombre del incorregible capitán pirata protagonista de 'Piratas del Caribe'?", options: ["Barbossa", "Jack Sparrow", "Will Turner", "Barbanegra"], correct: 1 },
                    { points: 300, q: "¿Qué mago joven y aprendiz asiste al Colegio Hogwarts de Magia y Hechicería?", options: ["Gandalf", "Harry Potter", "Frodo Bolsón", "Merlín"], correct: 1 },
                    { points: 400, q: "¿Cómo se llama el hobbit encargado de destruir el Anillo Único en el fuego del Monte del Destino?", options: ["Sam Gamyi", "Bilbo Bolsón", "Frodo Bolsón", "Pippin Tuk"], correct: 2 },
                    { points: 500, q: "¿Qué brillante agente del FBI busca atrapar al asesino Hannibal Lecter en 'El silencio de los corderos'?", options: ["Clarice Starling", "Dale Cooper", "Will Graham", "Fox Mulder"], correct: 0 }
                ]
            },
            frasespelis: {
                title: "¿De qué película/serie es?",
                questions: [
                    { points: 100, q: "¿A qué saga pertenece la célebre frase: 'Que la Fuerza esté contigo'?", options: ["Star Trek", "Star Wars", "Matrix", "Terminator"], correct: 1 },
                    { points: 200, q: "¿De qué película es la frase: 'Le haré una oferta que no podrá rechazar'?", options: ["Scarface", "Goodfellas", "El Padrino", "Los Soprano"], correct: 2 },
                    { points: 300, q: "¿A qué película pertenece la frase: 'Manten a tus amigos cerca, pero a tus enemigos más cerca'?", options: ["El Padrino Parte II", "Casino", "Érase una vez en América", "Los infiltrados"], correct: 0 },
                    { points: 400, q: "¿De qué película animada es la frase clásica: 'Al infinito y más allá'?", options: ["Buscando a Nemo", "Toy Story", "Los Increíbles", "Cars"], correct: 1 },
                    { points: 500, q: "¿De qué serie es la emblemática frase de advertencia: 'Se acerca el invierno' (Winter is coming)?", options: ["Vikingos", "The Witcher", "Game of Thrones", "El Señor de los Anillos: Los Anillos de Poder"], correct: 2 }
                ]
            }
        }
    },
    musica: {
        title: "🎵 Música",
        subcategories: {
            artistas: {
                title: "Artistas y bandas",
                questions: [
                    { points: 100, q: "¿Cómo se llamaba la legendaria banda de rock británica integrada por Freddie Mercury, Brian May, Roger Taylor y John Deacon?", options: ["The Beatles", "Led Zeppelin", "Queen", "Pink Floyd"], correct: 2 },
                    { points: 200, q: "¿Quién es conocido mundialmente como el 'Rey del Pop'?", options: ["Elvis Presley", "Michael Jackson", "Prince", "Stevie Wonder"], correct: 1 },
                    { points: 300, q: "¿Qué banda británica de rock alternativo interpreta éxitos como 'Yellow' y 'Fix You'?", options: ["Oasis", "Coldplay", "Radiohead", "Blur"], correct: 1 },
                    { points: 400, q: "¿Cuál es el verdadero nombre de la exitosa cantante pop estadounidense conocida como Lady Gaga?", options: ["Stefani Joanne Angelina Germanotta", "Ashley N. Frangipane", "Alecia Beth Moore", "Belcalis Almánzar"], correct: 0 },
                    { points: 500, q: "¿Qué banda de rock progresivo e instrumental británica lanzó el icónico álbum 'The Dark Side of the Moon'?", options: ["The Who", "Genesis", "Pink Floyd", "Yes"], correct: 2 }
                ]
            },
            adivinancancion: {
                title: "Adiviná la canción",
                questions: [
                    { points: 100, q: "¿Qué canción de Queen comienza con el coro operístico 'Galileo, Galileo, Galileo figaro'?", options: ["We Are the Champions", "Bohemian Rhapsody", "Somebody to Love", "Radio Ga Ga"], correct: 1 },
                    { points: 200, q: "¿Cuál es el título del famoso himno de rock de la banda AC/DC cuyo coro repite 'Thunder!'?", options: ["Highway to Hell", "Back in Black", "Thunderstruck", "You Shook Me All Night Long"], correct: 2 },
                    { points: 300, q: "¿Qué canción de Michael Jackson cuenta con un videoclip icónico donde se convierte en zombi bailando?", options: ["Bad", "Thriller", "Beat It", "Smooth Criminal"], correct: 1 },
                    { points: 400, q: "¿Qué tema musical de la banda Guns N' Roses incluye un famoso solo de guitarra interpretado por Slash bajo la lluvia?", options: ["Sweet Child O' Mine", "November Rain", "Paradise City", "Don't Cry"], correct: 1 },
                    { points: 500, q: "¿Cuál es la canción de Oasis que se convirtió en un himno generacional del britpop en los 90 con el verso 'Maybe...'?", options: ["Don't Look Back in Anger", "Wonderwall", "Champagne Supernova", "Live Forever"], correct: 1 }
                ]
            },
            generos: {
                title: "Géneros musicales",
                questions: [
                    { points: 100, q: "¿En qué país se originó el género musical conocido como Reggae durante la década de 1960?", options: ["Puerto Rico", "Cuba", "Jamaica", "República Dominicana"], correct: 2 },
                    { points: 200, q: "¿Cuál es el instrumento principal y característico del género musical flamenco originario de España?", options: ["El piano clásico", "La guitarra española / flamenca", "El acordeón", "El violín eléctrico"], correct: 1 },
                    { points: 300, q: "¿En qué ciudad estadounidense nació el género musical del Jazz a principios del siglo XX?", options: ["Nueva York", "Chicago", "Nueva Orleans", "Los Ángeles"], correct: 2 },
                    { points: 400, q: "¿Qué subgénero del rock surgió en Seattle a finales de los 80 con bandas como Nirvana y Pearl Jam?", options: ["Heavy Metal", "Grunge", "Punk Rock", "Indie Rock"], correct: 1 },
                    { points: 500, q: "¿De qué país es originario el género de música electrónica conocido como Trance / Techno moderno de grandes festivales?", options: ["Alemania y Países Bajos", "Estados Unidos", "Reino Unido", "Francia"], correct: 0 }
                ]
            },
            musicaarg: {
                title: "Música argentina",
                questions: [
                    { points: 100, q: "¿Quién fue el líder y vocalista de la emblemática banda de rock nacional 'Soda Stereo'?", options: ["Charly García", "Luis Alberto Spinetta", "Gustavo Cerati", "Fito Páez"], correct: 2 },
                    { points: 200, q: "¿Cómo se llama el famoso álbum doble de Charly García lanzado en 1983 considerado una obra maestra del rock argentino?", options: ["Clics Modernos", "Yendo de la cama al living", "Parte de la religión", "Los dinosaurios"], correct: 0 },
                    { points: 300, q: "¿Qué legendario músico argentino fundó bandas históricas como Almendra y Pescado Rabioso?", options: ["Luis Alberto Spinetta", "Pappo", "León Gieco", "David Lebón"], correct: 0 },
                    { points: 400, q: "¿Cuál es el nombre del álbum de Fito Páez que se convirtió en el disco más vendido en la historia del rock en Argentina (1992)?", options: ["El amor después del amor", "Circo Beat", "Giros", "Del 63"], correct: 0 },
                    { points: 500, q: "¿Qué artista de tango argentino revolucionó el género a nivel mundial creando el llamado 'Tango Nuevo' con su bandoneón?", options: ["Carlos Gardel", "Aníbal Troilo", "Astor Piazzolla", "Osvaldo Pugliese"], correct: 2 }
                ]
            },
            albumes: {
                title: "Álbumes y canciones",
                questions: [
                    { points: 100, q: "¿A qué álbum de la banda The Beatles pertenece la famosa portada donde cruzan un paso de peatones (Abbey Road)?", options: ["Sgt. Pepper's", "Abbey Road", "Let It Be", "Revolver"], correct: 1 },
                    { points: 200, q: "¿Qué álbum de Michael Jackson lanzado en 1982 sigue siendo el disco más vendido de todos los tiempos en la historia de la música?", options: ["Bad", "Dangerous", "Thriller", "Off the Wall"], correct: 2 },
                    { points: 300, q: "¿Qué artista lanzó en 2022 el exitoso álbum 'Midnights', ganando múltiples premios Grammy?", options: ["Taylor Swift", "Beyoncé", "Billie Eilish", "Dua Lipa"], correct: 0 },
                    { points: 400, q: "¿Cuál es el nombre del primer álbum de estudio de la banda de rock Guns N' Roses (1987)?", options: ["Use Your Illusion I", "Appetite for Destruction", "G N' R Lies", "Chinese Democracy"], correct: 1 },
                    { points: 500, q: "¿Qué álbum de Nirvana de 1991 contiene el himno generacional 'Smells Like Teen Spirit'?", options: ["In Utero", "Bleach", "Nevermind", "MTV Unplugged in New York"], correct: 2 }
                ]
            },
            musicacristiana: {
                title: "Música cristiana",
                questions: [
                    { points: 100, q: "¿Cómo se llama el reconocido grupo de música cristiana contemporánea y alabanza originario de Argentina (Tercer Cielo o Rescate...)?", options: ["Rojo", "Rescate", "Tercer Cielo", "Miel San Marcos"], correct: 2 },
                    { points: 200, q: "¿Qué cantautor y pastor cristiano puertorriqueño es autor de canciones muy conocidas como 'Tú estás aquí' y 'Cerca de ti'?", options: ["Marcos Witt", "Danilo Montero", "Jesús Adrián Romero", "Alex Campos"], correct: 2 },
                    { points: 300, q: "¿Quién es el intérprete y pastor mexicano con una trayectoria de décadas, famoso por temas como 'Renuévame' y 'En los montes, en los valles'?", options: ["Marcos Witt", "Juan Carlos Alvarado", "Jauregui", "Coalo Zamorano"], correct: 0 },
                    { points: 400, q: "¿Qué banda colombiana de pop/rock cristiano ha ganado múltiples premios Grammy Latinos con canciones como 'Al taller del maestro'?", options: ["Su Presencia", "Alex Campos", "Generación 12", "Kike Pavón"], correct: 1 },
                    { points: 500, q: "¿Cómo se llama el ministerio internacional de alabanza y adoración de la iglesia G12 en Bogotá que interpreta temas como 'Derramo mi perfume'?", options: ["Hillsong Worship", "Generación 12", "Bani Muñoz", "Canzion"], correct: 1 }
                ]
            }
        }
    },
    deportes: {
        title: "⚽ Deportes",
        subcategories: {
            futbol: {
                title: "Fútbol",
                questions: [
                    { points: 100, q: "¿Qué país ganó la Copa Mundial de la FIFA en Catar 2022?", options: ["Francia", "Brasil", "Argentina", "Alemania"], correct: 2 },
                    { points: 200, q: "¿Cuántos jugadores titulares componen un equipo de fútbol en el terreno de juego?", options: ["10", "11", "12", "9"], correct: 1 },
                    { points: 300, q: "¿Qué selección nacional ostenta el récord histórico de más Copas del Mundo ganadas (5 en total)?", options: ["Alemania", "Italia", "Argentina", "Brasil"], correct: 3 },
                    { points: 400, q: "¿Cuál es el trofeo que se otorga al máximo goleador de las ligas europeas de fútbol cada temporada?", options: ["Balón de Oro", "Bota de Oro", "The Best", "Puskás"], correct: 1 },
                    { points: 500, q: "¿Qué club europeo es el máximo ganador histórico de la Liga de Campeones de la UEFA (Champions League)?", options: ["AC Milan", "FC Barcelona", "Real Madrid", "Bayern Múnich"], correct: 2 }
                ]
            },
            basquet: {
                title: "Básquet",
                questions: [
                    { points: 100, q: "¿Cuántos puntos vale un tiro libre encestados en un partido oficial de básquetbol?", options: ["1 punto", "2 puntos", "3 puntos", "Depende de la distancia"], correct: 0 },
                    { points: 200, q: "¿Qué número histórico usaba habitualmente Michael Jordan con los Chicago Bulls?", options: ["23", "32", "33", "45"], correct: 0 },
                    { points: 300, q: "¿Cómo se llama la liga profesional de baloncesto de los Estados Unidos considerada la mejor del mundo?", options: ["FIBA", "NCAA", "NBA", "WNBA"], correct: 2 },
                    { points: 400, q: "¿Cuál es la altura reglamentaria del aro de básquetbol medida desde el suelo hasta el borde superior?", options: ["2,90 metros", "3,05 metros", "3,20 metros", "2,85 metros"], correct: 1 },
                    { points: 500, q: "¿Qué equipo de la NBA logró el récord histórico de 73 victorias en la temporada regular (2015-16)?", options: ["Chicago Bulls", "Los Angeles Lakers", "Golden State Warriors", "Boston Celtics"], correct: 2 }
                ]
            },
            automovilismo: {
                title: "Automovilismo",
                questions: [
                    { points: 100, q: "¿Qué significado tienen las siglas F1 en el automovilismo mundial?", options: ["Fuerza 1", "Fórmula 1", "Fast 1", "Federación 1"], correct: 1 },
                    { points: 200, q: "¿Qué piloto argentino conquistó cinco campeonatos mundiales de Fórmula 1 en la década de 1950?", options: ["Carlos Reutemann", "Juan Manuel Fangio", "José Froilán González", "Esteban Tuero"], correct: 1 },
                    { points: 300, q: "¿Qué escudería italiana es la más famosa y con mayor cantidad de participaciones históricas en la Fórmula 1?", options: ["McLaren", "Williams", "Ferrari", "Mercedes"], correct: 2 },
                    { points: 400, q: "¿En qué país se disputa el tradicional Gran Premio callejero considerado de mayor glamour en el calendario de la F1?", options: ["Singapur", "Mónaco", "Bélgica", "Italia"], correct: 1 },
                    { points: 500, q: "¿Qué piloto neerlandés ha dominado múltiples campeonatos mundiales recientes de F1 con la escudería Red Bull Racing?", options: ["Lewis Hamilton", "Charles Leclerc", "Max Verstappen", "Lando Norris"], correct: 2 }
                ]
            },
            combate: {
                title: "Deportes de combate",
                questions: [
                    { points: 100, q: "¿Cómo se denomina la empresa de artes marciales mixtas (MMA) más grande y famosa del mundo?", options: ["Bellator", "ONE Championship", "UFC (Ultimate Fighting Championship)", "PRIME"], correct: 2 },
                    { points: 200, q: "¿Cuántos asaltos reglamentarios como máximo se disputan en una pelea de campeonato mundial de boxeo profesional masculino tradicional?", options: ["10 asaltos", "12 asaltos", "15 asaltos", "8 asaltos"], correct: 1 },
                    { points: 300, q: "¿Qué arte marcial de origen japonés se traduce literalmente como 'el camino de la mano vacía'?", options: ["Judo", "Jiu-jitsu", "Karate", "Aikido"], correct: 2 },
                    { points: 400, q: "¿Qué legendario boxeador estadounidense ganó la medalla de oro olímpica en Roma 1960 bajo el nombre de Cassius Clay?", options: ["Mike Tyson", "Muhammad Ali", "Joe Frazier", "George Foreman"], correct: 1 },
                    { points: 500, q: "¿Qué disciplina de lucha olímpica y arte marcial se centra en proyecciones y control en el suelo mediante estrangulamientos y llaves articulares creado en Japón por Jigoro Kano?", options: ["Taekwondo", "Judo", "Sambo", "Muay Thai"], correct: 1 }
                ]
            },
            olimpiadas: {
                title: "Juegos Olímpicos",
                questions: [
                    { points: 100, q: "¿Cada cuántos años se celebran tradicionalmente los Juegos Olímpicos de Verano?", options: ["Cada 2 años", "Cada 3 años", "Cada 4 años", "Cada 5 años"], correct: 2 },
                    { points: 200, q: "¿Qué ciudad organizó los Juegos Olímpicos modernos por primera vez en el año 1896?", options: ["París", "Atenas", "Roma", "Londres"], correct: 1 },
                    { points: 300, q: "¿Qué atleta jamaicano es considerado el velocista más rápido de la historia y múltiple campeón olímpico en 100m y 200m?", options: ["Asafa Powell", "Yohan Blake", "Usain Bolt", "Carl Lewis"], correct: 2 },
                    { points: 400, q: "¿Qué significan los cinco anillos entrelazados de la bandera olímpica?", options: ["Los cinco océanos", "Los cinco continentes unidos", "Las cinco disciplinas principales", "Los cinco fundadores"], correct: 1 },
                    { points: 500, q: "¿Qué nadador estadounidense ostenta el récord histórico de mayor cantidad de medallas de oro olímpicas ganadas?", options: ["Mark Spitz", "Michael Phelps", "Ian Thorpe", "Caeleb Dressel"], correct: 1 }
                ]
            },
            otrosdeportes: {
                title: "Otros deportes",
                questions: [
                    { points: 100, q: "¿Qué superficie o terreno caracteriza al prestigioso torneo de tenis de Wimbledon?", options: ["Polvo de ladrillo (arcilla)", "Césped (hierba)", "Cancha dura sintética", "Moqueta"], correct: 1 },
                    { points: 200, q: "¿Cuántos jugadores integran cada equipo dentro de la cancha en un partido oficial de Vóleibol tradicional?", options: ["5 jugadores", "6 jugadores", "7 jugadores", "4 jugadores"], correct: 1 },
                    { points: 300, q: "¿Qué palo de golf se utiliza habitualmente para realizar golpes de máxima precisión en el green (hoyo)?", options: ["Driver", "Putter", "Hierro 7", "Wedge"], correct: 1 },
                    { points: 400, q: "¿Qué ciclista español ganó múltiples Tours de Francia y es considerado uno de los mejores escaladores de la historia?", options: ["Miguel Induráin", "Alberto Contador", "Alejandro Valverde", "Óscar Pereiro"], correct: 1 },
                    { points: 500, q: "¿Cuál es el nombre del deporte de equipo sobre hielo en el que se deslizan piedras de granito hacia un blanco circular?", options: ["Hockey sobre hielo", "Bobsleigh", "Curling", "Patinaje artístico"], correct: 2 }
                ]
            }
        }
    },
    argentina: {
        title: "🇦🇷 Argentina y el Mundo",
        subcategories: {
            arg: {
                title: "Argentina",
                questions: [
                    { points: 100, q: "¿Cuántas provincias componen la República Argentina (sin contar la Ciudad Autónoma de Buenos Aires)?", options: ["20 provincias", "22 provincias", "23 provincias", "24 provincias"], correct: 2 },
                    { points: 200, q: "¿Qué imponente formación natural de cascadas ubicada en la provincia de Misiones es una de las Siete Maravillas Naturales del Mundo?", options: ["Glaciar Perito Moreno", "Cataratas del Iguazú", "Quebrada de Humahuaca", "Talampaya"], correct: 1 },
                    { points: 300, q: "¿Quién diseñó la Bandera Nacional Argentina a orillas del río Paraná en 1812?", options: ["José de San Martín", "Manuel Belgrano", "Cornelio Saavedra", "Martín Miguel de Güemes"], correct: 1 },
                    { points: 400, q: "¿Cómo se llama el famoso glaciar ubicado en el Parque Nacional Los Glaciares, en la provincia de Santa Cruz?", options: ["Glaciar Upsala", "Glaciar Spegazzini", "Glaciar Perito Moreno", "Glaciar Viedma"], correct: 2 },
                    { points: 500, q: "¿Cuál es el pico más alto de la cordillera de los Andes y de todo el continente americano, situado en Mendoza?", options: ["Monte Aconcagua", "Volcán Ojos del Salado", "Monte Pissis", "Cerro Mercedario"], correct: 0 }
                ]
            },
            paises: {
                title: "Países del mundo",
                questions: [
                    { points: 100, q: "¿Cuál es la capital de Japón?", options: ["Kioto", "Osaka", "Tokio", "Hiroshima"], correct: 2 },
                    { points: 200, q: "¿Qué país tiene la mayor población absoluta del mundo actualmente?", options: ["India", "China", "Estados Unidos", "Indonesia"], correct: 0 },
                    { points: 300, q: "¿Cuál es el país más extenso del mundo en superficie territorial?", options: ["Canadá", "China", "Estados Unidos", "Rusia"], correct: 3 },
                    { points: 400, q: "¿Qué país europeo tiene forma de bota en el mapa geográfico?", options: ["España", "Grecia", "Italia", "Portugal"], correct: 2 },
                    { points: 500, q: "¿Cuál es la capital de Islandia?", options: ["Oslo", "Helsinki", "Reikiavik", "Estocolmo"], correct: 2 }
                ]
            },
            lugaresincreibles: {
                title: "Lugares increíbles",
                questions: [
                    { points: 100, q: "¿En qué país se encuentra el famoso monumento antiguo del Taj Mahal?", options: ["Egipto", "India", "Turquía", "Emiratos Árabes"], correct: 1 },
                    { points: 200, q: "¿Cómo se llama la antigua ciudad de piedra esculpida en la roca situada en Jordania?", options: ["Petra", "Palmira", "Babilonia", "Menfis"], correct: 0 },
                    { points: 300, q: "¿En qué país se ubica la imponente estructura arquitectónica de la Gran Muralla?", options: ["Japón", "China", "Mongolia", "Vietnam"], correct: 1 },
                    { points: 400, q: "¿Cuál es el nombre de la famosa torre inclinada situada en la región de Toscana, Italia?", options: ["Torre de Pisa", "Torre de Giotto", "Campanario de San Marcos", "Torre Asinelli"], correct: 0 },
                    { points: 500, q: "¿Qué maravilla arqueológica e histórica de los incas se alza sobre las montañas de los Andes peruanos?", options: ["Chan Chan", "Machu Picchu", "Ollantaytambo", "Sacsayhuamán"], correct: 1 }
                ]
            },
            comidas: {
                title: "Comidas del mundo",
                questions: [
                    { points: 100, q: "¿De qué país es originario el plato tradicional de sushi?", options: ["China", "Corea del Sur", "Japón", "Tailandia"], correct: 2 },
                    { points: 200, q: "¿Qué país europeo es considerado el lugar de nacimiento histórico de la pizza moderna?", options: ["Francia", "España", "Italia", "Grecia"], correct: 2 },
                    { points: 300, q: "¿Cuál es el ingrediente principal de la tradicional comida mexicana conocida como guacamole?", options: ["Tomate", "Palta (Aguacate)", "Frijol negro", "Chili habanero"], correct: 1 },
                    { points: 400, q: "¿Qué plato típico de la gastronomía peruana consiste en pescado crudo marinado en jugo de limón?", options: ["Causa limeña", "Anticuchos", "Cebiche (Ceviche)", "Lomo saltado"], correct: 2 },
                    { points: 500, q: "¿De qué país es típico el plato nacional llamado paella?", options: ["Portugal", "España", "México", "Argentina"], correct: 1 }
                ]
            },
            idiomascul: {
                title: "Idiomas y culturas",
                questions: [
                    { points: 100, q: "¿Qué idioma oficial se habla en Brasil?", options: ["Español", "Portugués", "Italiano", "Francés"], correct: 1 },
                    { points: 200, q: "¿Cómo se llama la tradicional festividad mexicana dedicada a honrar a los ancestros y difuntos (Día de...)?", options: ["Halloween", "Día de los Muertos", "Noche de Brujas", "Carnaval"], correct: 1 },
                    { points: 300, q: "¿Qué país celebra el festival de Año Nuevo Chino también conocido como la Fiesta de la...?", options: ["Primavera", "Luna Llena", "Cosecha", "Linternas"], correct: 0 },
                    { points: 400, q: "¿Cuál es la lengua oficial hablada en la nación insular de Madagascar?", options: ["Malgache", "Suajili", "Árabe", "Francés"], correct: 0 },
                    { points: 500, q: "¿Qué escritura milenaria basada en jeroglíficos y símbolos fue utilizada en el antiguo Egipto?", options: ["Cuneiforme", "Jeroglífica", "Fenicia", "Sanscripto"], correct: 1 }
                ]
            },
            sabiasque: {
                title: "¿Sabías que...?",
                questions: [
                    { points: 100, q: "¿Qué ave marina no voladora pasa la mayor parte de su vida en el hemisferio sur y zonas frías como la Patagonia?", options: ["El albatros", "El pingüino", "La gaviota austral", "El cormorán"], correct: 1 },
                    { points: 200, q: "¿Cuál es el único continente del planeta que no tiene población nativa permanente ni países propios?", options: ["Ártico", "Antártida", "Oceanía insular", "Groenlandia"], correct: 1 },
                    { points: 300, q: "¿Qué país cuenta con más lagos naturales en su territorio que el resto de los países del mundo juntos?", options: ["Canadá", "Finlandia", "Suecia", "Noruega"], correct: 0 },
                    { points: 400, q: "¿Qué felino americano manchado es el tercer felino más grande del mundo y habita en el norte argentino y selvas tropicales?", options: ["El puma", "El yaguareté (jaguar)", "El ocelote", "El leopardo"], correct: 1 },
                    { points: 500, q: "¿Cuál es el nombre del punto más profundo de todos los océanos de la Tierra, ubicado en el océano Pacífico?", options: ["Fosa de Puerto Rico", "Fosa de las Marianas", "Fosa de Java", "Fosa de las Kuriles"], correct: 1 }
                ]
            }
        }
    },
    tecnologia: {
        title: "💻 Tecnología",
        subcategories: {
            informatica: {
                title: "Informática",
                questions: [
                    { points: 100, q: "¿Qué significan las siglas de la memoria RAM en una computadora?", options: ["Read Access Memory", "Random Access Memory", "Rapid Active Module", "Real Application Memory"], correct: 1 },
                    { points: 200, q: "¿Cuál es considerado el componente principal de procesamiento y cerebro de una computadora?", options: ["La placa madre", "La fuente de poder", "El microprocesador (CPU)", "El disco duro"], correct: 2 },
                    { points: 300, q: "¿Qué tipo de almacenamiento interno utiliza chips de memoria flash sin partes mecánicas móviles?", options: ["Disco duro HDD", "Disco de estado sólido (SSD)", "Cinta magnética", "Disquete"], correct: 1 },
                    { points: 400, q: "¿Quién es considerado el padre de la computación moderna y diseñó la máquina analítica precursora?", options: ["Alan Turing", "Charles Babbage", "Bill Gates", "Steve Jobs"], correct: 1 },
                    { points: 500, q: "¿Qué sistema operativo de código abierto basado en Unix fue creado por Linus Torvalds en 1991?", options: ["Windows NT", "macOS", "Linux", "Unix BSD"], correct: 2 }
                ]
            },
            celulares: {
                title: "Celulares y Apps",
                questions: [
                    { points: 100, q: "¿Qué sistema operativo móvil desarrollado por Google utiliza la gran mayoría de los smartphones del mundo?", options: ["iOS", "Android", "Windows Phone", "HarmonyOS"], correct: 1 },
                    { points: 200, q: "¿Cómo se llama el sistema operativo móvil exclusivo creado por Apple para sus teléfonos iPhone?", options: ["macOS", "iOS", "iPadOS", "watchOS"], correct: 1 },
                    { points: 300, q: "¿Qué aplicación de mensajería instantánea adquirida por Meta es la más utilizada globalmente?", options: ["Telegram", "Signal", "WhatsApp", "Viber"], correct: 2 },
                    { points: 400, q: "¿Qué tecnología inalámbrica de corto alcance permite realizar pagos con el celular (NFC)?", options: ["Bluetooth", "NFC (Near Field Communication)", "Infrarrojos", "Wi-Fi Direct"], correct: 1 },
                    { points: 500, q: "¿En qué año se lanzó comercialmente el primer iPhone de Apple revolucionando la industria de la telefonía móvil?", options: ["2005", "2007", "2010", "2003"], correct: 1 }
                ]
            },
            internet: {
                title: "Internet",
                questions: [
                    { points: 100, q: "¿Qué significan las letras WWW al inicio de las direcciones de páginas web?", options: ["World Wide Web", "Web World Wide", "Wide World Web", "World Web Wireless"], correct: 0 },
                    { points: 200, q: "¿Qué red social de videos cortos fundada en China se convirtió en un fenómeno mundial masivo?", options: ["Instagram", "TikTok", "Snapchat", "Pinterest"], correct: 1 },
                    { points: 300, q: "¿Qué protocolo seguro de transferencia de hipertexto garantiza la encriptación de datos en un navegador?", options: ["HTTP", "HTTPS", "FTP", "SMTP"], correct: 1 },
                    { points: 400, q: "¿Cómo se denomina el motor de búsqueda en internet creado por Larry Page y Sergey Brin?", options: ["Yahoo!", "Bing", "Google", "DuckDuckGo"], correct: 2 },
                    { points: 500, q: "¿Qué red social enfocada en contactos profesionales y laborales fue fundada en 2002?", options: ["X (Twitter)", "LinkedIn", "Reddit", "Tumblr"], correct: 1 }
                ]
            },
            videojuegos: {
                title: "Videojuegos",
                questions: [
                    { points: 100, q: "¿Cómo se llama el famoso plomero fontanero bigotudo mascota oficial de Nintendo?", options: ["Sonic", "Mario", "Luigi", "Pac-Man"], correct: 1 },
                    { points: 200, q: "¿Qué popular videojuego de construcción y supervivencia en un mundo de bloques fue creado por Markus Persson (Notch)?", options: ["Terraria", "Roblox", "Minecraft", "Fortnite"], correct: 2 },
                    { points: 300, q: "¿Qué compañía japonesa creó la exitosa consola de videojuegos PlayStation?", options: ["Nintendo", "Sega", "Sony", "Microsoft"], correct: 2 },
                    { points: 400, q: "¿Cuál es el nombre del legendario erizo azul superveloz creado por la compañía Sega?", options: ["Knuckles", "Tails", "Sonic the Hedgehog", "Shadow"], correct: 2 },
                    { points: 500, q: "¿Qué aclamado videojuego de rol y mundo abierto desarrollado por FromSoftware fue dirigido por Hidetaka Miyazaki en colaboración con George R. R. Martin?", options: ["The Witcher 3", "Elden Ring", "Dark Souls", "Bloodborne"], correct: 1 }
                ]
            },
            ia: {
                title: "Inteligencia Artificial",
                questions: [
                    { points: 100, q: "¿Qué significan las siglas IA en el ámbito de la informática y la tecnología?", options: ["Informática Avanzada", "Inteligencia Artificial", "Internet Automático", "Interfaz Adaptativa"], correct: 1 },
                    { points: 200, q: "¿Qué empresa tecnológica desarrolló el famoso modelo conversacional de inteligencia artificial ChatGPT?", options: ["Google", "Microsoft", "OpenAI", "Meta"], correct: 2 },
                    { points: 300, q: "¿Cómo se denominan los modelos de lenguaje de gran escala basados en redes neuronales profundas que procesan texto?", options: ["LLM (Large Language Models)", "CPU", "Algoritmos genéticos", "Sistemas expertos"], correct: 0 },
                    { points: 400, q: "¿Qué famosa prueba propuesta en 1950 evalúa la capacidad de una máquina para exhibir un comportamiento inteligente indistinguible del humano?", options: ["Prueba de Turing", "Test de Ada", "Prueba de Von Neumann", "Test de Lovelace"], correct: 0 },
                    { points: 500, q: "¿Qué término describe el proceso mediante el cual una inteligencia artificial aprende a partir de grandes volúmenes de datos y ejemplos sin programación explícita?", options: ["Deep Learning (Aprendizaje profundo)", "Machine Learning (Aprendizaje automático)", "Minería de datos", "Procesamiento lógico"], correct: 1 }
                ]
            },
            tecnologiacotidiana: {
                title: "Tecnología cotidiana",
                questions: [
                    { points: 100, q: "¿Qué electrodoméstico de cocina calienta y descongela alimentos utilizando radiación electromagnética de microondas?", options: ["Horno eléctrico", "Horno microondas", "Tostadora", "Freidora de aire"], correct: 1 },
                    { points: 200, q: "¿Qué tecnología de visualización de pantallas utiliza diodos emisores de luz orgánica permitiendo negros puros?", options: ["LCD", "LED tradicional", "OLED", "Plasma"], correct: 2 },
                    { points: 300, q: "¿Cómo se llama el dispositivo de red inalámbrica que conecta los aparatos del hogar a internet mediante ondas de radio?", options: ["Modem", "Router Wi-Fi", "Switch", "Repetidor"], correct: 1 },
                    { points: 400, q: "¿Qué componente electrónico semiconductor permite controlar el flujo de corriente eléctrica y es la base de los microchips modernos?", options: ["La resistencia", "El transistor", "El condensador", "El diodo rectificador"], correct: 1 },
                    { points: 500, q: "¿Qué tecnología de posicionamiento global utiliza una constelación de satélites en órbita para determinar la ubicación exacta?", options: ["GPS", "Radar", "Sonar", "Triangulación celular"], correct: 0 }
                ]
            }
        }
    },
    ciencia_nat: {
        title: "🔬 Ciencia y Naturaleza",
        subcategories: {
            cuerpohumano: {
                title: "Cuerpo humano",
                questions: [
                    { points: 100, q: "¿Cuántos huesos forman aproximadamente el esqueleto de un ser humano adulto?", options: ["150 huesos", "206 huesos", "250 huesos", "300 huesos"], correct: 1 },
                    { points: 200, q: "¿Cuál es el músculo más fuerte del cuerpo humano en relación con su tamaño?", options: ["El bíceps", "El masetero (músculo de la mandíbula)", "El corazón", "El cuádriceps"], correct: 1 },
                    { points: 300, q: "¿Qué tipo de células sanguíneas son las encargadas de transportar oxígeno desde los pulmones a todo el cuerpo?", options: ["Glóbulos blancos (leucocitos)", "Plaquetas", "Glóbulos rojos (eritrocitos)", "Linfocitos T"], correct: 2 },
                    { points: 400, q: "¿Cuál es la principal función de los riñones en el organismo humano?", options: ["Bombear sangre", "Filtrar los desechos de la sangre y producir orina", "Producir bilis", "Digerir grasas"], correct: 1 },
                    { points: 500, q: "¿Qué parte del sistema nervioso central controla el equilibrio, la coordinación y la postura corporal?", options: ["El cerebro anterior", "El cerebelo", "El bulbo raquídeo", "El hipotálamo"], correct: 1 }
                ]
            },
            astronomia: {
                title: "Astronomía",
                questions: [
                    { points: 100, q: "¿Cuál es el planeta más cercano al Sol en nuestro sistema solar?", options: ["Venus", "Mercurio", "Marte", "Tierra"], correct: 1 },
                    { points: 200, q: "¿Cómo se llama la galaxia espiral más cercana a nuestra Vía Láctea?", options: ["Galaxia del Sombrero", "Galaxia de Andrómeda", "Gran Nube de Magallanes", "Galaxia del Triángulo"], correct: 1 },
                    { points: 300, q: "¿Cuál es el planeta más grande de todo el sistema solar?", options: ["Saturno", "Júpiter", "Neptuno", "Urano"], correct: 1 },
                    { points: 400, q: "¿Qué nombre recibe el punto límite alrededor de un agujero negro del cual ni siquiera la luz puede escapar?", options: ["Singularidad", "Disco de acreción", "Horizonte de sucesos", "Límite estelar"], correct: 2 },
                    { points: 500, q: "¿Cómo se denominan las estrellas masivas que al final de su vida explotan violentamente en el espacio?", options: ["Enana blanca", "Supernova", "Púlsar", "Gigante roja"], correct: 1 }
                ]
            },
            animales: {
                title: "Animales",
                questions: [
                    { points: 100, q: "¿Cuál es el animal terrestre más alto del mundo actual gracias a su largo cuello?", options: ["El elefante", "La jirafa", "El rinoceronte", "El camello"], correct: 1 },
                    { points: 200, q: "¿Qué mamífero marino es considerado el animal más grande que ha existido en la Tierra?", options: ["El tiburón blanco", "La ballena azul", "El cachalote", "La orca"], correct: 1 },
                    { points: 300, q: "¿Cuál es el único mamífero del mundo capaz de volar de forma activa?", options: ["El lemur volador", "La ardilla", "El murciélago", "El planeador del azúcar"], correct: 2 },
                    { points: 400, q: "¿De qué se alimenta principalmente un animal herbívoro estricto como el koala?", options: ["De insectos", "De hojas de eucalipto", "De bambú tierno", "De raíces y tubérculos"], correct: 1 },
                    { points: 500, q: "¿Qué familia de animales marinos incluye a los pulpos, calamares y sepias, caracterizados por su inteligencia?", options: ["Crustáceos", "Cefalópodos", "Gasterópodos", "Cnidarios"], correct: 1 }
                ]
            },
            naturaleza: {
                title: "Naturaleza",
                questions: [
                    { points: 100, q: "¿Qué proceso vital realizan las plantas verdes utilizando la luz solar para producir su propio alimento?", options: ["Respiración celular", "Fotosíntesis", "Transpiración", "Polinización"], correct: 1 },
                    { points: 200, q: "¿Cómo se llaman las plantas sin flores ni semillas verdaderas que se reproducen por esporas, como los helechos?", options: ["Gimnospermas", "Pteridofitas", "Angiospermas", "Briófitas"], correct: 1 },
                    { points: 300, q: "¿Qué nombre recibe el bioma terrestre caracterizado por bosques fríos de coníferas en el hemisferio norte?", options: ["La tundra", "La taiga (bosque boreal)", "La sabana", "La estepa"], correct: 1 },
                    { points: 400, q: "¿Qué tipo de relación simbiótica existe entre los hongos y las algas que forman los líquenes?", options: ["Parasitismo", "Mutualismo (beneficio mutuo)", "Comensalismo", "Competencia"], correct: 1 },
                    { points: 500, q: "¿Cuál es el árbol más alto del mundo actual, perteneciente a la familia de las secuoyas en California?", options: ["El eucalipto gigante", "La secuoya roja (Sequoia sempervirens)", "El baobab", "El abeto Douglas"], correct: 1 }
                ]
            },
            quimicafisica: {
                title: "Química y Física",
                questions: [
                    { points: 100, q: "¿Cuál es la fórmula química del agua pura?", options: ["CO2", "H2O", "NaCl", "O2"], correct: 1 },
                    { points: 200, q: "¿Qué ley de la física establece que la energía no se crea ni se destruye, solo se transforma?", options: ["Primera ley de Newton", "Ley de la gravedad", "Principio de conservación de la energía", "Ley de Ohm"], correct: 2 },
                    { points: 300, q: "¿Qué elemento de la tabla periódica tiene el número atómico 1 y es el más abundante del universo?", options: ["Helio", "Oxígeno", "Hidrógeno", "Carbono"], correct: 2 },
                    { points: 400, q: "¿Cuál es la unidad derivada de medida de la fuerza en el Sistema Internacional (SI)?", options: ["El julio (J)", "El vatio (W)", "El newton (N)", "El pascal (Pa)"], correct: 2 },
                    { points: 500, q: "¿Cómo se denomina el cambio de estado de la materia que pasa directamente de sólido a gas sin pasar por líquido?", options: ["Fusión", "Sublimación", "Evaporación", "Condensación"], correct: 1 }
                ]
            },
            tierraclima: {
                title: "Tierra y clima",
                questions: [
                    { points: 100, q: "¿Qué escala sismológica se utiliza habitualmente para medir la magnitud y energía liberada por un terremoto?", options: ["Escala de Mercalli", "Escala de Richter", "Escala Saffir-Simpson", "Escala Beaufort"], correct: 1 },
                    { points: 200, q: "¿Cómo se llaman las aberturas en la corteza terrestre por donde asciende magma, cenizas y gases volcánicos?", options: ["Fallas tectónicas", "Cráteres o volcanes", "Geiseres", "Abismos marinos"], correct: 1 },
                    { points: 300, q: "¿Qué fenómeno meteorológico extremo y rotativo se forma sobre los océanos tropicales generando vientos huracanados?", options: ["Un tornado", "Un huracán o ciclón tropical", "Una tormenta eléctrica", "Un tifón continental"], correct: 1 },
                    { points: 400, q: "¿Cuál es el principal gas de efecto invernadero responsable del calentamiento global antropogénico?", options: ["El metano (CH4)", "El dióxido de carbono (CO2)", "El vapor de agua", "El óxido nitroso"], correct: 1 },
                    { points: 500, q: "¿Qué corriente oceánica profunda y global de circulación termohalina regula el clima del planeta?", options: ["Corriente del Golfo", "Cinta transportadora oceánica global", "Corriente de Humboldt", "Corriente de Kuroshio"], correct: 1 }
                ]
            }
        }
    },
    random: {
        title: "🎲 Random",
        subcategories: {
            inutiles: {
                title: "Datos inútiles",
                questions: [
                    { points: 100, q: "¿De qué color es la piel de un oso polar debajo de su espeso pelaje blanco?", options: ["Blanca", "Rosa", "Negra", "Gris"], correct: 2 },
                    { points: 200, q: "¿Qué parte del cuerpo humano no deja de crecer durante toda la vida junto con las orejas?", options: ["Los ojos", "La nariz", "El cabello", "Las uñas"], correct: 1 },
                    { points: 300, q: "¿Cuántos ojos tiene aproximadamente una abeja común en su cabeza?", options: ["Dos ojos", "Cinco ojos (dos compuestos y tres simples)", "Ocho ojos", "Diez ojos"], correct: 1 },
                    { points: 400, q: "¿Qué mamífero famoso por su lentitud extrema pasa casi toda su vida colgado de los árboles en América?", options: ["El oso hormiguero", "El perezoso (tres dedos)", "El koala", "El lémur"], correct: 1 },
                    { points: 500, q: "¿Qué alimento natural y perecedero del mundo nunca se pudre ni caduca si se conserva bien sellado?", options: ["El aceite de oliva", "La miel de abejas", "El vino tinto", "La sal marina"], correct: 1 }
                ]
            },
            acertijos: {
                title: "Acertijos",
                questions: [
                    { points: 100, q: "¿Qué cosa es que cuanto más le quitas, más grande se vuelve?", options: ["Un pozo o un agujero", "Una montaña", "Una esponja", "Una deuda"], correct: 0 },
                    { points: 200, q: "Tiene dientes y no muerde, ¿qué objeto es?", options: ["Un tiburón", "Un peine", "Un cierre de ropa", "Un tenedor"], correct: 1 },
                    { points: 300, q: "Blanco por dentro, verde por fuera. Si quieres que te lo diga, espera. ¿Qué fruta es?", options: ["Una manzana verde", "Una pera", "Un melón", "Una banana"], correct: 1 },
                    { points: 400, q: "Va al agua y no se moja, camina por la tierra y no se mancha, ¿qué es?", options: ["El viento", "La sombra", "Un reflejo", "El sonido"], correct: 1 },
                    { points: 500, q: "Si me nombras, desaparezco. ¿Quién soy?", options: ["El silencio", "El olvido", "Una burbuja", "La oscuridad"], correct: 0 }
                ]
            },
            quesoy: {
                title: "¿Qué soy?",
                questions: [
                    { points: 100, q: "Tengo hojas pero no soy un árbol, tengo lomo pero no soy un animal, y te hablo sin voz. ¿Qué soy?", options: ["Un cuaderno", "Un libro", "Una revista", "Un diccionario"], correct: 1 },
                    { points: 200, q: "Vuelo sin alas, aúllo sin boca y soplo sin pulmones. ¿Qué fenómeno natural soy?", options: ["Una nube", "El viento", "Una tormenta", "La niebla"], correct: 1 },
                    { points: 300, q: "Tengo agujas pero no coso, tengo números pero no sé leer, y doy vueltas todo el día. ¿Qué soy?", options: ["Un reloj", "Una brújula", "Una rueda de la fortuna", "Un sastre"], correct: 0 },
                    { points: 400, q: "Me puedes romper sin tocarme ni siquiera con las manos. ¿Qué soy?", options: ["Un vidrio", "Una promesa", "Un corazón", "Un espejo"], correct: 1 },
                    { points: 500, q: "Tengo cabeza y cuerpo de madera, pero no tengo extremidades ni vida propia. ¿Qué soy?", options: ["Un clavo", "Un fósforo (cerilla)", "Un lápiz", "Una estaca"], correct: 1 }
                ]
            },
            numerosrecords: {
                title: "Números y récords",
                questions: [
                    { points: 100, q: "¿Cuál es el número romano representado por las letras 'M'?", options: ["Cien", "Quinientos", "Mil", "Diez mil"], correct: 2 },
                    { points: 200, q: "¿Cuántos grados suman los ángulos internos de cualquier triángulo plano?", options: ["90 grados", "180 grados", "360 grados", "270 grados"], correct: 1 },
                    { points: 300, q: "¿Qué número representa el valor de la constante matemática Pi ($\\pi$) redondeado a dos decimales?", options: ["3,14", "2,71", "1,41", "1,73"], correct: 0 },
                    { points: 400, q: "¿Cuántos ceros tiene un número billón en la escala numérica corta utilizada habitualmente en informática?", options: ["Seis ceros", "Nueve ceros", "Doce ceros", "Quince ceros"], correct: 1 },
                    { points: 500, q: "¿Cuál es el número primo más pequeño y el único par que existe?", options: ["El número 1", "El número 2", "El número 3", "El número 5"], correct: 1 }
                ]
            },
            absurdas: {
                title: "Cosas absurdas",
                questions: [
                    { points: 100, q: "¿Qué animal es capaz de dormir de pie sin caerse gracias a un sistema de bloqueo en sus patas?", options: ["El cerdo", "El caballo", "El oso", "El perro"], correct: 1 },
                    { points: 200, q: "¿Cuál es el animal que tiene la lengua más larga en proporción a su tamaño corporal (hasta medio metro)?", options: ["El oso hormiguero", "El camaleón", "La rana", "El elefante"], correct: 1 },
                    { points: 300, q: "¿Qué ave no voladora australiana se traga piedras a propósito para ayudar a triturar los alimentos en su molleja?", options: ["El emú", "El casuario", "El avestruz", "El pingüino emperador"], correct: 0 },
                    { points: 400, q: "¿Qué animal marino cuenta con cinco ojos y cerebro distribuido, pero es famoso por no tener cerebro central ni corazón?", options: ["La medusa (aguamala)", "La estrella de mar", "El erizo de mar", "La esponja de mar"], correct: 1 },
                    { points: 500, q: "¿Qué mamífero acuático australiano pone huevos en lugar de dar a luz crías vivas y tiene pico de pato?", options: ["El erizo", "El ornitorrinco", "El equidna", "La nutria"], correct: 1 }
                ]
            },
            sorpresa: {
                title: "Pregunta sorpresa",
                questions: [
                    { points: 100, q: "¿Cuál es el planeta más caliente de nuestro sistema solar debido a un intenso efecto invernadero?", options: ["Mercurio", "Venus", "Marte", "Júpiter"], correct: 1 },
                    { points: 200, q: "¿En qué país se encuentra la famosa Torre Eiffel?", options: ["Italia", "Reino Unido", "Francia", "Alemania"], correct: 2 },
                    { points: 300, q: "¿Quién pintó el famoso cuadro de 'La noche estrellada' en 1889?", options: ["Claude Monet", "Vincent van Gogh", "Pablo Picasso", "Salvador Dalí"], correct: 1 },
                    { points: 400, q: "¿Qué imperio antiguo construyó la monumental calzada y red de caminos llamada Cápac Ñan en los Andes?", options: ["Imperio Romano", "Imperio Inca", "Imperio Azteca", "Imperio Persa"], correct: 1 },
                    { points: 500, q: "¿Cuál es el nombre del físico teórico que propuso las leyes del movimiento y la gravitación universal en su obra 'Principia Mathematica'?", options: ["Galileo Galilei", "Isaac Newton", "Johannes Kepler", "Albert Einstein"], correct: 1 }
                ]
            }
        }
    }
};

// Navegación de Pantallas
function cambiarPantalla(idPantalla) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(idPantalla).classList.add('active');
}

// Selección de Rol inicial
function seleccionarRol(rol) {
    gameState.role = rol;
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active-role'));
    if(rol === 'jugador') {
        document.getElementById('btn-role-player').classList.add('active-role');
    } else {
        document.getElementById('btn-role-spectator').classList.add('active-role');
    }
}

// Ir a la sección de Sala
function irASala() {
    const nombreInput = document.getElementById('input-name').value.trim();
    if(!nombreInput) {
        alert("Por favor, ingresá tu nombre o alias.");
        return;
    }
    gameState.username = nombreInput;
    document.getElementById('lbl-username').textContent = gameState.username;
    document.getElementById('lbl-role').textContent = gameState.role === 'jugador' ? 'Jugador' : 'Espectador';
    
    cambiarPantalla('screen-room');
}

// Mostrar opciones de Crear o Unirse
function mostrarOpcionSala(accion) {
    const container = document.getElementById('room-action-container');
    container.style.display = 'block';
    const label = document.getElementById('room-input-label');
    const btn = document.getElementById('btn-room-action');
    
    if(accion === 'crear') {
        label.textContent = "Código para la Nueva Sala";
        document.getElementById('input-room').value = "TRIVIA-" + Math.floor(1000 + Math.random() * 9000);
        btn.textContent = "Crear Sala";
        gameState.isHost = true;
    } else {
        label.textContent = "Código de Sala Existente";
        document.getElementById('input-room').value = "";
        btn.textContent = "Unirse";
        gameState.isHost = false;
    }
}

// Procesar ingreso a Sala
function procesarIngresoSala() {
    const codigoSala = document.getElementById('input-room').value.trim().toUpperCase();
    if(!codigoSala) {
        alert("Ingresá un código de sala válido.");
        return;
    }
    gameState.roomCode = codigoSala;
    document.getElementById('lbl-room').textContent = gameState.roomCode;
    document.getElementById('header-user-info').style.display = 'flex';

    // Cargar las 9 categorías principales
    cargarCategoriasPrincipales();
    cambiarPantalla('screen-categories');
}

// Renderizar Categorías Principales (Control exclusivo de Host)
function cargarCategoriasPrincipales() {
    const container = document.getElementById('main-categories-container');
    container.innerHTML = '';

    let avisoHtml = '';
    if (!gameState.isHost) {
        avisoHtml = `<div style="grid-column: 1 / -1; background: rgba(56, 189, 248, 0.1); border: 1px solid var(--accent); padding: 12px; border-radius: 8px; text-align: center; margin-bottom: 10px; color: var(--accent); font-size: 0.9rem;">
            🔒 Modo invitado: Solo el anfitrión (${gameState.roomCode}) tiene el control para elegir la categoría de la partida.
        </div>`;
    }

    container.innerHTML += avisoHtml;

    Object.keys(dbTrivia).forEach(key => {
        const cat = dbTrivia[key];
        const card = document.createElement('div');
        card.className = 'category-card';
        card.innerHTML = `
            <h3>${cat.title}</h3>
            <p>6 subcategorías temáticas (100 a 500 pts)</p>
        `;
        
        if(gameState.isHost) {
            card.onclick = () => abrirSubcategorias(key);
            card.style.cursor = 'pointer';
        } else {
            card.style.opacity = '0.6';
            card.style.cursor = 'not-allowed';
            card.title = "Esperando la selección del anfitrión...";
        }
        
        container.appendChild(card);
    });
}

// Abrir las 6 subcategorías de la categoría elegida
function abrirSubcategorias(categoryKey) {
    if(!gameState.isHost) return; // Seguridad de rol
    
    gameState.activeCategory = categoryKey;
    const catData = dbTrivia[categoryKey];
    
    document.getElementById('active-category-title').textContent = catData.title;
    const subContainer = document.getElementById('subcategories-container');
    subContainer.innerHTML = '';

    Object.keys(catData.subcategories).forEach(subKey => {
        const subObj = catData.subcategories[subKey];
        const subBlock = document.createElement('div');
        subBlock.style.background = 'var(--bg-main)';
        subBlock.style.border = '1px solid var(--border-color)';
        subBlock.style.borderRadius = '10px';
        subBlock.style.padding = '15px';

        let htmlHeader = `<h3 style="color: var(--accent); font-size: 1.05rem; margin-bottom: 12px;">${subObj.title}</h3>`;
        let htmlTiles = `<div class="board-grid" style="margin-top: 0;">`;

        subObj.questions.forEach((qObj, qIndex) => {
            htmlTiles += `<div class="board-tile" onclick="seleccionarPregunta('${subKey}', ${qIndex})"><span>${qObj.points}</span></div>`;
        });

        htmlTiles += `</div>`;
        subBlock.innerHTML = htmlHeader + htmlTiles;
        subContainer.appendChild(subBlock);
    });

    cambiarPantalla('screen-subcategories');
}

function volverACategorias() {
    cambiarPantalla('screen-categories');
}

// Seleccionar Pregunta Activa
function seleccionarPregunta(subKey, qIndex) {
    const subObj = dbTrivia[gameState.activeCategory].subcategories[subKey];
    const qObj = subObj.questions[qIndex];
    gameState.activeQuestion = qObj;

    document.getElementById('q-category').textContent = `${dbTrivia[gameState.activeCategory].title} › ${subObj.title}`;
    document.getElementById('q-points').textContent = `Valor: ${qObj.points} pts`;
    document.getElementById('q-text').textContent = qObj.q;

    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';

    qObj.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;
        btn.onclick = () => verificarRespuesta(idx, qObj.correct, qObj.points);
        optionsContainer.appendChild(btn);
    });

    cambiarPantalla('screen-question');
}

// Verificar Respuesta
function verificarRespuesta(selectedIndex, correctIndex, points) {
    const optionButtons = document.querySelectorAll('.option-btn');
    
    optionButtons.forEach((btn, idx) => {
        btn.style.pointerEvents = 'none'; // Desactivar múltiples clics
        if(idx === correctIndex) {
            btn.style.background = 'var(--success)';
            btn.style.borderColor = '#16a34a';
            btn.style.color = '#fff';
        } else if(idx === selectedIndex) {
            btn.style.background = 'var(--danger)';
            btn.style.borderColor = '#dc2626';
            btn.style.color = '#fff';
        }
    });

    // Sumar puntos solo si es jugador y acertó
    if(gameState.role === 'jugador' && selectedIndex === correctIndex) {
        gameState.score += points;
        document.getElementById('current-score').textContent = gameState.score;
    }

    // Regresar al tablero o categorías tras 2.5 segundos
    setTimeout(() => {
        if(gameState.isHost) {
            cambiarPantalla('screen-subcategories');
        } else {
            cambiarPantalla('screen-categories');
        }
    }, 2500);
}

function reiniciarJuegoCompleto() {
    gameState.score = 0;
    document.getElementById('current-score').textContent = '0';
    cambiarPantalla('screen-categories');
}

// --- Juego multijugador en tiempo real ---
// El servidor es la fuente de verdad: turnos, puntos, preguntas usadas y tiempo.
const socket = io();
let roomState = null;
let roomAction = 'unirse';
let timerInterval = null;

function notifyError(message) { alert(message); }
function escapeHtml(text) {
    const node = document.createElement('span');
    node.textContent = text;
    return node.innerHTML;
}

function seleccionarRol(rol) {
    gameState.role = rol;
    document.getElementById('btn-role-player').classList.toggle('active-role', rol === 'jugador');
    document.getElementById('btn-role-spectator').classList.toggle('active-role', rol === 'espectador');
}

function irASala() {
    const name = document.getElementById('input-name').value.trim();
    if (!name) return notifyError('Por favor, ingresá tu nombre o alias.');
    gameState.username = name;
    document.getElementById('lbl-username').textContent = name;
    document.getElementById('lbl-role').textContent = gameState.role === 'jugador' ? 'Jugador' : 'Espectador';
    document.getElementById('create-room-option').style.display = gameState.role === 'espectador' ? 'none' : '';
    mostrarOpcionSala('unirse');
    cambiarPantalla('screen-room');
}

function mostrarOpcionSala(action) {
    if (action === 'crear' && gameState.role === 'espectador') return;
    roomAction = action;
    const input = document.getElementById('input-room');
    document.getElementById('room-action-container').style.display = 'block';
    document.getElementById('room-input-label').textContent = action === 'crear' ? 'Código para la nueva sala' : 'Código de sala existente';
    document.getElementById('btn-room-action').textContent = action === 'crear' ? 'Crear sala' : 'Unirme';
    input.readOnly = false;
    input.value = action === 'crear' ? `TRIVIA-${Math.floor(1000 + Math.random() * 9000)}` : '';
}

function procesarIngresoSala() {
    const code = document.getElementById('input-room').value.trim().toUpperCase();
    if (!code) return notifyError('Ingresá un código de sala válido.');
    const event = roomAction === 'crear' ? 'room:create' : 'room:join';
    socket.emit(event, { code, name: gameState.username, role: gameState.role }, response => {
        if (response.error) return notifyError(response.error);
        gameState.roomCode = code; gameState.isHost = response.isHost; roomState = response.state;
        document.getElementById('lbl-room').textContent = code;
        document.getElementById('header-user-info').style.display = 'flex';
        renderFromState();
    });
}

socket.on('room:state', state => { roomState = state; renderFromState(); });
socket.on('question:opened', payload => { renderQuestion(payload); });
socket.on('question:closed', () => { /* el estado actualizado habilita el próximo turno */ });
socket.on('answer:result', result => showAnswerResult(result));

function renderFromState() {
    if (!roomState) return;
    const me = roomState.players.find(player => player.id === socket.id);
    document.getElementById('current-score').textContent = me ? me.score : '—';
    if (roomState.categoryKey) renderBoard(); else renderCategories();
    if (roomState.activeQuestion && document.getElementById('screen-question').classList.contains('active')) {
        startTimer(roomState.activeQuestion.endsAt);
    }
}

function renderCategories() {
    const container = document.getElementById('main-categories-container');
    container.innerHTML = '';
    const note = document.createElement('p');
    note.className = 'room-note';
    note.textContent = gameState.isHost ? 'Elegí una categoría para iniciar la partida. Esa elección quedará fija.' : 'Esperando que el anfitrión elija la categoría de la partida.';
    container.appendChild(note);
    Object.entries(dbTrivia).forEach(([key, category]) => {
        const card = document.createElement('button'); card.className = 'category-card';
        card.innerHTML = `<h3>${category.title}</h3><p>6 subcategorías · 100 a 500 puntos</p>`;
        card.disabled = !gameState.isHost;
        card.onclick = () => socket.emit('category:select', { categoryKey: key }, response => response?.error && notifyError(response.error));
        container.appendChild(card);
    });
    cambiarPantalla('screen-categories');
}

function renderBoard() {
    const category = dbTrivia[roomState.categoryKey];
    document.getElementById('active-category-title').textContent = category.title;
    const turnPlayer = roomState.players.find(player => player.id === roomState.turnPlayerId);
    document.getElementById('turn-label').textContent = turnPlayer ? `${turnPlayer.name}${turnPlayer.id === socket.id ? ' (vos)' : ''}` : 'Sin jugadores';
    document.getElementById('spectators-label').textContent = roomState.spectators.length ? roomState.spectators.join(', ') : 'Ninguno';
    document.getElementById('players-scoreboard').innerHTML = roomState.players.map(player => `<span class="player-score ${player.id === roomState.turnPlayerId ? 'is-turn' : ''}">${escapeHtml(player.name)}: ${player.score}</span>`).join('');
    const container = document.getElementById('subcategories-container');
    const subEntries = Object.entries(category.subcategories);
    const points = [...new Set(subEntries.flatMap(([, sub]) => sub.questions.map(question => question.points)))].sort((a, b) => a - b);
    const table = document.createElement('div'); table.className = 'jeopardy-board';
    table.innerHTML = `<div class="corner">Puntos</div>${subEntries.map(([, sub]) => `<div class="board-heading">${sub.title}</div>`).join('')}`;
    points.forEach(point => {
        table.insertAdjacentHTML('beforeend', `<div class="point-label">${point}</div>`);
        subEntries.forEach(([subKey, sub]) => {
            const index = sub.questions.findIndex(question => question.points === point);
            const key = `${roomState.categoryKey}:${subKey}:${index}`;
            const used = roomState.usedQuestions.includes(key);
            const canChoose = socket.id === roomState.turnPlayerId && !used && !roomState.activeQuestion;
            const cell = document.createElement('button'); cell.className = `board-tile ${used ? 'used' : ''}`;
            cell.textContent = used ? '✓' : point; cell.disabled = !canChoose;
            if (!canChoose && !used) cell.title = gameState.role === 'espectador' ? 'Los espectadores solo observan.' : 'Esperá tu turno.';
            cell.onclick = () => socket.emit('question:select', { subKey, qIndex: index }, response => response?.error && notifyError(response.error));
            table.appendChild(cell);
        });
    });
    container.replaceChildren(table);
    if (!roomState.activeQuestion) cambiarPantalla('screen-subcategories');
}

function renderQuestion(payload) {
    const category = dbTrivia[payload.categoryKey]; const sub = category.subcategories[payload.subKey];
    document.getElementById('q-category').textContent = `${category.title} › ${sub.title}`;
    document.getElementById('q-points').textContent = `Valor: ${payload.question.points} pts`;
    document.getElementById('q-text').textContent = payload.question.q;
    const isTurn = socket.id === roomState?.turnPlayerId;
    const turnPlayer = roomState?.players.find(player => player.id === roomState.turnPlayerId);
    document.getElementById('question-turn-message').textContent = isTurn ? 'Es tu turno: elegí una respuesta antes de que termine el minuto.' : `Turno de ${turnPlayer?.name || 'un jugador'}: seguí la partida en vivo.`;
    const options = document.getElementById('options-container'); options.innerHTML = '';
    payload.question.options.forEach((option, index) => {
        const button = document.createElement('button'); button.className = 'option-btn'; button.textContent = option; button.disabled = !isTurn;
        button.onclick = () => socket.emit('answer:submit', { answer: index }, response => response?.error && notifyError(response.error));
        options.appendChild(button);
    });
    startTimer(payload.endsAt); cambiarPantalla('screen-question');
}

function startTimer(endsAt) {
    clearInterval(timerInterval);
    const update = () => {
        const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        document.getElementById('timer').textContent = `Tiempo: ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        if (!seconds) clearInterval(timerInterval);
    };
    update(); timerInterval = setInterval(update, 250);
}

function showAnswerResult(result) {
    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach((button, index) => { button.disabled = true; if (index === result.correctIndex) button.classList.add('correct'); else if (index === result.answer) button.classList.add('incorrect'); });
    document.getElementById('question-turn-message').textContent = `${result.playerName}: ${result.correct ? '¡respuesta correcta!' : 'respuesta incorrecta.'}`;
    clearInterval(timerInterval);
    setTimeout(() => { if (roomState?.categoryKey) renderBoard(); }, 1700);
}
