import type { Me } from './api';



export type PermissionCode = string;



const ROLE_SHELL: Record<string, string> = {

  HOUSEKEEPER: '/h',

  SUPERVISOR: '/s',

  RECEPTION: '/r',

  ADMIN: '/a',

  TECHNICIAN: '/t',

};



export type NavItem = {

  href: string;

  labelKey: string;

  permission: PermissionCode;

};



export const RECEPTION_NAV: NavItem[] = [

  { href: '/r', labelKey: 'dashboard', permission: 'SERVICE_REQUEST_READ' },

  { href: '/r/floor-plan', labelKey: 'floorPlan', permission: 'FLOOR_PLAN_READ' },

  { href: '/r/rooms', labelKey: 'rooms', permission: 'ROOMS_READ' },

  { href: '/r/arrivals', labelKey: 'arrivals', permission: 'RESERVATIONS_READ' },

  { href: '/r/arrival-check', labelKey: 'arrivalCheck', permission: 'ARRIVAL_CHECK' },

  { href: '/r/in-house', labelKey: 'inHouse', permission: 'RESERVATIONS_READ' },

  { href: '/r/reservations', labelKey: 'reservations', permission: 'RESERVATIONS_READ' },

  { href: '/r/requests', labelKey: 'serviceRequests', permission: 'SERVICE_REQUEST_READ' },

  { href: '/r/chat', labelKey: 'chat', permission: 'TEAM_CHAT_READ' },

  { href: '/r/lost', labelKey: 'lostFound', permission: 'LOST_FOUND_READ' },

  { href: '/r/damages', labelKey: 'damageReports', permission: 'DAMAGE_REPORT_READ' },

  { href: '/r/guides', labelKey: 'guides', permission: 'GUIDE_READ' },

  { href: '/r/schichtplan', labelKey: 'schichtplan', permission: 'SHIFT_READ' },

  { href: '/r/puzzle', labelKey: 'puzzle', permission: 'SETTINGS_READ' },

  { href: '/r/monitor-map', labelKey: 'monitorMap', permission: 'MONITOR_MAP_READ' },

  { href: '/r/room-management', labelKey: 'roomManagement', permission: 'ROOM_MANAGEMENT_READ' },

  { href: '/r/front-office/backup', labelKey: 'frontOfficeBackup', permission: 'RESERVATIONS_READ' },

];



export const RECEPTION_MOBILE_NAV: NavItem[] = [

  { href: '/r/m/requests', labelKey: 'requests', permission: 'SERVICE_REQUEST_READ' },

  { href: '/r/m/rooms', labelKey: 'rooms', permission: 'ROOMS_READ' },

  { href: '/r/m/chat', labelKey: 'chat', permission: 'TEAM_CHAT_READ' },

  { href: '/r/m/lost', labelKey: 'lostFound', permission: 'LOST_FOUND_READ' },

];



export const SUPERVISOR_NAV: NavItem[] = [

  { href: '/s', labelKey: 'dashboard', permission: 'SERVICE_REQUEST_READ' },

  { href: '/s/floor-plan', labelKey: 'floorPlan', permission: 'FLOOR_PLAN_READ' },

  { href: '/s/board', labelKey: 'assignmentBoard', permission: 'ASSIGNMENT_READ' },

  { href: '/s/departures', labelKey: 'departures', permission: 'RESERVATIONS_READ' },

  { href: '/s/room-tasks', labelKey: 'roomTasks', permission: 'ROOMS_READ' },

  { href: '/s/requests', labelKey: 'requests', permission: 'SERVICE_REQUEST_READ' },

  { href: '/s/chat', labelKey: 'chat', permission: 'TEAM_CHAT_READ' },

  { href: '/s/lost', labelKey: 'lostFound', permission: 'LOST_FOUND_READ' },

  { href: '/s/damages', labelKey: 'damageReports', permission: 'DAMAGE_REPORT_READ' },

  { href: '/s/schichtplan', labelKey: 'schichtplan', permission: 'SHIFT_READ' },

  { href: '/s/performance', labelKey: 'performance', permission: 'ANALYTICS_READ' },

  { href: '/s/monitor-map', labelKey: 'monitorMap', permission: 'MONITOR_MAP_READ' },

  { href: '/s/room-management', labelKey: 'roomManagement', permission: 'ROOM_MANAGEMENT_READ' },

];



export const HOUSEKEEPER_NAV: NavItem[] = [

  { href: '/h', labelKey: 'rooms', permission: 'ROOMS_READ' },

  { href: '/h/requests', labelKey: 'requests', permission: 'SERVICE_REQUEST_READ' },

  { href: '/h/chat', labelKey: 'chat', permission: 'TEAM_CHAT_READ' },

];



export const TECHNICIAN_NAV: NavItem[] = [

  { href: '/t/maintenance', labelKey: 'maintenance', permission: 'DAMAGE_REPORT_READ' },

  { href: '/t/rooms', labelKey: 'rooms', permission: 'ROOMS_READ' },

  { href: '/t/chat', labelKey: 'chat', permission: 'TEAM_CHAT_READ' },

];



/** Extra reception routes not in the main nav. */

