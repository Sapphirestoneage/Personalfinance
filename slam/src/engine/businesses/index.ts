import type { BusinessType } from '@/data/schemas';
import type { Book } from '../reader';
import type { Result } from '../types';
import { type BusinessMonth, type MonthContext, type OfferBooks } from './shared';
import { inPersonMonth } from './inPerson';
import { contentMonth } from './content';
import { callsMonth } from './calls';
import { regularsMonth } from './regulars';

export type { BusinessMonth, GpLine, MonthContext, OfferBooks } from './shared';
export { scaleMonth } from './shared';
export { inPersonMonth, type InPersonMonth } from './inPerson';
export { contentMonth, type ContentMonth } from './content';
export { callsMonth, type CallsMonth } from './calls';
export { regularsMonth, type RegularsMonth } from './regulars';

/** One month of one business, whatever its type. */
export function computeBusinessMonth(type: BusinessType, inputs: Book, offers: OfferBooks, ctx: MonthContext): Result<BusinessMonth> {
  switch (type) {
    case 'inPerson':
      return inPersonMonth(inputs, offers, ctx);
    case 'content':
      return contentMonth(inputs, offers, ctx);
    case 'calls':
      return callsMonth(inputs, offers, ctx);
    case 'regulars':
      return regularsMonth(inputs, offers, ctx);
  }
}
