# TxtExtract

Scan German supermarket receipts with Gemini and track your spending.

- [`web/`](web/README.md): **the app to use.** A Next.js web app on Vercel with Google sign-in, which saves
  receipts to your Google Sheet. Works on phone and desktop.
- [`receipts/`](receipts/README.md): the original Python version (Streamlit app, command-line extractor,
  evaluation harness for measuring extraction accuracy).
