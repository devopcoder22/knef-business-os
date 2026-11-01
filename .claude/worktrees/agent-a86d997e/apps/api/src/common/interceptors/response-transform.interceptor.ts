import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface TransformedResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

@Injectable()
export class ResponseTransformInterceptor<T>
  implements NestInterceptor<T, TransformedResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<TransformedResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the response already has the shape { data: ..., meta?: ... } pass it through
        if (
          data !== null &&
          typeof data === 'object' &&
          'data' in (data as object)
        ) {
          return data as unknown as TransformedResponse<T>;
        }
        return { data };
      }),
    );
  }
}
