import type { ActionContext, MainArguments } from './types.js';
import { setFailed } from '@actions/core';
import { Context } from '@actions/github/lib/context.js';
import { ContextHelper, Utils } from '@technote-space/github-action-helper';
import { Logger } from '@technote-space/github-action-log-helper';
import { isTargetContext } from './utils/misc.js';
import { execute } from './utils/process.js';

const { showActionInfo } = ContextHelper;
const getLogger          = (logger?: Logger): Logger => logger ?? new Logger();

/* istanbul ignore next */
const getContext = (option: MainArguments): Context => option.context ?? new Context();

const getActionContext = async(option: MainArguments): Promise<ActionContext> => ({
  actionContext: getContext(option),
  actionDetail: option,
  cache: {},
});

export async function main(option: MainArguments): Promise<void> {
  if (option.rootDir) {
    showActionInfo(option.rootDir, getLogger(option.logger), getContext(option));
  }

  const octokit = Utils.getOctokit();
  if (!await isTargetContext(octokit, await getActionContext(option))) {
    getLogger(option.logger).info(option.notTargetEventMessage ?? 'This is not a target event.');
    return;
  }

  await execute(octokit, await getActionContext(option));
}

/* istanbul ignore next */
export function run(option: MainArguments): void {
  /* istanbul ignore next */
  main(option).catch(error => {
    console.log(error);
    setFailed(error.message);
  });
}
