import { Lucia, TimeSpan } from "lucia";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { Google } from 'arctic'

import "dotenv/config"
import { db } from "../db/setup.js";
import { sessionTable, userTable } from "../db/schema.js";


export const google = new Google(process.env.GOOGLE_CLIENT_ID as string, process.env.GOOGLE_CLIENT_SECRET as string, process.env.GOOGLE_CALLBACK_URI as string);

const adapter = new DrizzlePostgreSQLAdapter(db, sessionTable, userTable)

export const lucia = new Lucia(adapter, {
    sessionExpiresIn: new TimeSpan(30, 'd'),
    sessionCookie: {
        attributes: {
            secure: process.env.NODE_ENV === 'production',
            ...(process.env.NODE_ENV === 'production' && { sameSite: 'none' }) // only add sameSite in production
        }
    },
    getUserAttributes: (attributes) => {
        return {
            name: attributes.name,
            email: attributes.email,
            profile: attributes.profileImage
        }
    },
});

declare module "lucia" {
    interface Register {
        Lucia: typeof lucia;
        DatabaseUserAttributes: Omit<DatabaseUserAttributes, 'id'>
    }

    interface DatabaseUserAttributes {
        id: string;
        name: string;
        email: string;
        profileImage: string;
    }
}