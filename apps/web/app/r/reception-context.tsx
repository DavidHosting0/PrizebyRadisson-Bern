'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type Ctx = {
  newRequestOpen: boolean;
  openNewRequest: () => void;
  closeNewRequest: () => void;
  roomPanelId: string | null;
  openRoom: (id: string | null) => void;
};

const ReceptionCtx = createContext<Ctx | null>(null);

export function ReceptionUiProvider({ children }: { children: ReactNode }) {
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [roomPanelId, setRoomPanelId] = useState<string | null>(null);

  const openNewRequest = useCallback(() => setNewRequestOpen(true), []);
  const closeNewRequest = useCallback(() => setNewRequestOpen(false), []);
  const openRoom = useCallback((id: string | null) => setRoomPanelId(id), []);

  const value = useMemo(
    () => ({
      newRequestOpen,
      openNewRequest,
      closeNewRequest,
      roomPanelId,
      openRoom,
    }),
    [newRequestOpen, openNewRequest, closeNewRequest, roomPanelId, openRoom],
  );

  return <ReceptionCtx.Provider value={value}>{children}</ReceptionCtx.Provider>;
}

export function useReceptionUi() {
  const v = useContext(ReceptionCtx);
  if (!v) throw new Error('useReceptionUi outside ReceptionUiProvider');
  return v;
}
