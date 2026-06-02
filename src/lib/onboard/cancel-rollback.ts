// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Rollback guard for a sandbox that was created during onboarding but whose
 * onboarding was cancelled before the policy-preset step was confirmed.
 *
 * Without this, pressing Ctrl+C at the `[8/8] Policy presets` screen leaves a
 * fully created OpenShell container registered as the default sandbox even
 * though no policies were ever applied (#4614).
 *
 * The guard is deliberately a two-key gate — it only fires when BOTH:
 *   - a freshly-created sandbox is `arm()`ed (set after createSandbox succeeds), AND
 *   - the operator actually cancelled via `markCancelled()` (the policy-step
 *     prompts call this on Ctrl+C / SIGTERM before exiting).
 *
 * This keeps every other `process.exit(1)` failure path untouched: a genuine
 * build/verify failure exits without `markCancelled()`, so the sandbox it left
 * behind is preserved exactly as before. Only an explicit cancel rolls back.
 */
export interface SandboxCancelRollbackDeps {
  /** Delete the OpenShell sandbox container. Returns true when the delete succeeded. */
  deleteSandboxContainer(sandboxName: string): boolean;
  /** Remove the sandbox entry from the NemoClaw registry (clears default). */
  removeSandboxFromRegistry(sandboxName: string): void;
  /** Emit an operator-facing line (stderr). */
  log(message: string): void;
}

export interface SandboxCancelRollback {
  /** Arm rollback for a just-created sandbox. */
  arm(sandboxName: string): void;
  /** Disarm once the sandbox is past the cancellable window (policies confirmed). */
  disarm(): void;
  /** Record that the operator cancelled at a cancellable step. */
  markCancelled(): void;
  /** Run the rollback iff armed AND cancelled. Idempotent. */
  runIfArmed(): void;
  /** Test/introspection helper. */
  isArmed(): boolean;
}

export function buildCancelRollbackMessage(sandboxName: string, deleteSucceeded: boolean): string[] {
  if (deleteSucceeded) {
    return [
      "",
      `  Onboarding cancelled — removed incomplete sandbox '${sandboxName}' (no policy presets were applied).`,
    ];
  }
  return [
    "",
    `  Onboarding cancelled — unregistered incomplete sandbox '${sandboxName}'.`,
    "  The sandbox container may still be running. Remove it with:",
    `    openshell sandbox delete "${sandboxName}"`,
  ];
}

export function createSandboxCancelRollback(
  deps: SandboxCancelRollbackDeps,
): SandboxCancelRollback {
  let armedSandboxName: string | null = null;
  let cancelRequested = false;
  let done = false;

  return {
    arm(sandboxName: string): void {
      armedSandboxName = sandboxName;
    },
    disarm(): void {
      armedSandboxName = null;
    },
    markCancelled(): void {
      cancelRequested = true;
    },
    isArmed(): boolean {
      return armedSandboxName !== null;
    },
    runIfArmed(): void {
      if (done || !cancelRequested || armedSandboxName === null) return;
      done = true;
      const sandboxName = armedSandboxName;
      armedSandboxName = null;

      // Delete the container first, then unregister regardless of the delete
      // result — leaving a registry entry pointing at a half-built sandbox is
      // worse than an orphaned container the operator can clean up manually.
      const deleteSucceeded = deps.deleteSandboxContainer(sandboxName);
      deps.removeSandboxFromRegistry(sandboxName);
      for (const line of buildCancelRollbackMessage(sandboxName, deleteSucceeded)) {
        deps.log(line);
      }
    },
  };
}
