'use client';

import { CleaningTasksHome } from '@/components/CleaningTasksHome';

export default function HousekeeperRoomsPage() {
  return (
    <CleaningTasksHome
      paths={{
        room: (id) => `/h/room/${id}`,
        inspect: (id) => `/h/inspect/${id}`,
        requests: '/h/requests',
      }}
    />
  );
}
