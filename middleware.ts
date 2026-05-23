import type { NextRequest } from 'next/server';
import { proxy, config } from './proxy';

export default function middleware(request: NextRequest) {
  return proxy(request);
}

export { config };
