import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import session from 'express-session'
import cookieParser from "cookie-parser";
import cors from 'cors'

import { router as EmailPasswordAuthRoutes } from "./routes/authRoutes/emailPasswordAuthRoutes.js";
import { router as GoogleAuthRoutes } from "./routes/authRoutes/googleAuthRoutes.js"

dotenv.config();

const app: Express = express();
const port = process.env.PORT ?? 3000;

app.use(express.json())
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
	secret: 'aiculgdgdgdgdggrgdfgedg',
	resave: false,
	saveUninitialized: false,
	cookie: {
		secure: false,
	}
}));

//Enable cors for http://localhost:5173 
app.use(cors({
	origin: 'http://localhost:5173',
	credentials: true,
}));

app.get("/", (req: Request, res: Response) => {
	res.send("Express + TypeScript Server");
});

app.use(EmailPasswordAuthRoutes, GoogleAuthRoutes);

app.listen(port, () => {
	console.log(`[server]: Server is running at http://localhost:${port}`);
}); 