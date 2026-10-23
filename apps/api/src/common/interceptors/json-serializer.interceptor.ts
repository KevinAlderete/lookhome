import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from "@nestjs/common";
import { Observable, map } from "rxjs";

function serialize(value: unknown): unknown {
  if (value instanceof StreamableFile) return value;
  if (typeof value === "bigint") return value.toString();
  if (
    value &&
    typeof value === "object" &&
    value.constructor?.name === "Decimal"
  ) {
    return value.toString();
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)]),
    );
  }
  return value;
}

@Injectable()
export class JsonSerializerInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map(serialize));
  }
}
