/**
 * Utility function to strip MongoDB internal fields (like __v) from documents
 * Used across multiple services to clean up document objects before returning to clients
 */
export function stripDocument<T>(
  doc: Partial<T & { __v?: number; _id?: any }>,
): Partial<T> {
  const { __v, ...rest } = doc;
  return rest as Partial<T>;
}