const RECEPTION_ROUTE_PERMISSIONS: Array<{ prefix: string; permission: PermissionCode }> = [

  { prefix: '/r/reservations/', permission: 'RESERVATIONS_READ' },

  { prefix: '/r/arrival-check/runs/', permission: 'ARRIVAL_CHECK' },

  { prefix: '/r/guides/', permission: 'GUIDE_READ' },

  { prefix: '/r/room-management/', permission: 'ROOM_MANAGEMENT_READ' },

  { prefix: '/r/front-office/', permission: 'RESERVATIONS_READ' },

  { prefix: '/r/m/', permission: '' },

];



export function userPermissions(user: Me | null | undefined): Set<string> {

  return new Set(user?.permissions ?? []);

}



export function isAdmin(user: Me | null | undefined): boolean {

  return user?.role === 'ADMIN';

}



export function hasPermission(user: Me | null | undefined, code: PermissionCode): boolean {

  if (!user) return false;

  if (isAdmin(user)) return true;

  return userPermissions(user).has(code);

}



export function hasAnyPermission(user: Me | null | undefined, codes: PermissionCode[]): boolean {

  if (!user) return false;

  if (isAdmin(user)) return true;

  const perms = userPermissions(user);

  return codes.some((c) => perms.has(c));

}



export function filterNavByPermission<T extends NavItem>(user: Me | null | undefined, nav: T[]): T[] {

  if (!user) return [];

  if (isAdmin(user)) return nav;

  return nav.filter((item) => hasPermission(user, item.permission));

}



export function getFirstAllowedPath(user: Me | null | undefined, nav: NavItem[]): string | null {

  const allowed = filterNavByPermission(user, nav);

  return allowed[0]?.href ?? null;

}



export function getReceptionRoutePermission(pathname: string): PermissionCode | null {

  if (pathname.startsWith('/r/m/')) {

    const mobile = RECEPTION_MOBILE_NAV.find(

      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),

    );

    return mobile?.permission ?? null;

  }

  for (const { prefix, permission } of RECEPTION_ROUTE_PERMISSIONS) {

    if (prefix === '/r/m/' && pathname.startsWith(prefix)) continue;

    if (pathname.startsWith(prefix) && permission) return permission;

  }

  const exact = RECEPTION_NAV.find(

    (item) => pathname === item.href || (item.href !== '/r' && pathname.startsWith(`${item.href}/`)),

  );

  if (exact) return exact.permission;

  if (pathname === '/r') return 'SERVICE_REQUEST_READ';

  return null;

}



export function getSupervisorRoutePermission(pathname: string): PermissionCode | null {

  const item = SUPERVISOR_NAV.find(

    (n) => pathname === n.href || (n.href !== '/s' && pathname.startsWith(`${n.href}/`)),

  );

  if (item) return item.permission;

  if (pathname === '/s') return 'SERVICE_REQUEST_READ';

  return null;

}



export function getHousekeeperRoutePermission(pathname: string): PermissionCode | null {

  const item = HOUSEKEEPER_NAV.find(

    (n) => pathname === n.href || (n.href !== '/h' && pathname.startsWith(`${n.href}/`)),

  );

  if (item) return item.permission;

  if (pathname === '/h') return 'ROOMS_READ';

  return null;

}



export function getTechnicianRoutePermission(pathname: string): PermissionCode | null {

  const item = TECHNICIAN_NAV.find(

    (n) => pathname === n.href || pathname.startsWith(`${n.href}/`),

  );

  return item?.permission ?? null;

}



export function hasAnyReceptionPermission(user: Me | null | undefined): boolean {

  if (!user) return false;

  if (isAdmin(user)) return true;

  const codes = new Set(RECEPTION_NAV.map((n) => n.permission));

  RECEPTION_MOBILE_NAV.forEach((n) => codes.add(n.permission));

  return hasAnyPermission(user, Array.from(codes));

}



export function hasAnySupervisorPermission(user: Me | null | undefined): boolean {

  if (!user) return false;

  if (isAdmin(user)) return true;

  return hasAnyPermission(

    user,

    SUPERVISOR_NAV.map((n) => n.permission),

  );

}



export function hasAnyHousekeeperPermission(user: Me | null | undefined): boolean {

  if (!user) return false;

  if (isAdmin(user)) return true;

  return hasAnyPermission(

    user,

    HOUSEKEEPER_NAV.map((n) => n.permission),

  );

}



export function hasAnyTechnicianPermission(user: Me | null | undefined): boolean {

  if (!user) return false;

  if (isAdmin(user)) return true;

  return hasAnyPermission(

    user,

    TECHNICIAN_NAV.map((n) => n.permission),

  );

}



export function getHomePath(user: Me | null | undefined): string {

  if (!user) return '/login';

  const shell = ROLE_SHELL[user.role] ?? '/login';

  if (user.role === 'ADMIN') return '/a';



  if (user.role === 'RECEPTION') {

    return getFirstAllowedPath(user, RECEPTION_NAV) ?? '/login';

  }

  if (user.role === 'SUPERVISOR') {

    return getFirstAllowedPath(user, SUPERVISOR_NAV) ?? '/login';

  }

  if (user.role === 'HOUSEKEEPER') {

    return getFirstAllowedPath(user, HOUSEKEEPER_NAV) ?? '/login';

  }

  if (user.role === 'TECHNICIAN') {

    return getFirstAllowedPath(user, TECHNICIAN_NAV) ?? '/login';

  }



  return shell;

}


