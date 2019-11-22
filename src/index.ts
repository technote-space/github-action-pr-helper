import { setFailed } from '@actions/core';
import { context } from '@actions/github';
import { Logger, ContextHelper, Command, ApiHelper, GitHelper, Utils } from '@technote-space/github-action-helper';
import { isTargetContext } from './utils/misc';
import { execute } from './utils/process';
import { ActionContext, MainArguments } from './types';

export const {showActionInfo} = ContextHelper;
export const getLogger        = (logger?: Logger): Logger => logger ?? new Logger();
export { isTargetContext, execute };
export { Logger, ContextHelper, Command, ApiHelper, GitHelper, Utils };

const getActionContext = (option: MainArguments): ActionContext => ({
	actionContext: option.context ?? context,
	actionDetail: option,
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
		/* istanbul ignore next */
		showActionInfo(option.rootDir, getLogger(option.logger), option.context ?? context);
	}

	if (!isTargetContext(getActionContext(option))) {
		getLogger(option.logger).info(option.notTargetEventMessage ?? 'This is not target event.');
		return;
	}

	await execute(getActionContext(option));
}

/**
 * @param {object} option option
 * @param {Logger|undefined} option.logger logger
 * @param {string|undefined} option.message message
 */
export function run(option: MainArguments): void {
	main(option).catch(error => setFailed(error.message));
}
