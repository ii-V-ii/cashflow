import { getDb } from './index'
import { categories, accounts, assetCategories } from './schema'
import { generateId } from '../lib/utils'

async function seed() {
  const db = getDb()

  const existingCategories = await db.select().from(categories)
  if (existingCategories.length > 0) {
    console.log('시드 데이터가 이미 존재합니다. 건너뜁니다.')
    return
  }

  // === 수입 카테고리 (대분류 + 소분류) ===
  const incomeTree = [
    {
      name: '급여', icon: '💰', sortOrder: 1,
      children: [
        { name: '월급', sortOrder: 1 },
        { name: '상여금', sortOrder: 2 },
        { name: '수당', sortOrder: 3 },
      ],
    },
    {
      name: '용돈', icon: '🎁', sortOrder: 2,
      children: [],
    },
    {
      name: '금융소득', icon: '🏦', sortOrder: 3,
      children: [
        { name: '이자', sortOrder: 1 },
        { name: '배당', sortOrder: 2 },
      ],
    },
    {
      name: '기타수입', icon: '📦', sortOrder: 4,
      children: [],
    },
  ]

  // === 지출 카테고리 (대분류 + 소분류) ===
  const expenseTree = [
    {
      name: '식비', icon: '🍔', sortOrder: 1,
      children: [
        { name: '외식', sortOrder: 1 },
        { name: '배달', sortOrder: 2 },
        { name: '식료품', sortOrder: 3 },
        { name: '카페', sortOrder: 4 },
      ],
    },
    {
      name: '교통', icon: '🚌', sortOrder: 2,
      children: [
        { name: '대중교통', sortOrder: 1 },
        { name: '택시', sortOrder: 2 },
        { name: '주유', sortOrder: 3 },
        { name: '주차', sortOrder: 4 },
      ],
    },
    {
      name: '주거', icon: '🏠', sortOrder: 3,
      children: [
        { name: '월세', sortOrder: 1 },
        { name: '관리비', sortOrder: 2 },
        { name: '공과금', sortOrder: 3 },
      ],
    },
    {
      name: '의료', icon: '🏥', sortOrder: 4,
      children: [
        { name: '병원비', sortOrder: 1 },
        { name: '약값', sortOrder: 2 },
      ],
    },
    {
      name: '통신', icon: '📱', sortOrder: 5,
      children: [
        { name: '휴대폰', sortOrder: 1 },
        { name: '인터넷', sortOrder: 2 },
      ],
    },
    {
      name: '교육', icon: '📚', sortOrder: 6,
      children: [
        { name: '학원', sortOrder: 1 },
        { name: '도서', sortOrder: 2 },
        { name: '온라인강의', sortOrder: 3 },
      ],
    },
    {
      name: '문화', icon: '🎬', sortOrder: 7,
      children: [
        { name: '영화/공연', sortOrder: 1 },
        { name: '구독서비스', sortOrder: 2 },
        { name: '여행', sortOrder: 3 },
      ],
    },
    {
      name: '의류', icon: '👔', sortOrder: 8,
      children: [],
    },
    {
      name: '생활용품', icon: '🧴', sortOrder: 9,
      children: [],
    },
    {
      name: '보험', icon: '🛡️', sortOrder: 10,
      children: [],
    },
    {
      name: '경조사', icon: '💐', sortOrder: 11,
      children: [],
    },
    {
      name: '기타지출', icon: '📦', sortOrder: 12,
      children: [],
    },
  ]

  // === 저축/투자 카테고리 (expenseKind: 'saving') ===
  const savingExpenseTree = [
    {
      name: '저축/투자', icon: '💰', sortOrder: 13,
      children: [
        { name: '예금', sortOrder: 0 },
        { name: '적금', sortOrder: 1 },
        { name: '주식', sortOrder: 2 },
        { name: '펀드', sortOrder: 3 },
        { name: '채권', sortOrder: 4 },
        { name: '연금', sortOrder: 5 },
        { name: '보험', sortOrder: 6 },
      ],
    },
  ]

  // === 기본 계좌 ===
  const defaultAccounts = [
    { name: '현금', type: 'cash' as const, sortOrder: 1 },
    { name: '국민은행', type: 'bank' as const, sortOrder: 2 },
    { name: '신한은행', type: 'bank' as const, sortOrder: 3 },
  ]

  // === 기본 자산 카테고리 ===
  const defaultAssetCategories = [
    { name: '금융자산', kind: 'financial' as const, icon: '🏦', sortOrder: 1 },
    { name: '부동산', kind: 'non_financial' as const, icon: '🏠', sortOrder: 2 },
    { name: '차량', kind: 'non_financial' as const, icon: '🚗', sortOrder: 3 },
    { name: '보험/연금', kind: 'financial' as const, icon: '🛡️', sortOrder: 4 },
    { name: '기타', kind: 'non_financial' as const, icon: '📦', sortOrder: 5 },
  ]

  await db.transaction(async (tx) => {
    // 카테고리 시드 (대분류 + 소분류)
    async function insertCategoryTree(
      tree: typeof incomeTree,
      type: 'income' | 'expense',
      expenseKind: 'consumption' | 'saving' | null = null,
    ) {
      for (const parent of tree) {
        const parentId = generateId()
        await tx.insert(categories)
          .values({
            id: parentId,
            name: parent.name,
            type,
            expenseKind,
            icon: parent.icon,
            sortOrder: parent.sortOrder,
          })

        for (const child of parent.children) {
          await tx.insert(categories)
            .values({
              id: generateId(),
              name: child.name,
              type,
              expenseKind,
              parentId,
              sortOrder: child.sortOrder,
            })
        }
      }
    }

    await insertCategoryTree(incomeTree, 'income')
    await insertCategoryTree(expenseTree, 'expense', 'consumption')
    await insertCategoryTree(savingExpenseTree, 'expense', 'saving')

    // 계좌 시드
    for (const acc of defaultAccounts) {
      await tx.insert(accounts)
        .values({
          id: generateId(),
          name: acc.name,
          type: acc.type,
          sortOrder: acc.sortOrder,
        })
    }

    // 자산 카테고리 시드
    for (const ac of defaultAssetCategories) {
      await tx.insert(assetCategories)
        .values({
          id: generateId(),
          name: ac.name,
          kind: ac.kind,
          icon: ac.icon,
          sortOrder: ac.sortOrder,
        })
    }
  })

  const totalIncomeCategories = incomeTree.reduce(
    (sum, p) => sum + 1 + p.children.length,
    0,
  )
  const totalExpenseCategories = expenseTree.reduce(
    (sum, p) => sum + 1 + p.children.length,
    0,
  )
  const totalSavingCategories = savingExpenseTree.reduce(
    (sum, p) => sum + 1 + p.children.length,
    0,
  )

  console.log('시드 데이터 생성 완료:')
  console.log(`  - 수입 카테고리: ${totalIncomeCategories}개 (대분류 ${incomeTree.length}개)`)
  console.log(`  - 소비성 지출 카테고리: ${totalExpenseCategories}개 (대분류 ${expenseTree.length}개)`)
  console.log(`  - 저축성 지출 카테고리: ${totalSavingCategories}개 (대분류 ${savingExpenseTree.length}개)`)
  console.log(`  - 계좌: ${defaultAccounts.length}개`)
  console.log(`  - 자산 카테고리: ${defaultAssetCategories.length}개`)
}

seed()
