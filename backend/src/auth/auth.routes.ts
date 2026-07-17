import { Router } from "express";
import type { LoginRequest, LoginResponse, MeResponse } from "@samba-admin/shared";
import { verifyCredentials, AuthError } from "./auth.service.js";
import { encryptSecret } from "./crypto.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body as LoginRequest;
  if (!username || !password) {
    return res.status(400).json({ error: "missing-credentials", message: "Username and password are required." });
  }
  try {
    const identity = await verifyCredentials(username, password);
    req.session.username = identity.username;
    req.session.displayName = identity.displayName;
    req.session.groups = identity.groups;
    req.session.encryptedPassword = encryptSecret(password);

    const response: LoginResponse = {
      username: identity.username,
      displayName: identity.displayName,
      groups: identity.groups,
    };
    res.json(response);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(401).json({ error: "invalid-credentials", message: err.message });
    }
    res.status(500).json({ error: "internal-error", message: "Login failed unexpectedly." });
  }
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("samba_admin_sid");
    res.json({ ok: true });
  });
});

authRouter.get("/me", (req, res) => {
  const response: MeResponse = req.session.username
    ? { authenticated: true, username: req.session.username, displayName: req.session.displayName, groups: req.session.groups }
    : { authenticated: false };
  res.json(response);
});
