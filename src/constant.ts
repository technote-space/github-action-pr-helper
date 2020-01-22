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
	'repository_dispatch': '*',
};
export const INTERVAL_MS           = 1000;
