import { describe, expect, it } from "vitest"

import {
  completeTaskSchema,
  createTaskActivitySchema,
  updateTaskSchema,
} from "../src/modules/tasks/tasks.schemas.js"

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

describe("registros de andamento da tarefa", () => {
  it("normaliza uma nota válida e exige conteúdo relevante", () => {
    expect(createTaskActivitySchema.parse({ content: "  Documentação conferida.  " })).toEqual({
      content: "Documentação conferida.",
    })
    expect(createTaskActivitySchema.safeParse({ content: " " }).success).toBe(false)
  })

  it("permite concluir a tarefa com ou sem observação final", () => {
    expect(completeTaskSchema.parse({})).toEqual({})
    expect(completeTaskSchema.parse({ content: "  Entrega validada.  " })).toEqual({
      content: "Entrega validada.",
    })
  })
})
