import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { DemoController } from "./demo.controller.js";

describe("DemoController", () => {
  const controller = new DemoController();

  it("DEMO 상태와 공식 판정 비활성화를 노출", () => {
    expect(controller.health()).toMatchObject({
      status: "ok",
      mode: "demo",
      officialGraduationDecision: false,
    });
  });

  it("계획 과목과 인정 가정을 엔진 입력으로 전달", () => {
    const response = controller.audit({ includeCourse: true, dualRecognition: true });
    expect(response.result.projectedTotalCreditMilli).toBe(93_000);
    expect(response.result.assessment).toBe("INDETERMINATE");
    expect(response.explanation.join(" ")).toContain("양쪽 인정 DEMO 가정");
  });

  it("알 수 없는 필드나 잘못된 타입을 거절", () => {
    expect(() => controller.audit({ includeCourse: "yes" })).toThrow(BadRequestException);
    expect(() => controller.audit({ includeCourse: true, officialDecision: true })).toThrow(
      BadRequestException,
    );
  });
});
