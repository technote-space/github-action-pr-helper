export const DEFAULT_TRIGGER_WORKFLOW_MESSAGE = 'chore: trigger workflow';
export const DEFAULT_TARGET_EVENTS            = {
  'pull_request': [
    'opened',
    'reopened',
    'synchronize',
    'labeled',
    'unlabeled',
    'closed',
  ],
  'schedule': '*',
  'repository_dispatch': '*',
  'workflow_dispatch': '*',
  'workflow_run': '*',
};
export const INTERVAL_MS                      = 1000;
