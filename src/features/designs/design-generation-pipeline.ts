import type { PipelineStep } from "@/types";
import { PIPELINE_STEPS } from "@/types";
import { logger } from "@/lib/logging/logger";
import type { PipelineContext } from "@/features/designs/pipeline-context";

export type StepStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED"
  | "PENDING";

export interface PipelineStepState {
  step: PipelineStep;
  status: StepStatus;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  correlationId?: string;
}

export interface PipelineState {
  idempotencyKey: string;
  steps: PipelineStepState[];
  currentStep?: PipelineStep;
}

export interface PipelineExecuteOptions {
  onlyStep?: PipelineStep;
  onlySlide?: number;
  force?: boolean;
}

export type StepLogEvent = {
  step: PipelineStep;
  status: StepStatus;
  correlationId: string;
  idempotencyKey: string;
  durationMs?: number;
  error?: string;
  onlySlide?: number;
};

export type StepRunner = (
  step: PipelineStep,
  ctx: PipelineContext,
  options: PipelineExecuteOptions,
) => Promise<void>;

export type StepLogWriter = (event: StepLogEvent) => void | Promise<void>;

const globalCompletedKeys = new Map<string, true>();

export function clearPipelineIdempotencyStore(): void {
  globalCompletedKeys.clear();
}

export function createInitialPipelineState(
  idempotencyKey: string,
): PipelineState {
  return {
    idempotencyKey,
    steps: PIPELINE_STEPS.map((step) => ({
      step,
      status: "PENDING",
    })),
  };
}

const SLIDE_SCOPED_STEPS: readonly PipelineStep[] = [
  "TEMPLATE_RENDER",
  "IMAGE_EXPORT",
  "STORAGE_UPLOAD",
  "PREVIEW_READY",
];

export class DesignGenerationPipeline {
  constructor(
    private readonly runStep: StepRunner,
    private readonly onStepLog?: StepLogWriter,
  ) {}

  async resume(
    state: PipelineState,
    ctx: PipelineContext,
    options?: Omit<PipelineExecuteOptions, "force">,
  ): Promise<PipelineState> {
    return this.execute(state, ctx, { ...options, force: false });
  }

  async execute(
    state: PipelineState,
    ctx: PipelineContext,
    options: PipelineExecuteOptions = {},
  ): Promise<PipelineState> {
    const key = state.idempotencyKey;
    const targeted =
      Boolean(options.onlyStep) ||
      Boolean(options.onlySlide) ||
      Boolean(options.force);

    if (globalCompletedKeys.has(key) && !targeted) {
      logger.info("Pipeline skipped due to idempotency", {
        idempotencyKey: key,
        correlationId: ctx.correlationId,
      });
      return state;
    }

    const next: PipelineState = {
      ...state,
      steps: state.steps.map((s) => ({ ...s })),
    };

    ctx.onlySlide = options.onlySlide;

    for (const stepState of next.steps) {
      if (options.onlyStep && stepState.step !== options.onlyStep) {
        continue;
      }

      if (options.onlySlide) {
        if (!SLIDE_SCOPED_STEPS.includes(stepState.step)) {
          continue;
        }
      } else if (!options.force && stepState.status === "SUCCESS") {
        continue;
      }

      next.currentStep = stepState.step;
      stepState.status = "QUEUED";
      stepState.correlationId = ctx.correlationId;
      await this.emitLog({
        step: stepState.step,
        status: "QUEUED",
        correlationId: ctx.correlationId,
        idempotencyKey: key,
        onlySlide: options.onlySlide,
      });

      const started = Date.now();
      stepState.startedAt = new Date(started).toISOString();
      stepState.status = "RUNNING";
      await this.emitLog({
        step: stepState.step,
        status: "RUNNING",
        correlationId: ctx.correlationId,
        idempotencyKey: key,
        onlySlide: options.onlySlide,
      });

      logger.info("Pipeline step start", {
        step: stepState.step,
        correlationId: ctx.correlationId,
      });

      try {
        await this.runStep(stepState.step, ctx, options);
        const completed = Date.now();
        stepState.status = "SUCCESS";
        stepState.completedAt = new Date(completed).toISOString();
        stepState.durationMs = completed - started;
        stepState.error = undefined;
        await this.emitLog({
          step: stepState.step,
          status: "SUCCESS",
          correlationId: ctx.correlationId,
          idempotencyKey: key,
          durationMs: stepState.durationMs,
          onlySlide: options.onlySlide,
        });
        logger.info("Pipeline step success", {
          step: stepState.step,
          durationMs: stepState.durationMs,
        });
      } catch (error) {
        const completed = Date.now();
        stepState.status = "FAILED";
        stepState.completedAt = new Date(completed).toISOString();
        stepState.durationMs = completed - started;
        stepState.error = error instanceof Error ? error.message : "UNKNOWN";
        await this.emitLog({
          step: stepState.step,
          status: "FAILED",
          correlationId: ctx.correlationId,
          idempotencyKey: key,
          durationMs: stepState.durationMs,
          error: stepState.error,
          onlySlide: options.onlySlide,
        });
        logger.error("Pipeline step failed", {
          step: stepState.step,
          error: stepState.error,
        });
        return next;
      }
    }

    const allDone = next.steps.every((s) => s.status === "SUCCESS");
    if (allDone) {
      const checksums = ctx.slides
        .map((s) => s.export?.checksum)
        .filter((c): c is string => Boolean(c));
      ctx.version += 1;
      ctx.versions.push({
        version: ctx.version,
        completedAt: new Date().toISOString(),
        checksums,
      });
      globalCompletedKeys.set(key, true);
    }

    return next;
  }

  private async emitLog(event: StepLogEvent): Promise<void> {
    if (!this.onStepLog) return;
    await this.onStepLog(event);
  }
}
