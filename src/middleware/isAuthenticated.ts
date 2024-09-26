import { Request, Response, NextFunction } from 'express';
import { lucia } from "../lib/lucia.js";

export const isAuthenticated=((request:Request, response:Response, next:NextFunction) => {
    const sessionId = lucia.readSessionCookie(request.headers.cookie ?? "");
  
    // Handle missing or invalid session ID gracefully
    if (!sessionId) {
      return response.status(401).json({
        message: "Please login to continue"
      })
    }
    // Validate session ID and obtain session/user data
    lucia.validateSession(sessionId)
      .then(({ session, user }) => {
        if (!session) {
          // Invalid session ID: Create a blank cookie for consistency
          response.appendHeader('Set-Cookie', lucia.createBlankSessionCookie().serialize());
          return response.status(403).json({
            message: "Session has expired."
          })
        }
  
        // Update cookie if necessary (session refresh, etc.)
        if (session.fresh) {
          response.appendHeader('Set-Cookie', lucia.createSessionCookie(session.id).serialize());
        }
        // Set user and session data for subsequent middleware/routes
        response.locals.user = user;
        response.locals.session = session;
        next();
      })
      .catch((error) => {
        // Handle validation errors appropriately
        console.error('Error validating session:', error);
        response.status(500).json({ error: 'Internal Server Error' }); // Generic error response
        next();
      });
  });