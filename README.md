# Norteadores PEP

## Running Tests

This repository includes a small test suite using Node's built‑in `test` runner.
To execute the tests, install Node.js (v18 or later) and run:

```bash
npm test
```

The tests reside in the `test/` directory and mock `chrome.storage.local` to
verify `updateEnabledCareLinesOnSnippetsChange` behaviour.
