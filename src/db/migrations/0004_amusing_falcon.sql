-- 1. asset_categories에 kind 컬럼 추가 (기본값으로 먼저 추가)
ALTER TABLE "asset_categories" ADD COLUMN "kind" text DEFAULT 'financial' NOT NULL;--> statement-breakpoint

-- 2. 기존 자산 카테고리에 kind 설정
UPDATE "asset_categories" SET "kind" = 'financial' WHERE "name" IN ('금융자산', '보험/연금');--> statement-breakpoint
UPDATE "asset_categories" SET "kind" = 'non_financial' WHERE "name" IN ('부동산', '차량', '기타');--> statement-breakpoint

-- 3. assets에서 assetCategoryId가 null인 행을 category 기반으로 매핑
-- financial 카테고리 자산 → 금융자산 카테고리
UPDATE "assets" SET "asset_category_id" = (
  SELECT "id" FROM "asset_categories" WHERE "name" = '금융자산' LIMIT 1
) WHERE "asset_category_id" IS NULL AND "category" = 'financial';--> statement-breakpoint

-- non_financial 카테고리 자산 → 부동산 카테고리 (기본)
UPDATE "assets" SET "asset_category_id" = (
  SELECT "id" FROM "asset_categories" WHERE "name" = '부동산' LIMIT 1
) WHERE "asset_category_id" IS NULL AND "category" = 'non_financial';--> statement-breakpoint

-- 남은 null 처리 (혹시 모를 경우)
UPDATE "assets" SET "asset_category_id" = (
  SELECT "id" FROM "asset_categories" WHERE "name" = '기타' LIMIT 1
) WHERE "asset_category_id" IS NULL;--> statement-breakpoint

-- 4. asset_category_id NOT NULL 제약 추가
ALTER TABLE "assets" ALTER COLUMN "asset_category_id" SET NOT NULL;--> statement-breakpoint

-- 5. 인덱스 삭제 (type, category 컬럼 삭제 전)
DROP INDEX "idx_assets_type";--> statement-breakpoint
DROP INDEX "idx_assets_category";--> statement-breakpoint

-- 6. type, category 컬럼 삭제
ALTER TABLE "assets" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "category";--> statement-breakpoint

-- 7. kind 컬럼의 기본값 제거 (스키마와 일치)
ALTER TABLE "asset_categories" ALTER COLUMN "kind" DROP DEFAULT;
