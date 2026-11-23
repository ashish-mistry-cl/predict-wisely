import React, { useState, useEffect, useCallback } from 'react';
import { Smartphone, Maximize, RotateCw } from 'lucide-react';

interface RotateDevicePromptProps {
  onEnterFullscreen: () => void;
  isFullscreen: boolean;
}

export const RotateDevicePrompt: React.FC<RotateDevicePromptProps> = ({
  onEnterFullscreen,
  isFullscreen,
}) => {
  const [isPortrait, setIsPortrait] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const checkOrientation = useCallback(() => {
    // Check if device is in portrait orientation
    const isPortraitOrientation = window.innerHeight > window.innerWidth;
    
    // Check if it's a mobile device (by screen dimension or touch capability)
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileSize = window.innerWidth <= 1024 || window.innerHeight <= 1024;
    const isMobileDevice = isTouch || isMobileSize;

    const shouldShow = isPortraitOrientation && isMobileDevice;
    setIsPortrait(shouldShow);

    // If device was turned to landscape, reset dismissed flag so it triggers if turned back
    if (!isPortraitOrientation) {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', checkOrientation);
    }

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', checkOrientation);
      }
    };
  }, [checkOrientation]);

  if (!isPortrait || dismissed) {
    return null;
  }

  const handleAction = () => {
    onEnterFullscreen();
    // After entering fullscreen, check orientation again shortly
    setTimeout(checkOrientation, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-slate-950/95 backdrop-blur-2xl text-center select-none animate-fade-in">
      {/* Animated Phone Graphic */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-3xl bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 shadow-2xl shadow-amber-500/25">
          <Smartphone size={56} className="animate-phone-rotate" />
        </div>
        <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 p-2 rounded-full shadow-xl">
          <RotateCw size={18} className="animate-spin" style={{ animationDuration: '3s' }} />
        </div>
      </div>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-xs font-bold uppercase tracking-widest mb-3">
        Landscape Mode Required
      </div>

      <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 font-display mb-2">
        Please Rotate Your Device
      </h2>

      <p className="text-xs sm:text-sm text-slate-400 max-w-xs mb-8 leading-relaxed">
        Kachuful (Judgement) card table and live multiplayer seating are built for a wide landscape screen.
      </p>

      {/* Primary Action: Fullscreen & Auto-Rotate */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={handleAction}
          className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/30 active:scale-95 transition"
        >
          <Maximize size={18} />
          <span>{isFullscreen ? 'Rotate Device to Play' : 'Enter Fullscreen & Play'}</span>
        </button>

        <button
          onClick={() => setDismissed(true)}
          className="text-xs text-slate-500 hover:text-slate-300 transition py-2"
        >
          Continue in portrait anyway
        </button>
      </div>
    </div>
  );
};
