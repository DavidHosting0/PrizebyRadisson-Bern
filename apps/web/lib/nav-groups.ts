import type { ComponentType } from 'react';

import type { NavItem } from '@/lib/permission-routes';

import { IconDash } from '@/components/nav/nav-icons';



export type NavGroupDef = {

  id: string;

  labelKey: string;

  hrefs: string[];

};



export type SidebarNavItem = NavItem & {

  label?: string;

  icon: ComponentType<{ className?: string }>;

};



export type SidebarNavGroup = {

  id: string;

  labelKey: string;

  label?: string;

  items: SidebarNavItem[];

};



export const RECEPTION_NAV_GROUPS: NavGroupDef[] = [

  {

    id: 'overview',

    labelKey: 'overview',

    hrefs: ['/r', '/r/floor-plan', '/r/rooms'],

  },

  {

    id: 'roomManagement',

    labelKey: 'roomManagement',

    hrefs: ['/r/room-management'],

  },

  {

    id: 'guests',

    labelKey: 'guests',

    hrefs: ['/r/arrivals', '/r/arrival-check', '/r/in-house', '/r/reservations'],

  },

  {

    id: 'operations',

    labelKey: 'operations',

    hrefs: ['/r/requests', '/r/chat', '/r/lost', '/r/damages'],

  },

  {

    id: 'frontOffice',

    labelKey: 'frontOffice',

    hrefs: ['/r/front-office/backup'],

  },

  {

    id: 'tools',

    labelKey: 'tools',

    hrefs: ['/r/guides', '/r/schichtplan', '/r/puzzle', '/r/monitor-map'],

  },

];



export const SUPERVISOR_NAV_GROUPS: NavGroupDef[] = [

  {

    id: 'overview',

    labelKey: 'overview',

    hrefs: ['/s', '/s/floor-plan', '/s/board', '/s/departures', '/s/room-tasks'],

  },

  {

    id: 'roomManagement',

    labelKey: 'roomManagement',

    hrefs: ['/s/room-management'],

  },

  {

    id: 'operations',

    labelKey: 'operations',

    hrefs: ['/s/requests', '/s/chat', '/s/lost', '/s/damages'],

  },

  {

    id: 'tools',

    labelKey: 'tools',

    hrefs: ['/s/schichtplan', '/s/performance', '/s/monitor-map'],

  },

];



export function buildSidebarGroups(

  groupDefs: NavGroupDef[],

  allowedNav: SidebarNavItem[],

  icons: Record<string, ComponentType<{ className?: string }>>,

): SidebarNavGroup[] {

  const byHref = new Map(allowedNav.map((item) => [item.href, item]));



  return groupDefs

    .map((group) => ({

      id: group.id,

      labelKey: group.labelKey,

      items: group.hrefs

        .map((href) => {

          const item = byHref.get(href);

          if (!item) return null;

          return { ...item, icon: icons[href] ?? IconDash };

        })

        .filter((item): item is SidebarNavItem => item !== null),

    }))

    .filter((group) => group.items.length > 0);

}



export function attachNavIcons(

  nav: (NavItem & { label?: string })[],

  icons: Record<string, ComponentType<{ className?: string }>>,

): SidebarNavItem[] {

  return nav.map((item) => ({

    ...item,

    icon: icons[item.href] ?? IconDash,

  }));

}


