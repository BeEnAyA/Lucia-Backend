import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { generateIdFromEntropySize } from 'lucia';
import { createDate, isWithinExpirationDate, TimeSpan } from 'oslo';
import { encodeHex } from 'oslo/encoding';
import { sha256 } from 'oslo/crypto';
import { hash, verify } from '@node-rs/argon2'
import * as z from 'zod'

import { db } from '../../db/setup.js';
import { passwordResetTokenTable, userTable, emailVerificationTokenTable } from '../../db/schema.js';
import { lucia } from '../../lib/lucia.js';
import { EmailOptions, sendEmail } from '../../lib/sendgrid.js';

const signUpSchema = z.object({
    name: z.string().min(1, { message: 'Name is required' }).max(255, { message: 'Name must not exceed 255 characters' }),
    email: z.string().email({ message: 'Enter a valid email address' }),
    password: z.string().min(8, { message: 'Password must be at least 8 characters' }).max(16, { message: 'Password must not exceed 16 characters' }),
})

const signInSchema = z.object({
    email: z.string().email({ message: 'Enter a valid email address' }),
    password: z.string().min(8, { message: 'Password must be at least 8 characters' }).max(16, { message: 'Password must not exceed 16 characters' }),
})

const generateEmailVerificationToken = async (userId: string, email: string) => {
    //Invalidate all the existing tokens
    await db.delete(emailVerificationTokenTable).where(eq(emailVerificationTokenTable.userId, userId));
    const tokenId = generateIdFromEntropySize(25); // 40 characters long
    await db.insert(emailVerificationTokenTable).values(
        {
            id: tokenId,
            userId: userId,
            email: email,
            expiresAt: createDate(new TimeSpan(15, "m"))
        }
    )
    return tokenId;
}

export const signUpController = async (request: Request, response: Response) => {
    const { name, email, password } = request.body;
    console.log(name, email, password)
    try {
        signUpSchema.parse({ name, email, password })
        const [existingEmail] = await db.select().from(userTable).where(eq(userTable.email, email));

        if (existingEmail) {
            if (existingEmail.providerId && existingEmail.providerUserId) {
                return response.status(409).json({ error: "Email is already registered with an authentication provider." })
            }
            return response.status(409).json({ error: "Email is already registered." })
        }
        const userId = generateIdFromEntropySize(10) //Generate user id (16 characters long) using utility function provided by lucia 

        const hashedPassword = await hash(password, { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 }) //Hash password with minimum recommended parameters

        const newUser = {
            id: userId,
            name: name,
            email: email,
            password: hashedPassword,
            isVerified: false,
        }

        await db.insert(userTable).values(newUser)

        const verificationToken = await generateEmailVerificationToken(newUser.id, newUser.email)

        const verificationLink = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`

        const emailOptions: EmailOptions = {
            to: email,
            subject: "Email Verification",
            content: `Welcome to Lucia,\nClick on the link to verify your email:\n${verificationLink}\n\nThe link expires in 15 minutes.`

        }

        await sendEmail(emailOptions)

        const session = await lucia.createSession(userId, {});
        const sessionCookie = lucia.createSessionCookie(session.id);
        response.setHeader('Set-Cookie', sessionCookie.serialize());
        response.status(200).json({ message: "Please check your email for verification link" })
    }
    catch (error: any) {
        if (error instanceof z.ZodError) {
            return response.status(400).json({ error: "Validation error encountered" });
        }
        response.status(500).json({ error })
    }
}

export const resendVerificationEmail = async (request: Request, response: Response) => {
    try {
        const expiredToken = request.params.token;
        const [storedToken] = await db.select().from(emailVerificationTokenTable).where(eq(emailVerificationTokenTable.id, expiredToken));
        await db.delete(emailVerificationTokenTable).where(eq(emailVerificationTokenTable.id, expiredToken))

        const verificationToken = await generateEmailVerificationToken(storedToken.userId, storedToken.email)

        const verificationLink = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`

        const emailOptions: EmailOptions = {
            to: storedToken.email,
            subject: "Email Verification",
            content: `Welcome to Lucia,\nClick on the link to verify your email:\n${verificationLink}\n\nThe link expires in 15 minutes.`

        }
        await sendEmail(emailOptions)
        response.status(200).json({ message: "Please check your email for verification link" })
    } catch (error: any) {
        response.status(500).json({ message: error.message })
    }

}

export const verifyEmailController = async (request: Request, response: Response) => {
    try {
        const verificationToken = request.params.token;

        const [storedToken] = await db.select().from(emailVerificationTokenTable).where(eq(emailVerificationTokenTable.id, verificationToken));

        if (!storedToken) {
            return response.status(400).json({ message: "Verification link is invalid.", isInvalid: true });
        }

        if (!isWithinExpirationDate(storedToken.expiresAt)) {
            return response.status(400).json({ message: "Verification link has expired", isExpired: true });
        }

        const [user] = await db.select().from(userTable).where(eq(userTable.id, storedToken.userId));

        if (!user || user.email !== storedToken.email) {
            return response.status(400).json({ message: "The email is not registered" });
        }

        await lucia.invalidateUserSessions(user.id);

        await db.update(userTable).set({ isVerified: true }).where(eq(userTable.id, user.id))

        await db.delete(emailVerificationTokenTable).where(eq(emailVerificationTokenTable.id, verificationToken))

        response.status(200).json({ message: "Email verified successfully" })
    } catch (error: any) {
        response.status(500).json({ message: error.message })
    }

}

