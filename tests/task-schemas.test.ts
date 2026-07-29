import { describe, expect, it } from "vitest"

import { updateTaskSchema } from "../src/modules/tasks/tasks.schemas.js"

describe("updateTaskSchema", () => {
  it("permite remover o prazo de uma tarefa", () => {
    expect(updateTaskSchema.parse({ clearDueDate: true })).toEqual({ clearDueDate: true })
  })

  it("impede limpar e definir o prazo na mesma atualização", () => {
    const result = updateTaskSchema.safeParse({
      clearDueDate: true,
      dueDate: "2026-07-30",
    })

    expect(result.success).toBe(false)
  })
})

