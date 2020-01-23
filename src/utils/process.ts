import { GitHub } from '@actions/github';
import { Logger, Utils, ContextHelper, GitHelper } from '@technote-space/github-action-helper';
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
} from './misc';
import { getPrBranchName } from './variables';
import { INTERVAL_MS } from '../constant';
import { ActionContext, ProcessResult, PullsParams, CommandOutput } from '../types';

const {sleep, getBranch} = Utils;
const {isPr, isPush}     = ContextHelper;
const commonLogger       = new Logger(replaceDirectory);

const getResult = (result: 'succeeded' | 'failed' | 'skipped', detail: string, context: ActionContext): ProcessResult => ({
	result,
	detail,
	branch: getPrHeadRef(context) || getBranch(context.actionContext), // for push
});

const checkActionPr = async(logger: Logger, octokit: GitHub, context: ActionContext): Promise<ProcessResult | true> => {
	const pr = await findPR(getPrHeadRef(context), logger, octokit, context);
	if (!pr) {
		return getResult('failed', 'not found', context);
	}

	if (pr.base.ref === await getDefaultBranch(octokit, context)) {
		return true;
	}

	const basePr = await findPR(pr.base.ref, logger, octokit, context);
	if (!basePr) {
		await closePR(getPrHeadRef(context), logger, octokit, context, '');
		return getResult('succeeded', 'has been closed because base PullRequest does not exist', context);
	}

	if (basePr.state === 'closed') {
		await closePR(getPrHeadRef(context), logger, octokit, context, '');
		return getResult('succeeded', 'has been closed because base PullRequest has been closed', context);
	}

	return true;
};

const createCommit = async(addComment: boolean, logger: Logger, octokit: GitHub, context: ActionContext): Promise<ProcessResult> => {
	const helper     = getHelper(context);
	const branchName = await getPrBranchName(helper, logger, octokit, context);

	const {files, output} = await getChangedFiles(helper, logger, octokit, context);
	if (!files.length) {
		logger.info('There is no diff.');
		if (context.isBatchProcess) {
			const pr = await findPR(branchName, logger, octokit, context);
			if (pr && !(await getRefDiff(getPrBaseRef(context), helper, logger, context)).length) {
				// Close if there is no diff
				await closePR(branchName, logger, octokit, context);
				return getResult('succeeded', 'has been closed because there is no reference diff', context);
			}
		}

		return getResult('skipped', 'There is no diff', context);
	}

	await commit(helper, logger, context);
	if (context.isBatchProcess) {
		if (!(await getRefDiff(getPrBaseRef(context), helper, logger, context)).length) {
			// Close if there is no diff
			await closePR(branchName, logger, octokit, context);
			return getResult('succeeded', 'has been closed because there is no reference diff', context);
		}
	}

	try {
		await push(branchName, helper, logger, context);
	} catch (error) {
		if (/protected branch hook declined/.test(error.message)) {
			logger.warn('Branch [%s] is protected.', branchName);
			return getResult('failed', 'Branch is protected', context);
		}
		throw error;
	}

	if (addComment) {
		await updatePr(branchName, files, output, helper, logger, octokit, context);
	}

	return getResult('succeeded', 'updated', context);
};

const noDiffProcess = async(branchName: string, isClose: boolean, logger: Logger, helper: GitHelper, octokit: GitHub, context: ActionContext): Promise<{ mergeable: boolean; result?: ProcessResult }> => {
	logger.info('There is no diff.');
	const pr = await findPR(branchName, logger, octokit, context);
	if (!pr) {
		// There is no PR
		return {
			mergeable: false,
			result: getResult('skipped', 'There is no diff', context),
		};
	}

	if (!(await getRefDiff(getPrHeadRef(context), helper, logger, context)).length) {
		// Close if there is no diff
		await closePR(branchName, logger, octokit, context);
		return {
			mergeable: false,
			result: getResult('succeeded', 'has been closed because there is no reference diff', context),
		};
	}

	if (isClose) {
		return {
			mergeable: false,
			result: getResult('skipped', 'This is close event', context),
		};
	}

	return {
		mergeable: await isMergeable(pr.number, octokit, context),
	};
};

const diffProcess = async(files: string[], output: CommandOutput[], branchName: string, isClose: boolean, logger: Logger, helper: GitHelper, octokit: GitHub, context: ActionContext): Promise<{ mergeable: boolean; result?: ProcessResult }> => {
	// Commit local diffs
	await commit(helper, logger, context);
	if (!(await getRefDiff(getPrHeadRef(context), helper, logger, context)).length) {
		// Close if there is no diff
		await closePR(branchName, logger, octokit, context);
		return {
			mergeable: false,
			result: getResult('succeeded', 'has been closed because there is no reference diff', context),
		};
	}

	if (isClose) {
		return {
			mergeable: false,
			result: getResult('skipped', 'This is close event', context),
		};
	}

	await push(branchName, helper, logger, context);
	return {
		mergeable: await updatePr(branchName, files, output, helper, logger, octokit, context),
	};
};

