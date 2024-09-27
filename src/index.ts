import express, { Express, Request, Response } from "express";
import "dotenv/config";
import session from 'express-session'
import cookieParser from "cookie-parser";
import cors from 'cors'


import { router as EmailPasswordAuthRoutes } from "./routes/authRoutes/emailPasswordAuthRoutes.js";
import { router as GoogleAuthRoutes } from "./routes/authRoutes/googleAuthRoutes.js"


const app: Express = express();
const port = process.env.PORT ?? 3000;

app.use(express.json())
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
	secret: 'noitacitnehtuaaicul',
	resave: false,
	saveUninitialized: false,
	cookie: {
		secure: process.env.NODE_ENV === 'production',
	}
}));

//Enable cors for http://localhost:5173 
app.use(cors({
	origin: process.env.CLIENT_URL,
	credentials: true,
}));

app.get("/", (req: Request, res: Response) => {
	res.send("Express + TypeScript Server");
});

app.use(EmailPasswordAuthRoutes, GoogleAuthRoutes);

app.listen(port, () => {
	console.log(`[server]: Server is running at http://localhost:${port}`);
}); 