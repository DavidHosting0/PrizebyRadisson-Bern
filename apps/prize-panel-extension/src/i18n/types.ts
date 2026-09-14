/** Flat param interpolation: "Hello {{name}}" + { name: "Ada" } */
export function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    params[key] != null ? String(params[key]) : `{{${key}}}`,
  );
}

export type ExtensionMessages = {
  common: {
    cancel: string;
    save: string;
    loading: string;
    ellipsis: string;
    error: string;
    retry: string;
    back: string;
    delete: string;
    edit: string;
    confirm: string;
  };
  nav: {
    categories: string;
    back: string;
    settings: string;
    logout: string;
    collapse: string;
    loadingApp: string;
    noPermission: string;
    loading: string;
    bernticketTitle: string;
    bernticketInfo: string;
    chatTitle: string;
    todoTitle: string;
    notesTitle: string;
    complaintsTitle: string;
    loansTitle: string;
    todoNoTasks: string;
    todoAllDone: string;
    todoOpenCount: string;
    notesNoneToday: string;
    notesAllDone: string;
    notesOpenOne: string;
    notesOpenCount: string;
    complaintsNoneToday: string;
    complaintsOneToday: string;
    complaintsCountToday: string;
    loansNoneToday: string;
    loansOneToday: string;
    loansCountToday: string;
    chatNoneToday: string;
    chatOneToday: string;
    chatCountToday: string;
  };
  auth: {
    signIn: string;
    email: string;
    password: string;
    rememberMe: string;
    signingIn: string;
    loginFailed: string;
    networkError: string;
  };
  settings: {
    title: string;
    chatNotifications: string;
    chatNotificationsHint: string;
    apiUrl: string;
    apiUrlHint: string;
    saveFailed: string;
    saved: string;
    cancel: string;
    save: string;
  };
  bernticket: {
    twoFaTitle: string;
    twoFaDescription: string;
    twoFaCodePlaceholder: string;
    twoFaError: string;
    twoFaConfirm: string;
    loginHint: string;
    email: string;
    password: string;
    loginError: string;
    loginSubmit: string;
    loginPending: string;
    logout: string;
    guestName: string;
    bookingNumber: string;
    otaNumber: string;
    validFrom: string;
    validTo: string;
    ticketsAmount: string;
    create: string;
    save: string;
    createError: string;
    saveError: string;
    title: string;
    copyCode: string;
    copied: string;
    noActivationCode: string;
    edit: string;
    invalidate: string;
    searchPlaceholder: string;
    search: string;
    newTicket: string;
    emptyHint: string;
    searching: string;
    searchError: string;
    notFound: string;
    createTicket: string;
  };
  handover: {
    title: string;
    essentialBadge: string;
    loading: string;
    loadError: string;
    retry: string;
    noTasks: string;
    nextDayHint: string;
    handoffButton: string;
    dialogTitle: string;
    dialogDescription: string;
    incompleteOptional: string;
    incompleteEssential: string;
    confirmLabel: string;
    confirm: string;
    pending: string;
    success: string;
    toggleError: string;
  };
  notes: {
    title: string;
    daysWithNotes: string;
    tabToday: string;
    tabBrowse: string;
    loading: string;
    emptyDays: string;
    emptyDay: string;
    backToDays: string;
    statusDone: string;
    statusInfo: string;
    editedSuffix: string;
    ariaMarkOpen: string;
    ariaMarkDone: string;
    edit: string;
    delete: string;
    save: string;
    schedule: string;
    targetDay: string;
    placeholder: string;
    placeholderFuture: string;
    today: string;
  };
  complaints: {
    newComplaint: string;
    categoryRoom: string;
    categoryOther: string;
    roomPlaceholder: string;
    incomplete: string;
    save: string;
    loading: string;
    roomLabel: string;
    resolve: string;
    empty: string;
  };
  loans: {
    lend: string;
    roomPlaceholder: string;
    itemPlaceholder: string;
    deposit: string;
    selectRequired: string;
    save: string;
    loading: string;
    itemLine: string;
    returnItem: string;
    empty: string;
  };
  toast: {
    eyebrow: string;
    newMessageFrom: string;
    close: string;
  };
  emmaBt: {
    brand: string;
    loginHint: string;
    booking: string;
    loading: string;
    clickToCopy: string;
    copied: string;
    noCode: string;
    noTicketCreate: string;
    guestNamePlaceholder: string;
    create: string;
    guestNameMissing: string;
    retry: string;
    twoFaPrompt: string;
    twoFaFailed: string;
    error: string;
    noBooking: string;
  };
  emmaRoom: {
    title: string;
    labelDefault: string;
    labelHigher: string;
    labelLower: string;
    labelExtraBed: string;
    accept: string;
    edit: string;
    higher: string;
    lower: string;
    extraBed: string;
    applied: string;
    appliedNoField: string;
    previewNote: string;
  };
  inject: {
    openPanel: string;
    panelTitle: string;
  };
};
