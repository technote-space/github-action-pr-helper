export const DEFAULT_TARGET_EVENTS = {
	'pull_request': [
		'opened',
		'reopened',
		'synchronize',
		'labeled',
		'unlabeled',
		'closed',
	],
	'schedule': '*',
};
export const INTERVAL_MS           = 1000;
export const DEFAULT_COMMIT_NAME   = 'github-actions[bot]';
export const DEFAULT_COMMIT_EMAIL  = '41898282+github-actions[bot]@users.noreply.github.com'
;