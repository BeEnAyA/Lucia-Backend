import { Router } from "express";
import {
    forgotPasswordController,
    getUserDetails,
    resendVerificationEmail,
    resetPasswordController,
    signInController,
    signOutController,
    signUpController,
    verifyEmailController
} from "../../controller/authController/emailPasswordAuth.js";
import { isAuthenticated } from "../../middleware/isAuthenticated.js";

export const router = Router();

router.route('/signup').post(signUpController)
router.route("/verify-email/:token").get(verifyEmailController)
router.route("/resend-email-verification/:token").get(resendVerificationEmail)
router.route('/signin').post(signInController)
router.route('/forgot-password').post(forgotPasswordController)
router.route('/reset-password/:token').post(resetPasswordController)
router.route("/get-user-details").get(isAuthenticated, getUserDetails)
router.route('/logout').get(isAuthenticated, signOutController)