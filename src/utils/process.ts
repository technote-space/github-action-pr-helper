import {setOutput} from '@actions/core';
import {Utils, ContextHelper, GitHelper} from '@technote-space/github-action-helper';
import {Logger} from '@technote-space/github-action-log-helper';
import {Octokit} from '@technote-space/github-action-helper/dist/types';
import {
  getApiHelper,
  getChangedFiles,
  getRefDiff,
  commit,
  push,
  isMergeable,
  updatePr,
  closePR,
  resolveConflicts,
  findPR,
  getDefaultBranch,
  branchConfig,
} from './command';
import {
  replaceDirectory,
  isActionPr,
  isClosePR,
  isTargetBranch,
  getPrHeadRef,
  getHelper,
  checkDefaultBranch,
  getPullsArgsForDefaultBranch,
  getPrBaseRef,
  getActionContext,
  getAutoMergeThresholdDays,
  isPassedAllChecks,
  isNotCreatePR,
} from './misc';
import {getPrBranchName} from './variables';
import {INTERVAL_MS} from '../constant';
import {ActionContext, ProcessResult, AllProcessResult, PullsParams, CommandOutput} from '../types';

const {sleep, getBranch, objectGet} = Utils;
const {isPr, isPush}                = ContextHelper;
const commonLogger                  = new Logger(replaceDirectory);

const getResult = (result: 'succeeded' | 'failed' | 'skipped' | 'not changed', detail: string, context: ActionContext, fork?: string): ProcessResult => ({
  result,
  detail,
  branch: (fork ? `${fork}:` : '') + (getPrHeadRef(context) || getBranch(context.actionContext)),
});

const checkActionPr = async(logger: Logger, octokit: Octokit, context: ActionContext): Promise<ProcessResult | true> => {
  const defaultBranch = await getDefaultBranch(octokit, context);
  if (defaultBranch === getPrHeadRef(context)) {
    return true;
  }

  const pr = await findPR(getPrHeadRef(context), octokit, context);
  if (!pr) {
    return getResult('failed', 'not found', context);
  }

  if (pr.base.ref === defaultBranch) {
    return true;
  }

  const basePr = await findPR(pr.base.ref, octokit, context);
  if (!basePr) {
    await closePR(getPrHeadRef(context), logger, context, '');
    return getResult('succeeded', 'has been closed because base PullRequest does not exist', context);
  }

  if (basePr.state === 'closed') {
    await closePR(getPrHeadRef(context), logger, context, '');
    return getResult('succeeded', 'has been closed because base PullRequest has been closed', context);
  }

  return true;
};

export const autoMerge = async(pr: { 'created_at': string; number: number }, logger: Logger, octokit: Octokit, context: ActionContext): Promise<boolean> => {
  const threshold = getAutoMergeThresholdDays(context);
  // eslint-disable-next-line no-magic-numbers
  if (threshold <= 0) {
    // disabled
    return false;
  }

  logger.startProcess('Checking auto merge...');
  const created = Date.parse(pr.created_at);
  const diff    = Date.now() - created;
  // eslint-disable-next-line no-magic-numbers
  const days    = Math.floor(diff / 86400000); // 1000 * 60 * 60 * 24
  if (days <= threshold) {
    // not more than threshold
    logger.info('Number of days since creation is not more than threshold.');
    logger.info('days: %d, threshold: %d', days, threshold);
    return false;
  }

  if (!await isMergeable(pr.number, octokit, context)) {
    // not mergeable
    logger.info('This PR is not mergeable.');
    return false;
  }

  if (!await isPassedAllChecks(octokit, context)) {
    // not passed all checked
    logger.info('This PR is not passed all checks.');
    return false;
  }

  logger.info('All checks are passed.');

  logger.startProcess('Auto merging...');
  try {
    await octokit.rest.pulls.merge({
      ...context.actionContext.repo,
      'pull_number': pr.number,
    });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    logger.warn(error.message);
    return false;
  }

  return true;
};

