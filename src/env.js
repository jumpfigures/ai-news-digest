import dotenv from 'dotenv';

// Load .env and let it take precedence over any pre-existing environment
// variable. Some shells/runners inject an empty API key variable into child
// processes; without `override`, that empty value would shadow the .env file.
// This module is imported first in main.js so it runs before any module that
// reads process.env at load time (e.g. summarize.js building the API client).
dotenv.config({ override: true });
