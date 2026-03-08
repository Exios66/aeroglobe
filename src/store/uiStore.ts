import { create } from 'zustand';

interface UiStoreState {
  sidebarOpen: boolean;
  filterPanelOpen: boolean;
  globeSkin: 'dark' | 'light';
  playbackTime: Date | null;
  timelineOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
  setFilterPanelOpen: (value: boolean) => void;
  setGlobeSkin: (value: 'dark' | 'light') => void;
  setPlaybackTime: (value: Date | null) => void;
  setTimelineOpen: (value: boolean) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  sidebarOpen: true,
  filterPanelOpen: true,
  globeSkin: 'dark',
  playbackTime: null,
  timelineOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setFilterPanelOpen: (filterPanelOpen) => set({ filterPanelOpen }),
  setGlobeSkin: (globeSkin) => set({ globeSkin }),
  setPlaybackTime: (playbackTime) => set({ playbackTime }),
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
}));
