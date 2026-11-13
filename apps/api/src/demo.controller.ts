import { auditScenario, explainDemoResult } from "@hansung/academic-engine";
import { createDemoAuditInput } from "@hansung/contracts";
import { BadRequestException, Body, Controller, Get, Post } from "@nestjs/common";
import { z } from "zod";

const auditRequestSchema = z
  .object({
    includeCourse: z.boolean().optional().default(false),
    dualRecognition: z.boolean().optional().default(false),
  })
  .strict();

@Controller()
export class DemoController {
  @Get("health")
  health() {
    return {
      status: "ok",
      mode: "demo",
      officialGraduationDecision: false,
      rulePack: "DEMO-HANSUNG-DUALTRACK-v1",
    };
  }

  @Get("catalog/coverage")
  coverage() {
    return {
      investigationDate: "2026-09-22",
      tracks: { listed: 39, publicTableObserved: 34, requiresFollowUp: 5 },
      observations: { rows: 880, uniqueCourseCodes: 478 },
      publishedOfficialRulePacks: 0,
    };
  }

  @Post("demo/audit")
  audit(@Body() body: unknown) {
    const parsed = auditRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "INVALID_DEMO_AUDIT_REQUEST",
        issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
    const result = auditScenario(createDemoAuditInput(parsed.data));
    return { result, explanation: explainDemoResult(result) };
  }
}
