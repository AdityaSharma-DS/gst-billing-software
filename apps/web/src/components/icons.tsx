/* Lightweight inline icons (stroke-based) to match the DONICY design. */
type P = { size?: number };
const s = (n = 20) => ({ width: n, height: n, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const IconDashboard = ({ size }: P) => (<svg {...s(size)}><path d="M3 10.5 12 4l9 6.5" /><path d="M5 10v9h14v-9" /><path d="M10 19v-5h4v5" /></svg>);
export const IconClients = ({ size }: P) => (<svg {...s(size)}><circle cx="9" cy="8" r="3.2" /><path d="M3 19a6 6 0 0 1 12 0" /><path d="M16 6a3 3 0 0 1 0 6M21 19a5.5 5.5 0 0 0-4-5.3" /></svg>);
export const IconPlus = ({ size }: P) => (<svg {...s(size)}><path d="M12 5v14M5 12h14" /></svg>);
export const IconRecurring = ({ size }: P) => (<svg {...s(size)}><path d="M4 12a8 8 0 0 1 14-5.3L20 8" /><path d="M20 4v4h-4" /><path d="M20 12a8 8 0 0 1-14 5.3L4 16" /><path d="M4 20v-4h4" /></svg>);
export const IconExpenses = ({ size }: P) => (<svg {...s(size)}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></svg>);
export const IconPurchases = ({ size }: P) => (<svg {...s(size)}><path d="M5 7h15l-1.5 9H7L5 4H3" /><circle cx="9" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></svg>);
export const IconReceipts = ({ size }: P) => (<svg {...s(size)}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>);
export const IconReports = ({ size }: P) => (<svg {...s(size)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>);
export const IconReturns = ({ size }: P) => (<svg {...s(size)}><path d="M4 5.5A2 2 0 0 1 6 4h6v16H6a2 2 0 0 1-2-1.5z" /><path d="M20 5.5A2 2 0 0 0 18 4h-6v16h6a2 2 0 0 0 2-1.5z" /></svg>);
export const IconSettings = ({ size }: P) => (<svg {...s(size)}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>);
export const IconSearch = ({ size }: P) => (<svg {...s(size)}><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>);
export const IconBell = ({ size }: P) => (<svg {...s(size)}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>);
