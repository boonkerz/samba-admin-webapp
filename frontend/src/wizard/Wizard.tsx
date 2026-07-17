import { useState } from "react";
import { WizardLayout } from "./WizardLayout";
import { StepPackages } from "./StepPackages";
import { StepProvisionParams } from "./StepProvisionParams";
import { StepProvisionRun } from "./StepProvisionRun";
import { StepPrintServer } from "./StepPrintServer";
import { StepFinish } from "./StepFinish";

type Phase = "packages" | "provision-params" | "provision-run" | "print-server" | "finish";

export function Wizard({ onFinished }: { onFinished: () => void }) {
  const [phase, setPhase] = useState<Phase>("packages");
  const [provisionJobId, setProvisionJobId] = useState<string>();

  const activeStep =
    phase === "packages" ? 0 : phase === "provision-params" || phase === "provision-run" ? 1 : phase === "print-server" ? 2 : 3;

  return (
    <WizardLayout activeStep={activeStep}>
      {phase === "packages" && <StepPackages onDone={() => setPhase("provision-params")} />}
      {phase === "provision-params" && (
        <StepProvisionParams
          onStarted={(jobId) => {
            setProvisionJobId(jobId);
            setPhase("provision-run");
          }}
        />
      )}
      {phase === "provision-run" && provisionJobId && (
        <StepProvisionRun jobId={provisionJobId} onDone={() => setPhase("print-server")} />
      )}
      {phase === "print-server" && <StepPrintServer onDone={() => setPhase("finish")} />}
      {phase === "finish" && <StepFinish onContinue={onFinished} />}
    </WizardLayout>
  );
}
