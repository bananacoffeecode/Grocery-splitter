'use client';

import React, { useState } from 'react';
import { Step } from '@/types';
import { AppProvider, useApp } from '@/lib/AppContext';
import StepIndicator from '@/components/StepIndicator';
import UploadStep from '@/components/UploadStep';
import ReviewStep from '@/components/ReviewStep';
import PeopleStep from '@/components/PeopleStep';
import AssignStep from '@/components/AssignStep';
import BreakdownStep from '@/components/BreakdownStep';
import SplashScreen from '@/components/SplashScreen';

function AppShell() {
  const { state } = useApp();
  const [showSplash, setShowSplash] = useState(true);

  const stepComponents: Record<Step, React.ReactNode> = {
    1: <UploadStep />,
    2: <ReviewStep />,
    3: <PeopleStep />,
    4: <AssignStep />,
    5: <BreakdownStep />,
  };

  return (
    <>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <main className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto px-4">
        <div className="pt-6 pb-2">
          <h1 className="text-xl font-bold text-gray-800 text-center">Grocery Splitter</h1>
          <StepIndicator currentStep={state.step} totalSteps={5} />
        </div>
        <div key={state.step} className="flex-1 pb-8 animate-fade-in-up">
          {stepComponents[state.step]}
        </div>
      </main>
    </>
  );
}

export default function Home() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
