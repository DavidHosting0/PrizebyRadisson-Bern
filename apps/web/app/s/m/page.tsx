'use client';

import { CleaningTasksHome } from '@/components/CleaningTasksHome';

export default function SupervisorMobileHomePage() {
  return (
    <CleaningTasksHome
      paths={{
        room: (id) => `/s/m/room/${id}`,
        inspect: (id) => `/s/m/inspections/${id}`,
        requests: '/s/m/requests',
      }}
    />
  );
}
