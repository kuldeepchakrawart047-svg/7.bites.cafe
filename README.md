# 7 Bites Cafe Website

A responsive cafe website for 7 Bites with menu categories, cart, table booking, customer accounts, Instagram and Google Maps links.

## Requirements
- Node.js 18 or newer
- npm

## Run locally
1. Extract this folder.
2. Open a terminal in the `7-bites-cafe` folder.
3. Run `npm install`
4. Set a strong session secret before production:
   - Windows PowerShell: `$env:SESSION_SECRET="your-long-random-secret"`
   - macOS/Linux: `export SESSION_SECRET="your-long-random-secret"`
5. Run `npm start`
6. Open http://localhost:3000

SQLite database and session files are created automatically in the project folder. The database persists customers and bookings across restarts. Passwords are hashed with bcrypt; session cookies are HttpOnly and SameSite=Lax.

## Booking rules
- Time window: 10:00 AM to 2:50 PM, in 10-minute slots (15:00 is closing time).
- One reservation per time slot, enforced by a SQLite unique index. The server rechecks the slot at save time, so two customers cannot reserve the same slot simultaneously.
- Menu cart items can be included in a table booking.
- Logged-in users can see their own bookings.

## Before public deployment
- Use HTTPS and set `NODE_ENV=production` and a strong unique `SESSION_SECRET`.
- Configure a reverse proxy and secure hosting; back up the SQLite database.
- Add CSRF protection/rate limiting, email or SMS verification, business-approved cancellation policy, and privacy notice before accepting real customer data.
- Menu images use remote Unsplash URLs and Google Fonts; an internet connection is needed for those assets.
- The uploaded logo reference is included in `public/assets/7-bites-logo-reference.jpeg`. The site uses a matching typography/coffee palette brand treatment; replace it with a clean transparent logo asset if you want the exact illustrated mark.
