import { create } from 'zustand';

interface UiStoreState {
  sidebarOpen: boolean;
  filterPanelOpen: boolean;
  globeSkin: 'dark' | 'light';
  playbackTime: Date | null;
  timelineOpen: boolean;
  followFlight: boolean;
  playbackPlaying: boolean;
  dataDays: { date: string; source: string }[];
  selectedDataDay: string | null;
  setSidebarOpen: (value: boolean) => void;
  setFilterPanelOpen: (value: boolean) => void;
  setGlobeSkin: (value: 'dark' | 'light') => void;
  setPlaybackTime: (value: Date | null) => void;
  setTimelineOpen: (value: boolean) => void;
  setFollowFlight: (value: boolean) => void;
  setPlaybackPlaying: (value: boolean) => void;
  setDataDays: (value: { date: string; source: string }[]) => void;
  setSelectedDataDay: (value: string | null) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  sidebarOpen: true,
  filterPanelOpen: true,
  globeSkin: 'dark',
  playbackTime: null,
  timelineOpen: false,
  followFlight: false,
  playbackPlaying: false,
  dataDays: [],
  selectedDataDay: null,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setFilterPanelOpen: (filterPanelOpen) => set({ filterPanelOpen }),
  setGlobeSkin: (globeSkin) => set({ globeSkin }),
  setPlaybackTime: (playbackTime) => set({ playbackTime }),
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  setFollowFlight: (followFlight) => set({ followFlight }),
  setPlaybackPlaying: (playbackPlaying) => set({ playbackPlaying }),
  setDataDays: (dataDays) => set({ dataDays }),
  setSelectedDataDay: (selectedDataDay) => set({ selectedDataDay, playbackTime: null, playbackPlaying: false }),
}));