const createCommit = async(addComment: boolean, isClose: boolean, logger: Logger, octokit: Octokit, context: ActionContext): Promise<ProcessResult> => {
  const helper     = getHelper(context);
  const branchName = await getPrBranchName(helper, octokit, context);

  const {files, output, aborted} = await getChangedFiles(helper, logger, octokit, context);
  if (!files.length) {
    logger.info('There is no diff.');
    if (context.isBatchProcess) {
      const pr = await findPR(branchName, octokit, context);
      if (pr && !(await getRefDiff(getPrBaseRef(context), helper, logger, context)).length) {
        // Close if there is no diff
        await closePR(branchName, logger, context);
        return getResult('succeeded', 'has been closed because there is no reference diff', context);
      }

      if (pr && await autoMerge(pr, logger, octokit, context)) {
        return getResult('succeeded', 'has been auto merged', context);
      }

      if (pr && aborted) {
        // not mergeable
        logger.info('This PR is not mergeable.');
        // Resolve conflicts if PR is not mergeable
        return getResult('succeeded', await resolveConflicts(branchName, helper, logger, octokit, context), context);
      }
    }

    return getResult('not changed', 'There is no diff', context);
  }

  await commit(helper, logger, context);
  if (context.isBatchProcess) {
    if (!(await getRefDiff(getPrBaseRef(context), helper, logger, context)).length) {
      // Close if there is no diff
      await closePR(branchName, logger, context);
      return getResult('succeeded', 'has been closed because there is no reference diff', context);
    }
  }

  if (isClose) {
    return getResult('not changed', 'This is a close event', context);
  }

  await push(branchName, helper, logger, context);
  if (addComment) {
    await updatePr(branchName, files, output, helper, logger, octokit, context);
  }

  return getResult('succeeded', 'updated', context);
};

const noDiffProcess = async(branchName: string, isClose: boolean, logger: Logger, helper: GitHelper, octokit: Octokit, context: ActionContext): Promise<{ mergeable: boolean; result?: ProcessResult }> => {
  logger.info('There is no diff.');
  const refDiffExists = !!(await getRefDiff(getPrHeadRef(context), helper, logger, context)).length;
  const pr            = await findPR(branchName, octokit, context);

  if (!refDiffExists) {
    if (pr) {
      // Close if there is no ref diff
      await closePR(branchName, logger, context);
      return {
        mergeable: false,
        result: getResult('succeeded', 'has been closed because there is no reference diff', context),
      };
    }

    return {
      mergeable: false,
      result: getResult('not changed', 'There is no diff', context),
    };
  }

  if (isClose) {
    return {
      mergeable: false,
      result: getResult('not changed', 'This is a close event', context),
    };
  }

  if (!pr) {
    // There is no PR
    await updatePr(branchName, [], [], helper, logger, octokit, context);
    return {
      mergeable: false,
      result: getResult('succeeded', 'PullRequest created', context),
    };
  }

  return {
    mergeable: await isMergeable(pr.number, octokit, context),
  };
};

const diffProcess = async(files: string[], output: CommandOutput[], branchName: string, isClose: boolean, logger: Logger, helper: GitHelper, octokit: Octokit, context: ActionContext): Promise<{ mergeable: boolean; result?: ProcessResult }> => {
  // Commit local diffs
  await commit(helper, logger, context);
  if (!(await getRefDiff(getPrHeadRef(context), helper, logger, context)).length) {
    // Close if there is no diff
    await closePR(branchName, logger, context);
    return {
      mergeable: false,
      result: getResult('succeeded', 'has been closed because there is no reference diff', context),
    };
  }

  if (isClose) {
    return {
      mergeable: false,
      result: getResult('not changed', 'This is a close event', context),
    };
  }

  await push(branchName, helper, logger, context);
  return {
    mergeable: await updatePr(branchName, files, output, helper, logger, octokit, context),
  };
};

const createPr = async(makeGroup: boolean, isClose: boolean, helper: GitHelper, logger: Logger, octokit: Octokit, context: ActionContext): Promise<ProcessResult> => {
  if (makeGroup) {
    commonLogger.startProcess('Target PullRequest Ref [%s]', getPrHeadRef(context));
  }

  if (!isActionPr(context) && !await isTargetBranch(getPrHeadRef(context), octokit, context)) {
    return getResult('skipped', 'This is not a target branch', context);
  }

  if (isActionPr(context) || isNotCreatePR(context)) {
    const processResult = await checkActionPr(logger, octokit, context);
    if (processResult !== true) {
      return processResult;
    }

    return createCommit(isActionPr(context), isClose, logger, octokit, context);
  }

  const {files, output, aborted}          = await getChangedFiles(helper, logger, octokit, context);
  const branchName                        = await getPrBranchName(helper, octokit, context);
  let result: 'succeeded' | 'not changed' = 'succeeded';
  let detail                              = 'updated';
  let mergeable                           = false;
  if (!files.length) {
    const processResult = await noDiffProcess(branchName, isClose, logger, helper, octokit, context);
    if (processResult.result) {
      return processResult.result;
    }

    mergeable = !aborted && processResult.mergeable;
    if (mergeable) {
      result = 'not changed';
      detail = 'There is no diff';
    }
  } else {
    const processResult = await diffProcess(files, output, branchName, isClose, logger, helper, octokit, context);
    if (processResult.result) {
      return processResult.result;
    }

    mergeable = processResult.mergeable;
  }

  if (!mergeable) {
    // Resolve conflicts if PR is not mergeable
    detail = await resolveConflicts(branchName, helper, logger, octokit, context);
  }

  return getResult(result, detail, context);
};

