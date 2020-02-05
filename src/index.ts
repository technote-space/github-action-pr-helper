import { setFailed } from '@actions/core';
import { Context } from '@actions/github/lib/context';
import { Logger, ContextHelper, Utils } from '@technote-space/github-action-helper';
import { isTargetContext } from './utils/misc';
import { execute } from './utils/process';
import { ActionContext, MainArguments } from './types';

const {showActionInfo} = ContextHelper;
const getLogger        = (logger?: Logger): Logger => logger ?? new Logger();

/* istanbul ignore next */
const getContext = (option: MainArguments): Context => option.context ?? new Context();

const getActionContext = async(option: MainArguments): Promise<ActionContext> => ({
	actionContext: getContext(option),
	actionDetail: option,
	cache: {},
});

/**
 * @param {object} option option
 * @param {string} option.actionName action name
 * @param {string} option.actionOwner action owner
 * @param {string} option.actionRepo action repo
 * @param {Logger|undefined} option.logger logger
 * @param {string|undefined} option.message message
 * @return {Promise<void>} void
 */
export async function main(option: MainArguments): Promise<void> {
	if (option.rootDir) {
		showActionInfo(option.rootDir, getLogger(option.logger), getContext(option));
	}

	const octokit = Utils.getOctokit();
	if (!await isTargetContext(octokit, await getActionContext(option))) {
		getLogger(option.logger).info(option.notTargetEventMessage ?? 'This is not target event.');
		return;
	}

	await execute(octokit, await getActionContext(option));
}

/* istanbul ignore next */
/**
 * @param {object} option option
 * @param {Logger|undefined} option.logger logger
 * @param {string|undefined} option.message message
 * @return {void} void
 */
export function run(option: MainArguments): void {
	/* istanbul ignore next */
	main(option).catch(error => setFailed(error.message));
}
