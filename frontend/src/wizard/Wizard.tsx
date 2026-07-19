import { useState } from "react";
import { WizardLayout } from "./WizardLayout";
import { StepPackages } from "./StepPackages";
import { StepModeSelect } from "./StepModeSelect";
import { StepProvisionParams } from "./StepProvisionParams";
import { StepProvisionRun } from "./StepProvisionRun";
import { StepJoinParams } from "./StepJoinParams";
import { StepJoinRun } from "./StepJoinRun";
import { StepRestoreParams } from "./StepRestoreParams";
import { StepRestoreRun } from "./StepRestoreRun";
import { StepPrintServer } from "./StepPrintServer";
import { StepFinish } from "./StepFinish";

type Phase =
  | "packages"
  | "mode-select"
  | "provision-params"
  | "provision-run"
  | "join-params"
  | "join-run"
  | "restore-params"
  | "restore-run"
  | "print-server"
  | "finish";

const CONFIG_PHASES = new Set<Phase>([
  "mode-select",
  "provision-params",
  "provision-run",
  "join-params",
  "join-run",
  "restore-params",
  "restore-run",
]);

export function Wizard({ onFinished }: { onFinished: () => void }) {
  const [phase, setPhase] = useState<Phase>("packages");
  const [jobId, setJobId] = useState<string>();

  const activeStep = phase === "packages" ? 0 : CONFIG_PHASES.has(phase) ? 1 : phase === "print-server" ? 2 : 3;

  return (
    <WizardLayout activeStep={activeStep}>
      {phase === "packages" && <StepPackages onDone={() => setPhase("mode-select")} />}
      {phase === "mode-select" && (
        <StepModeSelect
          onSelect={(mode) => setPhase(mode === "provision" ? "provision-params" : mode === "join" ? "join-params" : "restore-params")}
        />
      )}
      {phase === "provision-params" && (
        <StepProvisionParams
          onStarted={(id) => {
            setJobId(id);
            setPhase("provision-run");
          }}
        />
      )}
      {phase === "provision-run" && jobId && <StepProvisionRun jobId={jobId} onDone={() => setPhase("print-server")} />}
      {phase === "join-params" && (
        <StepJoinParams
          onStarted={(id) => {
            setJobId(id);
            setPhase("join-run");
          }}
        />
      )}
      {phase === "join-run" && jobId && <StepJoinRun jobId={jobId} onDone={() => setPhase("print-server")} />}
      {phase === "restore-params" && (
        <StepRestoreParams
          onStarted={(id) => {
            setJobId(id);
            setPhase("restore-run");
          }}
        />
      )}
      {phase === "restore-run" && jobId && <StepRestoreRun jobId={jobId} onDone={() => setPhase("print-server")} />}
      {phase === "print-server" && <StepPrintServer onDone={() => setPhase("finish")} />}
      {phase === "finish" && <StepFinish onContinue={onFinished} />}
    </WizardLayout>
  );
}
