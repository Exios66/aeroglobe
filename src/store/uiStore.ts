import { create } from 'zustand';
import { DEFAULT_PLAYBACK_SPEED, type PlaybackSpeed } from '../utils/playback';

/** Phone layouts start with the map clear. Desktop keeps both panels open. */
function panelsOpenByDefault(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return !window.matchMedia('(max-width: 767px)').matches;
}

interface UiStoreState {
  sidebarOpen: boolean;
  filterPanelOpen: boolean;
  globeSkin: 'dark' | 'light';
  playbackTime: Date | null;
  timelineOpen: boolean;
  followFlight: boolean;
  playbackPlaying: boolean;
  playbackSpeed: PlaybackSpeed;
  dataDays: { date: string; source: string }[];
  dayHours: number[];
  loadedHour: number | null;
  selectedHour: number | null;
  selectedDataDay: string | null;
  setSidebarOpen: (value: boolean) => void;
  setFilterPanelOpen: (value: boolean) => void;
  setGlobeSkin: (value: 'dark' | 'light') => void;
  setPlaybackTime: (value: Date | null) => void;
  setTimelineOpen: (value: boolean) => void;
  setFollowFlight: (value: boolean) => void;
  setPlaybackPlaying: (value: boolean) => void;
  setPlaybackSpeed: (value: PlaybackSpeed) => void;
  setDataDays: (value: { date: string; source: string }[]) => void;
  setDayHours: (value: number[]) => void;
  setLoadedHour: (value: number | null) => void;
  setSelectedHour: (value: number | null) => void;
  setSelectedDataDay: (value: string | null) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  sidebarOpen: panelsOpenByDefault(),
  filterPanelOpen: panelsOpenByDefault(),
  globeSkin: 'dark',
  playbackTime: null,
  timelineOpen: false,
  followFlight: false,
  playbackPlaying: false,
  playbackSpeed: DEFAULT_PLAYBACK_SPEED,
  dataDays: [],
  dayHours: [],
  loadedHour: null,
  selectedHour: null,
  selectedDataDay: null,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setFilterPanelOpen: (filterPanelOpen) => set({ filterPanelOpen }),
  setGlobeSkin: (globeSkin) => set({ globeSkin }),
  setPlaybackTime: (playbackTime) => set({ playbackTime }),
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  setFollowFlight: (followFlight) => set({ followFlight }),
  setPlaybackPlaying: (playbackPlaying) => set({ playbackPlaying }),
  /** Sets playback speed in recorded seconds per real second. */
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  setDataDays: (dataDays) => set({ dataDays }),
  setDayHours: (dayHours) => set({ dayHours }),
  setLoadedHour: (loadedHour) => set({ loadedHour }),
  setSelectedHour: (selectedHour) => set({ selectedHour, playbackPlaying: false }),
  setSelectedDataDay: (selectedDataDay) => set({
    selectedDataDay,
    selectedHour: null,
    playbackTime: null,
    playbackPlaying: false,
  }),
}));
