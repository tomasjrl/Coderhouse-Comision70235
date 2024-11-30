import express from 'express';
import handlebars from 'express-handlebars';
import http from "http";
import { Server } from 'socket.io';
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
import { productRepository } from './repositories/index.js';
import helpers from './utils/helpersHandlebars.js';

const app = express();
const PORT = config.server.port;
const server = http.createServer(app);
const io = new Server(server);
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
app.use(express.urlencoded({extended: true})); 
app.use(cookieParser());

// Configuración de sesión
app.use(session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: config.database.mongoUri,
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

// Rutas
app.use('/', viewsRouter);
app.use('/api/products', productRouter());
app.use('/api/carts', cartRouter());
app.use('/api/sessions', sessionsRouter);
app.use('/api/password', passwordRouter);

// Manejo de errores
app.use(errorHandler);

async function connectToDatabase() {
    try {
        await mongoose.connect(config.database.mongoUri);
        console.log("Conectado con MongoDB");
    } catch (error) {
        console.error("Error al conectar con MongoDB:", error);
        process.exit(1);
    }
}

connectToDatabase()
    .then(() => {
        io.on("connection", async (socket) => {
            console.log("Nuevo cliente conectado");

            try {
                const products = await productRepository.getAll();
                socket.emit("productos", products);
            } catch (error) {
                console.error("Error al obtener productos:", error);
            }

            socket.on("eliminarProducto", async (id) => {
                try {
                    await productRepository.delete(id);
                    const updatedProducts = await productRepository.getAll();
                    io.emit("productos", updatedProducts);
                } catch (error) {
                    console.error("Error al eliminar producto:", error);
                }
            });

            socket.on("agregarProducto", async (producto) => {
                try {
                    await productRepository.create(producto);
                    const updatedProducts = await productRepository.getAll();
                    io.emit("productos", updatedProducts);
                } catch (error) {
                    console.error("Error al agregar producto:", error);
                }
            });
        });

        server.listen(PORT, () => {
            console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
        });
    })
    .catch(error => {
        console.error("Error al iniciar el servidor:", error);
        process.exit(1);
    });
