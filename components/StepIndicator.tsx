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
          className={`w-2.5 h-2.5 rounded-full transition-colors ${
            step === currentStep
              ? 'bg-green-500'
              : step < currentStep
              ? 'bg-green-300'
              : 'bg-gray-300'
          }`}
        />
      ))}
    </div>
  );
}
