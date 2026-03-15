import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DriverLanguage } from '../i18n/translations';

interface DriverUxState {
  language: DriverLanguage;
  simpleMode: boolean;
  voiceGuidanceEnabled: boolean;
  guidedHintsEnabled: boolean;
  hasSeenVerifiedCelebration: boolean;
  hasCompletedFirstTour: boolean;
  tourReplayRequested: boolean;
  setLanguage: (language: DriverLanguage) => void;
  setSimpleMode: (enabled: boolean) => void;
  setVoiceGuidanceEnabled: (enabled: boolean) => void;
  setGuidedHintsEnabled: (enabled: boolean) => void;
  markVerifiedCelebrationSeen: () => void;
  completeFirstTour: () => void;
  requestTourReplay: () => void;
  clearTourReplay: () => void;
}

function detectDefaultLanguage(): DriverLanguage {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    if (locale.startsWith('kn')) {
      return 'kn';
    }
    if (locale.startsWith('hi')) {
      return 'hi';
    }
    return 'en';
  } catch {
    return 'en';
  }
}

export const useDriverUxStore = create<DriverUxState>()(
  persist(
    (set) => ({
      language: detectDefaultLanguage(),
      simpleMode: true,
      voiceGuidanceEnabled: true,
      guidedHintsEnabled: true,
      hasSeenVerifiedCelebration: false,
      hasCompletedFirstTour: false,
      tourReplayRequested: false,
      setLanguage(language) {
        set({ language });
      },
      setSimpleMode(enabled) {
        set({ simpleMode: enabled });
      },
      setVoiceGuidanceEnabled(enabled) {
        set({ voiceGuidanceEnabled: enabled });
      },
      setGuidedHintsEnabled(enabled) {
        set({ guidedHintsEnabled: enabled });
      },
      markVerifiedCelebrationSeen() {
        set({ hasSeenVerifiedCelebration: true });
      },
      completeFirstTour() {
        set({ hasCompletedFirstTour: true, tourReplayRequested: false });
      },
      requestTourReplay() {
        set({ tourReplayRequested: true });
      },
      clearTourReplay() {
        set({ tourReplayRequested: false });
      }
    }),
    {
      name: 'qargo-driver-ux-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        language: state.language,
        simpleMode: state.simpleMode,
        voiceGuidanceEnabled: state.voiceGuidanceEnabled,
        guidedHintsEnabled: state.guidedHintsEnabled,
        hasSeenVerifiedCelebration: state.hasSeenVerifiedCelebration,
        hasCompletedFirstTour: state.hasCompletedFirstTour
      })
    }
  )
);