export const signInController = async (request: Request, response: Response) => {
    const { email, password } = request.body;
    console.log(email, password);
    try {
        signInSchema.parse({ email, password })
        const [existingUser] = await db.select().from(userTable).where(eq(userTable.email, email as string));
        if (!existingUser) {
            return response.status(404).json({ message: "Email is not registered." })
        }

        if (existingUser.providerId) {
            return response.status(401).json({ message: "Email is linked with a social login.Please continue with social login." })
        }

        const validPassword = await verify(existingUser.password as string, password, {
            memoryCost: 19456,
            timeCost: 2,
            outputLen: 32,
            parallelism: 1
        })

        if (!validPassword) {
            return response.status(401).json({ message: "Password does not match" })
        }

        if (validPassword && !existingUser.isVerified) {
            await lucia.invalidateUserSessions(existingUser.id)
            const sessionId = await lucia.createSession(existingUser.id, {})
            const sessionCookie = lucia.createSessionCookie(sessionId.id)
            response.setHeader('Set-Cookie', sessionCookie.serialize());
            return response.status(401).json({ message: "Email is not verified", isVerified: false })
        }

        const sessionId = await lucia.createSession(existingUser.id, {})
        const sessionCookie = lucia.createSessionCookie(sessionId.id)
        const { user } = await lucia.validateSession(sessionId.id);
        response.setHeader('Set-Cookie', sessionCookie.serialize());
        response.status(200).json({
            message: "Login successful",
            data: user
        })
    } catch (error: any) {
        response.status(500).json({ message: error.message })
    }
}

export const createPasswordResetToken = async (userId: string) => {
    try {
        //Check if there's a password reset token for the user already and delete if if exists
        await db.delete(passwordResetTokenTable).where(eq(passwordResetTokenTable.userId, userId))

        // Generates password reset token
        const tokenId = generateIdFromEntropySize(25)

        // Hashes the token, saves it in the database and returns the token 
        const tokenHash = encodeHex(await sha256(new TextEncoder().encode(tokenId)));
        await db.insert(passwordResetTokenTable)
            .values({
                tokenHash: tokenHash,
                userId: userId,
                expiresAt: createDate(new TimeSpan(1, "h"))
            })
        return tokenId
    } catch (error) {
        console.log(error)
    }

}

export const forgotPasswordController = async (request: Request, response: Response) => {
    try {
        const { email } = request.body;

        //Check if the email is registered or not
        const [existingEmail] = await db.select().from(userTable).where(eq(userTable.email, email))

        //If email is not registered 
        if (!existingEmail) {
            return response.status(404).json({
                message: "This email is not registered."
            })
        }

        //If email is registered but has providerId and providerUserId, means the  email is associated with social login
        if (existingEmail?.providerId && existingEmail.providerUserId) {
            return response.status(400).json({
                message: "Cannot reset password for email with social login."
            })
        }

        //If email is registered but has not been provided yet
        if(!existingEmail.isVerified){
            return response.status(400).json({
                message: "Your email is not verified. First verify your email.",
            })
        }

        //Generate a unique token for password reset and save it in the database
        const passwordResetToken = await createPasswordResetToken(existingEmail.id)

        //Create the password reset link and send it to the user's email address
        const passwordResetLink = `${process.env.CLIENT_URL}/reset-password/${passwordResetToken}`
        const emailOptions: EmailOptions = {
            to: email,
            subject: "Password Reset",
            content: `Please click on the provided URL to reset your password:\n${passwordResetLink}\n\n The link expires in 60 minutes.`

        }
        await sendEmail(emailOptions)

        response.status(200).json({
            message: "Please check your email for password reset link"
        })
    } catch (error: any) {
        response.status(500).json({
            message: error.message
        })
    }
}


export const resetPasswordController = async (request: Request, response: Response) => {
    try {
        const { password } = request.body;
        const verificationToken = request.params.token;

        //Hashes the token received from the password reset link
        const tokenHash = encodeHex(await sha256(new TextEncoder().encode(verificationToken)));

        //Checks if the token hash matches with the one in the database
        const [token] = await db.select().from(passwordResetTokenTable).where(eq(passwordResetTokenTable.tokenHash, tokenHash))
        if (!token) {
            return response.status(400).json({
                message: "The password reset link is invalid.",
                isInvalid: true
            })
        }

        //Checks if the token has not expired
        if (!isWithinExpirationDate(token.expiresAt)) {
            return response.status(400).json({
                message: "The password reset link has expired. Please request the another one.",
                isExpired: true
            })
        }

        //Updates the user's password in the database and invalidates the session for the user
        await lucia.invalidateUserSessions(token.userId)
        const passwordHash = await hash(password, {
            memoryCost: 19456,
            timeCost: 2,
            outputLen: 32,
            parallelism: 1
        });
        await db.update(userTable).set({ password: passwordHash }).where(eq(userTable.id, token.userId))

        // Delete the password reset token from the database after successful password reset
        await db.delete(passwordResetTokenTable).where(eq(passwordResetTokenTable.tokenHash, tokenHash))

        response.status(200).json({
            message: "Password reset successful"
        })

    } catch (error: any) {
        response.status(500).json({ message: error.message})
    }
}

export const getUserDetails = async (_: Request, response: Response) => {
    const user = response.locals.user;
    response.status(200).json({ data: user })
}

export const signOutController = async (_: Request, response: Response) => {
    if (!response.locals.session) {
        return response.status(401).json({
            message: "You were not logged in."
        });
    }

    try {
        // Invalidate the session
        await lucia.invalidateSession(response.locals.session.id);

        // Set cookie and send success response
        response.setHeader("Set-Cookie", lucia.createBlankSessionCookie().serialize());
        return response.status(200).json({ message: "Logout successful" });
    } catch (error) {
        console.error('Error during logout:', error);
        return response.status(500).json({ message: "An error occurred during logout." });
    }
};