const createPr = async(makeGroup: boolean, isClose: boolean, helper: GitHelper, logger: Logger, octokit: GitHub, context: ActionContext): Promise<ProcessResult> => {
	if (makeGroup) {
		commonLogger.startProcess('Target PullRequest Ref [%s]', getPrHeadRef(context));
	}

	if (isActionPr(context)) {
		const processResult = await checkActionPr(logger, octokit, context);
		if (processResult !== true) {
			return processResult;
		}

		return createCommit(true, logger, octokit, context);
	} else if (!await isTargetBranch(getPrHeadRef(context), octokit, context)) {
		return getResult('skipped', 'This is not target branch', context);
	}

	const {files, output}               = await getChangedFiles(helper, logger, octokit, context);
	const branchName                    = await getPrBranchName(helper, logger, octokit, context);
	let result: 'succeeded' | 'skipped' = 'succeeded';
	let detail                          = 'updated';
	let mergeable                       = false;
	if (!files.length) {
		const processResult = await noDiffProcess(branchName, isClose, logger, helper, octokit, context);
		if (processResult.result) {
			return processResult.result;
		}

		mergeable = processResult.mergeable;
		if (mergeable) {
			result = 'skipped';
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
		await resolveConflicts(branchName, helper, logger, octokit, context);
	}

	return getResult(result, detail, context);
};

const outputResult = (result: ProcessResult, endProcess = false): void => {
	const mark = {
		'succeeded': commonLogger.c('✔', {color: 'green'}),
		'failed': commonLogger.c('×', {color: 'red'}),
		'skipped': commonLogger.c('→', {color: 'yellow'}),
	};
	if (endProcess) {
		commonLogger.endProcess();
	}

	commonLogger.info(mark[result.result] + '\t[%s] %s', result.branch, result.detail);
};

const outputResults = (results: ProcessResult[]): void => {
	const total     = results.length;
	const succeeded = results.filter(item => item.result === 'succeeded').length;
	const failed    = results.filter(item => item.result === 'failed').length;

	commonLogger.startProcess('Total:%d  Succeeded:%d  Failed:%d  Skipped:%d', total, succeeded, failed, total - succeeded - failed);
	results.forEach(result => outputResult(result));
};

const runCreatePr = async(isClose: boolean, getPulls: (GitHub, ActionContext) => AsyncIterable<PullsParams>, octokit: GitHub, context: ActionContext): Promise<void> => {
	const logger                   = new Logger(replaceDirectory, true);
	const results: ProcessResult[] = [];
	const processed                = {};

	for await (const pull of getPulls(octokit, context)) {
		const actionContext = await getActionContext(pull, octokit, context);
		const helper        = getHelper(actionContext);
		const target        = await getPrBranchName(helper, logger, octokit, context);
		if (target in processed && !isActionPr(actionContext)) {
			results.push(getResult('skipped', `duplicated (${target})`, actionContext));
			continue;
		}

		try {
			results.push(await createPr(true, isClose, helper, logger, octokit, actionContext));
		} catch (error) {
			results.push(getResult('failed', error.message, actionContext));
		}

		processed[target] = true;
		await sleep(INTERVAL_MS);
	}
	await outputResults(results);
};

/**
 * @param {GitHub} octokit octokit
 * @param {Context} context context
 * @return {AsyncIterable} pull
 */
async function* pullsForSchedule(octokit: GitHub, context: ActionContext): AsyncIterable<PullsParams> {
	const logger = new Logger(replaceDirectory, true);

	yield* await getApiHelper(octokit, context, logger).pullsList({});
	if (checkDefaultBranch(context)) {
		yield await getPullsArgsForDefaultBranch(octokit, context);
	}
}

const runCreatePrAll = async(octokit: GitHub, context: ActionContext): Promise<void> => runCreatePr(false, pullsForSchedule, octokit, context);

/**
 * @param {GitHub} octokit octokit
 * @param {Context} context context
 * @return {AsyncIterable} pull
 */
async function* pullsForClosed(octokit: GitHub, context: ActionContext): AsyncIterable<PullsParams> {
	const logger = new Logger(replaceDirectory, true);

	yield* await getApiHelper(octokit, context, logger).pullsList({
		base: getBranch(getPrHeadRef(context), false),
	});

	yield* await getApiHelper(octokit, context, logger).pullsList({
		head: `${context.actionContext.repo.owner}:${getBranch(getPrBaseRef(context), false)}`,
	});
}

const runCreatePrClosed = async(octokit: GitHub, context: ActionContext): Promise<void> => runCreatePr(true, pullsForClosed, octokit, context);

export const execute = async(octokit: GitHub, context: ActionContext): Promise<void> => {
	if (isClosePR(context)) {
		await runCreatePrClosed(octokit, context);
	} else if (isPush(context.actionContext)) {
		await outputResult(await createCommit(false, commonLogger, octokit, context), true);
	} else if (isPr(context.actionContext)) {
		await outputResult(await createPr(false, false, getHelper(context), commonLogger, octokit, context), true);
	} else {
		await runCreatePrAll(octokit, context);
	}

	commonLogger.endProcess();
};
