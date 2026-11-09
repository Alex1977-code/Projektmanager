// Führt alle API-Tests zusätzlich gegen den In-Memory-Speicher (Browser-Betrieb) aus.
process.env.PM_TEST_STORE = 'memory';
await import('./api.test.js');
