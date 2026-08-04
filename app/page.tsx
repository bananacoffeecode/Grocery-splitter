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

      {/* Dreamy gradient blobs floating behind everything */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="blob animate-float" style={{ width: 340, height: 340, top: -80, left: -90, background: '#8fb0ff' }} />
        <div className="blob animate-float" style={{ width: 300, height: 300, top: '30%', right: -110, background: '#d5a8ff', animationDelay: '-3s' }} />
        <div className="blob animate-float" style={{ width: 320, height: 320, bottom: -120, left: '20%', background: '#ffb3d6', animationDelay: '-6s' }} />
      </div>

      <main className="relative z-10 min-h-screen flex flex-col max-w-lg mx-auto px-5">
        <div className="pt-8 pb-2">
          <h1 className="text-2xl font-bold text-center tracking-tight">
            <span className="gradient-text">Tally</span>
          </h1>
          <StepIndicator currentStep={state.step} totalSteps={5} />
        </div>
        <div key={state.step} className="flex-1 pb-10 animate-fade-in-up">
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
