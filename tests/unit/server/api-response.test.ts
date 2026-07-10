import { describe, expect, test } from "vitest"

import {
  errorResponse,
  jsonError,
  jsonSuccess,
  successResponse,
} from "@/server/api-response"

describe("successResponse", () => {
  test("wraps data in a success envelope", () => {
    // Arrange
    const data = { status: "ok" }

    // Act
    const result = successResponse(data)

    // Assert
    expect(result).toEqual({ success: true, data: { status: "ok" } })
  })

  test("preserves primitive data as-is", () => {
    expect(successResponse(42)).toEqual({ success: true, data: 42 })
    expect(successResponse(null)).toEqual({ success: true, data: null })
  })
})

describe("errorResponse", () => {
  test("wraps code and message in an error envelope", () => {
    const result = errorResponse("NOT_FOUND", "리소스를 찾을 수 없습니다")

    expect(result).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "리소스를 찾을 수 없습니다" },
    })
  })
})

describe("jsonSuccess", () => {
  test("returns a Response with success envelope and 200 by default", async () => {
    const response = jsonSuccess({ id: "1" })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { id: "1" },
    })
  })

  test("honors a custom status code", () => {
    const response = jsonSuccess({ id: "1" }, { status: 201 })

    expect(response.status).toBe(201)
  })
})

describe("jsonError", () => {
  test("returns a Response with error envelope and given status", async () => {
    const response = jsonError("VALIDATION_ERROR", "잘못된 입력", {
      status: 422,
    })

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "잘못된 입력" },
    })
  })

  test("defaults to status 500", () => {
    const response = jsonError("INTERNAL_ERROR", "서버 오류")

    expect(response.status).toBe(500)
  })
})
