# TRADORA

A premium, light-mode Trading Operating System for serious forex traders — built with React, Vite, Tailwind CSS, Supabase, Recharts, and Lucide icons.

This is **Phase 1**: Login, Sign Up, and the Dashboard ("Trading Command Center"), sharing one unified design system.

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase project URL + anon key
npm run dev
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy the Project URL and `anon` public key into `.env`.
3. In the SQL editor, run `supabase-schema.sql` to create the `profiles`, `accounts`, `account_snapshots`, and `trades` tables with row-level security enabled.
4. In **Authentication → Providers**, enable Email and (optionally) Google sign-in to match the "Continue with Google" button on Login.

## Project structure

```
src/
  components/
    ui/          Button, Input, PasswordInput, Select, Dropdown, Card, Badge,
                  ProgressBar, Checkbox, Avatar, Modal, Toast, Tooltip, LoadingSkeleton
    layout/       Sidebar, Topbar, Logo
    dashboard/    KpiCard, ChartCard, EquityCurve, RiskMonitor, WeeklyPnl,
                  WinLossDonut, PerformanceByPair, RecentTrades,
                  TradingDiscipline, TodaysChecklist, DailyWorship
  pages/          Login.jsx, SignUp.jsx, Dashboard.jsx
  contexts/       AuthContext.jsx (Supabase auth: sign in, sign up, Google OAuth, sign out, session persistence)
  routes/         ProtectedRoute.jsx (guards /dashboard)
  data/           mockData.js — shaped to match the Supabase schema, ready to swap for live queries
  lib/            supabaseClient.js
```

## Swapping mock data for live data

`src/data/mockData.js` mirrors the shape of the `accounts`, `account_snapshots`, and `trades` tables. Once your Supabase tables are populated, replace the imports in `Dashboard.jsx` with Supabase queries (e.g. `supabase.from('accounts').select('*').eq('user_id', user.id)`) — the components themselves don't need to change since they just consume the same shape.

## Design system

- **Colors**: background `#F7F9FC`, cards `#FFFFFF`, primary brand `#2563EB`, success `#16A34A`, danger `#DC2626`, warning `#D97706`, AI accent `#7C3AED`.
- **Type**: Inter, tabular numerals on all financial figures.
- **Responsive**: sidebar collapses to a mobile drawer below `lg`; KPI grid steps down from 6 → 2 → 1 columns; the trades table becomes stacked cards on mobile.

Only Login, Sign Up, and Dashboard are built. Sidebar links to other sections (Accounts, Trading Journal, Analytics, etc.) are present for navigation structure but their pages are not yet implemented — that's Phase 2.
