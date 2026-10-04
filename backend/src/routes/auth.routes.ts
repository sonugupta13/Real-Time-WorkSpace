import { Router } from "express";
import {
  signup,
  login,
  refresh,
  logout,
  getMe,
} from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";

export const authRouter = Router();

// Public Authentication Routes
authRouter.post("/signup", signup);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);

// Protected User Routes (Requires valid Access Token)
authRouter.get("/me", authenticate, getMe);

export default authRouter;
