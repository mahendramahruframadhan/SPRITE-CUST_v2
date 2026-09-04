import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { auth } from './better-auth';

@Injectable()
export class BetterAuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req: any = ctx.switchToHttp().getRequest();
    // ponytail: Better Auth session via header — no JWT decode needed, reuse Better Auth's own verifier
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(','));
    }
    // Better Auth exposes getSession via auth.api.getSession
    try {
      const session = await (auth as any).api.getSession({ headers });
      if (session?.user) {
        req.user = session.user;
        req.session = session.session;
        return true;
      }
    } catch {}
    throw new UnauthorizedException('Unauthorized — Better Auth session required');
  }
}
