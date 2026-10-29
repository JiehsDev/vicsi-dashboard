// Test-only JSX loader. Production retains Next's server-only boundary.
import { register } from 'node:module';
register('./tsx-loader.mjs', import.meta.url);
