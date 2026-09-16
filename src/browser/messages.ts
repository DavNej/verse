/**
 * The popup/content-script contract.
 *
 * Kept in one module so both sides type the same shape, and so adding a request
 * kind later is a type error on the side that has not handled it.
 */

import type { ExtractionError, Result } from '../core/types';
import type { ExtractionOutput } from './extract';

export type VerseRequest = { type: 'extract'; videoId: string };

export type VerseResponse = Result<ExtractionOutput, ExtractionError>;
