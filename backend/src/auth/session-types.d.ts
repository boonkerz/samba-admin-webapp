import "express-session";

declare module "express-session" {
  interface SessionData {
    username?: string;
    displayName?: string;
    groups?: string[];
    encryptedPassword?: string;
  }
}
