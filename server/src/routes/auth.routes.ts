import { Router } from 'express';
import { z } from 'zod';
import {
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  signupHandler,
} from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least 1 lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least 1 number');

const signupSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    password: passwordSchema,
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'refreshToken is required'),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

router.post('/signup', authLimiter, validate(signupSchema), asyncHandler(signupHandler));
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(loginHandler));
router.post('/refresh', authLimiter, validate(refreshSchema), asyncHandler(refreshHandler));
router.get('/me', requireAuth, asyncHandler(meHandler));
router.post('/logout', asyncHandler(logoutHandler));

export default router;
