import express from 'express';
import handlebars from 'express-handlebars';
import http from "http";
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import mongoose from 'mongoose';
import { fileURLToPath } from "url";
import { dirname } from "path";
import { config } from './config/config.js';
import initializePassport from './config/passport.config.js';
import { errorHandler } from './middlewares/errorHandler.js';
import viewsRouter from './routes/viewsRouter.js';
import productRouter from './routes/productRouter.js';
import cartRouter from './routes/cartRouter.js';
import sessionsRouter from './routes/sessions.router.js';
import passwordRouter from './routes/passwordRouter.js';
import { initializeSocket } from './config/socket.js';
import helpers from './utils/helpersHandlebars.js';

const app = express();
const PORT = config.server.port;
const server = http.createServer(app);
initializeSocket(server);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuración de Handlebars y sus helpers
const hbs = handlebars.create({
    helpers: {
        ...helpers,
        isSelected: function (value, sort) {
            return value === sort ? "selected" : "";
        },
        eq: function (a, b) {
            return a === b;
        }
    }
});

app.engine('handlebars', hbs.engine);
app.set('views', __dirname + '/views');
app.set('view engine', 'handlebars');

app.use(express.static(__dirname + "/public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Conexión a MongoDB
const connectToDatabase = async () => {
    try {
        await mongoose.connect(config.database.mongoUri);
        console.log("Conectado con MongoDB");
        
        // Una vez conectado a MongoDB, configurar la sesión
        app.use(session({
            secret: config.session.secret,
            resave: false,
            saveUninitialized: false,
            store: MongoStore.create({
                client: mongoose.connection.getClient(), // Usar la conexión existente
                ttl: 60 * 60 * 24 // 1 día
            }),
            cookie: {
                maxAge: 1000 * 60 * 60 * 24, // 1 día
                httpOnly: true,
                secure: config.server.nodeEnv === 'production'
            }
        }));

        // Configuración de Passport
        initializePassport();
        app.use(passport.initialize());
        app.use(passport.session());

        // Middleware para pasar el usuario a las vistas
        app.use((req, res, next) => {
            res.locals.user = req.session.user;
            res.locals.isAuthenticated = req.isAuthenticated();
            next();
        });

        // Rutas - API primero
        app.use('/api/products', productRouter());
        app.use('/api/carts', cartRouter());
        app.use('/api/sessions', sessionsRouter);
        app.use('/api/password', passwordRouter);

        // Rutas de vistas después
        app.use('/', viewsRouter);

        // Manejo de errores
        app.use(errorHandler);

        // Iniciar el servidor
        server.listen(PORT, () => {
            console.log(`Servidor corriendo en puerto ${PORT}`);
        });

    } catch (error) {
        console.error("Error al conectar con MongoDB:", error);
        process.exit(1);
    }
};

// Iniciar la aplicación
connectToDatabase();
