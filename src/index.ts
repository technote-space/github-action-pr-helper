import { getInput, setFailed } from '@actions/core';
import { context } from '@actions/github';
import { GitHub } from '@actions/github';
import { Context } from '@actions/github/lib/context';
import { Logger, ContextHelper, Command, ApiHelper, GitHelper, Utils } from '@technote-space/github-action-helper';
import { getDefaultBranch } from './utils/command';
import { isTargetContext } from './utils/misc';
import { execute } from './utils/process';
import { ActionContext, MainArguments } from './types';

export const {showActionInfo} = ContextHelper;
export const getLogger        = (logger?: Logger): Logger => logger ?? new Logger();
export { isTargetContext, execute };
export { Logger, ContextHelper, Command, ApiHelper, GitHelper, Utils };

/* istanbul ignore next */
const getContext = (option: MainArguments): Context => option.context ?? context;

const getActionContext = async(option: MainArguments, octokit: GitHub): Promise<ActionContext> => ({
	actionContext: getContext(option),
	actionDetail: option,
	defaultBranch: await getDefaultBranch(octokit, getContext(option)),
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

	const octokit = new GitHub(getInput('GITHUB_TOKEN', {required: true}));
	if (!isTargetContext(await getActionContext(option, octokit))) {
		getLogger(option.logger).info(option.notTargetEventMessage ?? 'This is not target event.');
		return;
	}

	await execute(octokit, await getActionContext(option, octokit));
}

/**
 * @param {object} option option
 * @param {Logger|undefined} option.logger logger
 * @param {string|undefined} option.message message
 * @return {Promise} void
 */
export function run(option: MainArguments): Promise<void> {
	/* istanbul ignore next */
	return main(option).catch(error => setFailed(error.message));
}
