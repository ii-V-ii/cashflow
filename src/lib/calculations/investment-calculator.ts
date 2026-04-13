/**
 * 단순 수익률: (현재가치 - 취득원가) / 취득원가 * 100
 */
export function calculateSimpleReturn(currentValue: number, acquisitionCost: number): number {
  if (acquisitionCost === 0) return 0
  return ((currentValue - acquisitionCost) / acquisitionCost) * 100
}

/**
 * 연환산 수익률 (CAGR): ((현재가치 / 취득원가)^(1/년수) - 1) * 100
 */
export function calculateCAGR(
  currentValue: number,
  acquisitionCost: number,
  years: number,
): number {
  if (acquisitionCost <= 0 || years <= 0 || currentValue <= 0) return 0
  return (Math.pow(currentValue / acquisitionCost, 1 / years) - 1) * 100
}

/**
 * 포트폴리오 비중: 각 자산 현재가치 / 총자산가치 * 100
 */
export function calculatePortfolioWeight(assetValue: number, totalValue: number): number {
  if (totalValue === 0) return 0
  return (assetValue / totalValue) * 100
}

/**
 * 취득일로부터 현재까지 경과 년수 계산
 */
export function calculateYearsHeld(acquisitionDate: string, referenceDate?: string): number {
  const acqDate = new Date(acquisitionDate)
  const refDate = referenceDate ? new Date(referenceDate) : new Date()
  const diffMs = refDate.getTime() - acqDate.getTime()
  return diffMs / (365.25 * 24 * 60 * 60 * 1000)
}
