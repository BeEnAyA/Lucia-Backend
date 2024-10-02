import { Router } from "express";
import { googleCallbackController, googleLoginController } from "../../controller/authController/googleAuth.js";

export const router = Router();

router.route('/login/google').get(googleLoginController)
router.route('/login/google/callback/:token?').post(googleCallbackController)