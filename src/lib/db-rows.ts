/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Loose row shape for Supabase queries with embedded relations. The untyped
 * client cannot infer nested select shapes; admin pages cast to this and
 * narrow at the point of use. Replace with generated database types once the
 * hosted project exists (supabase gen types typescript).
 */
export type Row = Record<string, any>;
