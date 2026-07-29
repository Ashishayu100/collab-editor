import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { ApiError } from '../utils/ApiError';

export async function signupHandler(req: Request, res: Response): Promise<void> {
  const { email, name, password } = req.body as { email: string; name: string; password: string };
  const result = await authService.signup(email, name, password);
  res.status(201).json(result);
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  const result = await authService.login(email, password);
  res.status(200).json(result);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken: string };
  const result = await authService.refresh(refreshToken);
  res.status(200).json(result);
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  const user = await authService.getCurrentUser(req.user.userId);
  res.status(200).json({ user });
}

export async function logoutHandler(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ success: true });
}
