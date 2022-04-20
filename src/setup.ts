import { vi } from 'vitest';
import { setupGlobal } from '@technote-space/github-action-test-helper';

setupGlobal();

vi.mock('./constant', async() => ({
  ...await vi.importActual<{ INTERVAL_MS: number }>('./constant'),
  INTERVAL_MS: 0,
}));
