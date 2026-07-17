export interface ApiError {
  error: string;
  message: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  username: string;
  displayName?: string;
  groups: string[];
}

export interface MeResponse {
  authenticated: boolean;
  username?: string;
  displayName?: string;
  groups?: string[];
}
