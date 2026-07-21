import React, { useState, useEffect } from 'react';
import { Share2, PlusSquare, X, ArrowUpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function IOSInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    
    // Check standalone mode
    const isStandalone = 
      ('standalone' in window.navigator && (window.navigator as any).standalone) || 
      window.matchMedia('(display-mode: standalone)').matches;

    // Check localStorage if already dismissed
    const dismissed = localStorage.getItem('ios-pwa-prompt-dismissed');

    if (isIOS && !isStandalone && !dismissed) {
      // Small delay for better UX
      const timer = setTimeout(() => {
        setShow(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('ios-pwa-prompt-dismissed', 'true');
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-slate-900/30 backdrop-blur-xs">
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
          >
            {/* Header */}
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-600 p-2 rounded-xl text-white flex items-center justify-center">
                  <span className="text-xl font-bold">🏸</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base leading-tight">Install Badminton Split</h3>
                  <p className="text-xs text-slate-400 font-medium">Add to your iPhone Home Screen</p>
                </div>
              </div>
              <button 
                onClick={handleDismiss}
                className="bg-slate-100 hover:bg-slate-200 text-slate-500 p-1.5 rounded-full transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Explainer / Tutorial Steps */}
            <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 space-y-3.5">
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                Install this app on your iPhone to access it directly from your home screen, enable offline access, and use it in fullscreen mode:
              </p>

              <div className="space-y-3">
                {/* Step 1 */}
                <div className="flex items-start gap-3 text-xs">
                  <div className="bg-emerald-50 text-emerald-600 w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold mt-0.5">
                    1
                  </div>
                  <div className="text-slate-600 font-medium">
                    Tap the <span className="font-bold text-slate-800 inline-flex items-center gap-0.5 bg-slate-100 px-1.5 py-0.5 rounded-md">
                      <Share2 className="w-3.5 h-3.5 text-blue-500 shrink-0" /> Share
                    </span> button at the bottom of Safari.
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-3 text-xs">
                  <div className="bg-emerald-50 text-emerald-600 w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold mt-0.5">
                    2
                  </div>
                  <div className="text-slate-600 font-medium">
                    Scroll down and tap <span className="font-bold text-slate-800 inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded-md">
                      <PlusSquare className="w-3.5 h-3.5 text-slate-700 shrink-0" /> Add to Home Screen
                    </span>.
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-3 text-xs">
                  <div className="bg-emerald-50 text-emerald-600 w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold mt-0.5">
                    3
                  </div>
                  <div className="text-slate-600 font-medium">
                    Tap <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded-md">Add</span> in the top-right corner of the screen.
                  </div>
                </div>
              </div>
            </div>

            {/* Indicator of Safari share menu location */}
            <div className="text-center">
              <p className="text-[10px] text-slate-400 font-bold flex items-center justify-center gap-1">
                <ArrowUpCircle className="w-3.5 h-3.5 text-slate-400 animate-bounce" /> Works instantly with iPhone Safari
              </p>
            </div>

            {/* Action buttons */}
            <button
              onClick={handleDismiss}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-2xl text-xs transition duration-200 active:scale-[0.98] cursor-pointer shadow-md shadow-slate-200"
            >
              Maybe Later
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