const outputResult = (result: ProcessResult, endProcess = false): void => {
  const mark = {
    'succeeded': commonLogger.c('✔', {color: 'green'}),
    'failed': commonLogger.c('×', {color: 'red'}),
    'skipped': commonLogger.c('→', {color: 'yellow'}),
    'not changed': commonLogger.c('✔', {color: 'yellow'}),
  };
  if (endProcess) {
    setOutput('result', result.result);
    commonLogger.endProcess();
  }

  commonLogger.info(mark[result.result] + '\t[%s] %s', result.branch, result.detail);
};

const getOutputResult = (results: ProcessResult[]): typeof AllProcessResult[number] => {
  const resultItems = results.map(result => result.result);

  // eslint-disable-next-line no-magic-numbers
  return (AllProcessResult.filter(item => resultItems.includes(item)).slice(-1)[0] as (typeof AllProcessResult[number]) | undefined) ?? AllProcessResult[0];
};

const outputResults = (results: ProcessResult[]): void => {
  const total     = results.length;
  const succeeded = results.filter(item => item.result === 'succeeded').length;
  const failed    = results.filter(item => item.result === 'failed').length;

  commonLogger.startProcess('Total:%d  Succeeded:%d  Failed:%d  Skipped:%d', total, succeeded, failed, total - succeeded - failed);
  results.forEach(result => outputResult(result));
  setOutput('result', getOutputResult(results));
};

const runCreatePr = async(isClose: boolean, getPulls: (Octokit, ActionContext) => AsyncIterable<PullsParams>, octokit: Octokit, context: ActionContext): Promise<void> => {
  const logger                   = new Logger(replaceDirectory, true);
  const results: ProcessResult[] = [];
  const processed                = {};

  for await (const pull of getPulls(octokit, context)) {
    const actionContext = await getActionContext(pull, octokit, context);
    if (objectGet(pull.head.user, 'login') !== context.actionContext.repo.owner) {
      results.push(getResult('skipped', 'PR from fork', actionContext, objectGet(pull.head.user, 'login')));
      continue;
    }

    const helper   = getHelper(actionContext);
    const isTarget = isActionPr(actionContext) || await isTargetBranch(getPrHeadRef(actionContext), octokit, actionContext);
    let target     = '';
    if (isTarget) {
      target = await getPrBranchName(helper, octokit, actionContext, true);
      if (target in processed) {
        results.push(getResult('skipped', `duplicated (${target})`, actionContext));
        continue;
      }
    }

    try {
      const result = await createPr(true, isClose, helper, logger, octokit, actionContext);
      if ('skipped' !== result.result) {
        processed[target] = true;
      }

      results.push(result);
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      processed[target] = true;
      results.push(getResult('failed', error.message, actionContext));
    }

    await sleep(INTERVAL_MS);
  }
  await outputResults(results);

  const failed = results.filter(item => 'failed' === item.result).length;
  // eslint-disable-next-line no-magic-numbers
  if (1 === failed) {
    commonLogger.endProcess();
    throw new Error('There is a failed process.');
    // eslint-disable-next-line no-magic-numbers
  } else if (1 < failed) {
    commonLogger.endProcess();
    throw new Error('There are failed processes.');
  }
};

/**
 * @param {Octokit} octokit octokit
 * @param {Context} context context
 * @return {AsyncIterable} pull
 */
async function* getPulls(octokit: Octokit, context: ActionContext): AsyncIterable<PullsParams> {
  const logger = new Logger(replaceDirectory, true);

  yield* await getApiHelper(octokit, context, logger).pullsList({});
  if (checkDefaultBranch(context)) {
    yield await getPullsArgsForDefaultBranch(octokit, context);
  }
}

const runCreatePrAll = async(octokit: Octokit, context: ActionContext): Promise<void> => runCreatePr(false, getPulls, octokit, context);

const runCreatePrClosed = async(octokit: Octokit, context: ActionContext): Promise<void> => runCreatePr(true, getPulls, octokit, context);

export const execute = async(octokit: Octokit, context: ActionContext): Promise<void> => {
  await branchConfig(getHelper(context), octokit, context);
  if (isClosePR(context)) {
    await runCreatePrClosed(octokit, context);
  } else if (isPush(context.actionContext)) {
    await outputResult(await createCommit(false, false, commonLogger, octokit, context), true);
  } else if (isPr(context.actionContext)) {
    await outputResult(await createPr(false, false, getHelper(context), commonLogger, octokit, context), true);
  } else {
    await runCreatePrAll(octokit, context);
  }

  commonLogger.endProcess();
};
