import type { ReadsbTrace } from '../readsb';

export interface TraceSource {
  name: string;
  attribution: string;
  traces(date: string): AsyncIterable<ReadsbTrace>;
}
