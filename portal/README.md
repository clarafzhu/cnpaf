# NGO Membership System

A simple membership system where people can sign up and get a **digital membership card** with their profile (name, gender, membership ID, email, phone, etc.).

## What’s included

- **Sign up** – Form for name, gender, email, phone, date of birth. Submitting creates a member and assigns a unique Membership ID (e.g. `NGO-2025-00001`).
- **Digital membership card** – Shown right after sign-up (and viewable anytime via “My Card”) with membership ID, name, gender, email, phone, and member‑since date.
- **Profile** – Same data shown in a profile section under the card.
- **Download card** – “Download card (image)” exports the card as a PNG. If the export script doesn’t load, the button falls back to the browser print dialog (e.g. “Save as PDF”).
- **My Card** – Enter a Membership ID to view that member’s card and profile again.

## How to run

1. Open `index.html` in a browser (double‑click or “Open with” your browser).
2. Or serve the folder with any static server, for example:
   - **Node:** `npx serve .` then open the URL shown (e.g. http://localhost:3000).
   - **Python 3:** `python -m http.server 8000` then open http://localhost:8000.

## Data storage

Member data is stored in the browser’s **localStorage** under the key `ngo_members`. No server or database is required. For production you’d typically replace this with a backend API and database.

## Customization

- **NGO name / branding:** Edit the `.logo` text and any “NGO Membership” strings in `index.html`, and adjust colors in `:root` in `styles.css` (e.g. `--accent`, `--accent-dark`).
- **Membership ID format:** Change the `nextMembershipId()` logic in `app.js` (e.g. prefix or number length).
- **Extra fields:** Add inputs in the sign‑up form in `index.html`, then in `app.js` add those properties to the `member` object and to `fillCardAndProfile()` and the profile section in `index.html`.

## Files

- `index.html` – All screens: landing, sign up, “My Card” lookup, card + profile view.
- `styles.css` – Layout and styling.
- `app.js` – Sign‑up, ID generation, storage, card/profile display, and download/print.
