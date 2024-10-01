import { generateState, generateCodeVerifier } from "arctic"
import { Request, Response } from 'express'
import { google, lucia } from "../../lib/lucia.js"
import { db } from "../../db/setup.js"
import { userTable } from "../../db/schema.js"
import { eq } from "drizzle-orm"
import { generateIdFromEntropySize } from "lucia"
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
        // sameSite: "none"
    });
    response.cookie("code_verifier", codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 10 * 1000,
        path: "/",
        // sameSite: "none"
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

export const googleCallbackController = async (request: Request, response: Response) => {
    try {
        const code = request.body.code?.toString();
        const state = request.body.state?.toString();
        const codeVerifier = request.cookies["code_verifier"];
        const googleOAuthState = request.cookies["google_oauth_state"]

        //Validate incoming code,state and codeVerifier
        if (!code || !state || state !== googleOAuthState || !codeVerifier) {
            return response.status(400).json({ message: "Missing or invalid code,state or code verifier" });
        }

        // Validate authorization code and retrieve tokens
        const tokens = await google.validateAuthorizationCode(code, codeVerifier);

        //Fetch user details from Google
        const googleUser = await getUser(tokens.accessToken);


        // Check if user already exists
        const [existingUser] = await db.select().from(userTable).where(eq(userTable.email, googleUser.email));

        if (existingUser) {
            // If user exists but does not have provider id means, user is registered with email/password
            // if (existingUser.providerId === null) {
            //     return response.status(409).json({ message: "Email is already registered via email/password." })
            // }
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
            name: googleUser.name,
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
        return response.status(500).json({ error: error })
    }
}