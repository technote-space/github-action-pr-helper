import path from 'path';
import { setFailed } from '@actions/core';
import { context } from '@actions/github';
import { Logger, ContextHelper, Command, ApiHelper, GitHelper, Utils } from '@technote-space/github-action-helper';
import { isTargetContext } from './utils/misc';
import { execute } from './utils/process';

export const {showActionInfo} = ContextHelper;
export const getLogger        = (logger?: Logger): Logger => logger ?? new Logger();
export { isTargetContext, execute };
export { Logger, ContextHelper, Command, ApiHelper, GitHelper, Utils };

export type MainArguments = { logger?: Logger; message?: string };

/**
 * @param {object} option option
 * @param {Logger|undefined} option.logger logger
 * @param {string|undefined} option.message message
 * @return {Promise<void>} void
 */
export async function main(option: MainArguments = {}): Promise<void> {
	showActionInfo(path.resolve(__dirname, '..'), getLogger(option.logger), context);

	if (isTargetContext(context)) {
		getLogger(option.logger).info(option.message ?? 'This is not target event.');
		return;
	}

	await execute(context);
}

/**
 * @param {object} option option
 * @param {Logger|undefined} option.logger logger
 * @param {string|undefined} option.message message
 */
export function run(option: MainArguments = {}): void {
	main(option).catch(error => setFailed(error.message));
}
