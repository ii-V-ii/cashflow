import type { RecurringFrequency } from "@/types"

const EVERY_LABEL: Record<RecurringFrequency, string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
}

const UNIT_LABEL: Record<RecurringFrequency, string> = {
  daily: "일",
  weekly: "주",
  monthly: "개월",
  yearly: "년",
}

/** 주기 표시: interval 1 → '매월', n → 'n개월마다' */
export function frequencyLabel(
  frequency: RecurringFrequency,
  interval: number,
): string {
  return interval === 1
    ? EVERY_LABEL[frequency]
    : `${interval}${UNIT_LABEL[frequency]}마다`
}
