import { NextFunction, Request, Response } from 'express';
import { MetricsService } from '../services/MetricsService';

/** Records every REST request/response into MetricsService — response time, error rate, rate
 *  limit hits, and auth failures, all read off the final status code so it works regardless of
 *  which layer (route handler, rate limiter, auth middleware) produced it. */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const metrics = MetricsService.getInstance();
  const startTime = performance.now();

  metrics.apiRequest();

  res.on('finish', () => {
    const elapsed = performance.now() - startTime;
    metrics.recordApiResponseTime(elapsed);

    if (res.statusCode >= 400) {
      metrics.apiError();
    }
    if (res.statusCode === 429) {
      metrics.rateLimitHit();
    }
    if (res.statusCode === 401) {
      metrics.authFailure();
    }
  });

  next();
}
