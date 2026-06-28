/** Strip Yahoo-style exchange suffix (e.g. BAYN.DE → BAYN, 4502.T → 4502). */
export function stripExchangeSuffix(rawSym: string): string {
  if (rawSym.includes('.')) {
    return rawSym.split('.')[0];
  }
  return rawSym;
}
