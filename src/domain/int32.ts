/**
 * 32-bit integer multiplication using only exact arithmetic. Equivalent to Math.imul, which is
 * not in the domain's allowed Math members. Operands are read as int32 and the result is int32.
 */
export function imul32(a: number, b: number): number {
  const low = a & 0xffff;
  const high = (a >>> 16) & 0xffff;
  // low * b and high * b stay below 2^48, so they are exact doubles.
  return (low * b + (((high * b) & 0xffff) << 16)) | 0;
}
