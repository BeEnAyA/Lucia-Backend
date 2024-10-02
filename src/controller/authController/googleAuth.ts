import { generateState, generateCodeVerifier } from "arctic"
import { Request, Response } from 'express'
import { google, lucia } from "../../lib/lucia.js"
import { db } from "../../db/setup.js"
import { userTable } from "../../db/schema.js"
import { eq } from "drizzle-orm"
import { generateIdFromEntropySize } from "lucia"
import { OAuth2Client } from 'google-auth-library';
import "dotenv/config"



export const googleLoginController = async (_: Request, response: Response) => {
    const state = generateState()
    const codeVerifier = generateCodeVerifier()
    const authorizationUrl = (await google.createAuthorizationURL(state, codeVerifier, { scopes: ["email", "profile"] })).href;
    response.cookie("google_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 10 * 1000,
        path: "/",
        ...(process.env.NODE_ENV === 'production' && { sameSite: 'none' })
    });
    response.cookie("code_verifier", codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 10 * 1000,
        path: "/",
        ...(process.env.NODE_ENV === 'production' && { sameSite: 'none' })
    });
    return response.status(200).json({ url: authorizationUrl });
}


export const getUser = async (accessToken: string) => {
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });
    return await userInfoResponse.json();
}

export const getUserDetails = async (token: string) => {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    return payload;
}

export const googleCallbackController = async (request: Request, response: Response) => {
    try {
        let token: string;
        if (request.body.idToken) {
            token = decodeURIComponent(request.body.idToken);
            console.log("Token", token);
        }
        else {
            const code = request.body.code?.toString();
            const state = request.body.state?.toString();
            const codeVerifier = request.cookies["code_verifier"];
            const googleOAuthState = request.cookies["google_oauth_state"]

            //Validate incoming code,state and codeVerifier
            if (!code || !state || state !== googleOAuthState || !codeVerifier) {
                return response.status(400).json({ message: "Missing or invalid code,state or code verifier" });
            }

            // Validate authorization code and retrieve tokens
            const { idToken } = await google.validateAuthorizationCode(code, codeVerifier);
            token = idToken;
        }

        //Fetch user details from Google
        const googleUser = await getUserDetails(token);

        if (!googleUser) {
            return response.status(400).json({ message: "Token is not valid" });
        }

        // Check if user already exists
        const [existingUser] = await db.select().from(userTable).where(eq(userTable.email, googleUser.email as string));

        if (existingUser) {
            existingUser.providerId = "google";
            existingUser.providerUserId = googleUser.sub;

            //Create a new session for existing user
            const session = await lucia.createSession(existingUser.id, {});
            const sessionCookie = lucia.createSessionCookie(session.id);
            const { user } = await lucia.validateSession(session.id);

            //Set the session cookie and return the user info
            response.setHeader('Set-Cookie', sessionCookie.serialize());
            return response.status(200).json({
                message: "Login successful",
                data: user
            });
        }

        //Create a new user if not already registered
        const userId = generateIdFromEntropySize(10);
        const newUser = {
            id: userId,
            name: googleUser.name as string,
            email: googleUser.email,
            providerId: "google",
            providerUserId: googleUser.sub,
            profileImage: googleUser.picture,
            isVerified: true,
        };

        await db.insert(userTable).values(newUser);

        //Create a new session for the newly created user
        const session = await lucia.createSession(userId, {});
        const sessionCookie = lucia.createSessionCookie(session.id);

        //Set the session cookie and return the user info
        response.setHeader('Set-Cookie', sessionCookie.serialize());
        const { user } = await lucia.validateSession(session.id);
        response.status(200).json({
            message: "Login successful",
            data: user
        })
    } catch (error) {
        console.log(error)
        return response.status(500).json({ message: error })
    }
}