interface Props {
  currentStep: number;
  totalSteps: number;
}

export default function StepIndicator({ currentStep, totalSteps }: Props) {
  return (
    <div className="flex justify-center gap-2 mt-4">
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
        <div
          key={step}
          className="h-2 rounded-full transition-all duration-300"
          style={
            step === currentStep
              ? { width: 22, background: '#8b6cff' }
              : step < currentStep
              ? { width: 8, background: '#c4bdf0' }
              : { width: 8, background: '#dcdae8' }
          }
        />
      ))}
    </div>
  );
}
