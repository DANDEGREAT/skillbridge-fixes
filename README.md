# SkillBridge - Verified Technicians, On Demand

Nigeria's KYC-verified skilled technician marketplace. Post jobs, hire verified pros, pay safely via escrow.

## Fixes Applied

This version includes fixes for text duplication on scroll:
- Disabled smooth scroll to prevent rendering glitches
- Removed continuous animations that caused re-renders (map pin drift, hero particles)
- Changed AnimatePresence mode from "popLayout"/"wait" to "sync" for smoother transitions
- Added GPU acceleration hints (`transform: translateZ(0)`, `backface-visibility: hidden`)
- Added `will-change` hints for animated elements

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS
- Framer Motion
- Supabase (PostgreSQL + Auth)
- Zustand (state management)
- Lucide React (icons)

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```