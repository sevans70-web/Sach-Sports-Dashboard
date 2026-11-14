/** Read-only original-receipt helpers; runtime validation remains in the module. */
export function captureVersionOneChecksum(value: unknown): string | null;
export function immutableModelHistoryRow(pick: any, grade?: any): Record<string, any> | null;
export function appendMissingImmutableModelPicks<T>(existing: T[], protectedRows: T[]): {
  records: T[]; added: number; alreadyPresent: number;
};
export function readImmutableModelHistory(sport: string, firstDay: string): Promise<{
  rows: Record<string, any>[]; invalid: number;
}>;
