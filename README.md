Healthcare Translation Web App (Prototype)
===========================================

Structure:
- client/  -> React (Vite) frontend
- server/  -> Express backend that proxies to OpenAI Chat Completions API

Features implemented:
- Browser-based speech recognition using Web Speech API (live transcript).
- Dual transcript display: original and AI-corrected translated transcript.
- Language selectors for input/output.
- 'Speak' button uses browser SpeechSynthesis for audio playback (no external TTS required).
- Backend uses OpenAI Chat API to correct medical terms and translate text. Requires OPENAI_API_KEY.

Security note:
This is a prototype. Do NOT use with real patient-identifiable data unless you implement proper data protection and a compliant deployment.

How to run locally:
1. Install Node.js >= 18.
2. From project root, open two terminals.

Terminal 1 (server):
$ cd server
$ npm install
$ export OPENAI_API_KEY=sk-...   # on Windows use set or use .env and a process manager
$ node index.js

Terminal 2 (client):
$ cd client
$ npm install
$ npm run dev

Open the client URL shown by Vite (usually http://localhost:5173).
The client expects the backend at http://localhost:5173/api/translate when used with a dev proxy,
OR you can run the server on a different port and change the fetch URL in client/src/Transcriber.jsx
to point to where the server is (e.g., http://localhost:3000/api/translate).

Notes on deployment:
- Vercel can host the client easily; server can be deployed as a serverless function (api route) or to Render/Heroku.
- Set OPENAI_API_KEY as an environment variable on the deployment platform.

Testing checklist performed by this prototype:
- Basic microphone permission flow (browser).
- Live transcript accumulation and debounced translation calls.
- SpeechSynthesis playback in browser.
- Backend translation via OpenAI (if key provided).

Known limitations:
- Web Speech API availability varies by browser (works best on Chromium-based browsers).
- This prototype sends text to OpenAI — additional steps needed for PHI/HIPAA compliance.
- No persistent storage, no authentication.

