import { GitHub } from '@actions/github';
import { Logger, GitHelper, Utils, ContextHelper } from '@technote-space/github-action-helper';
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
} from './command';
import {
	replaceDirectory,
	getPrBranchName,
	isActionPr,
	isClosePR,
	isTargetBranch,
	getPrHeadRef,
	getHelper,
	checkDefaultBranch,
	getPullsArgsForDefaultBranch,
} from './misc';
import { INTERVAL_MS } from '../constant';
import { ActionContext, ProcessResult, PullsParams } from '../types';

const {sleep, getBranch}     = Utils;
const {isPr, isCron, isPush} = ContextHelper;
const commonLogger           = new Logger(replaceDirectory);

const getResult = (result: 'succeeded' | 'failed' | 'skipped', detail: string, context: ActionContext): ProcessResult => ({
	result,
	detail,
	branch: getPrHeadRef(context),
});

const checkActionPr = async(helper: GitHelper, logger: Logger, octokit: GitHub, context: ActionContext): Promise<ProcessResult | true> => {
	const pr = await getApiHelper(logger).findPullRequest(getPrHeadRef(context), octokit, context.actionContext);
	if (!pr) {
		return getResult('failed', 'not found', context);
	}
	if (pr.base.ref === context.defaultBranch) {
		return true;
	}
	const basePr = await getApiHelper(logger).findPullRequest(pr.base.ref, octokit, context.actionContext);
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

const createPr = async(helper: GitHelper, logger: Logger, octokit: GitHub, context: ActionContext): Promise<ProcessResult> => {
	if (!isTargetBranch(getPrHeadRef(context), context)) {
		return getResult('skipped', 'This is not target branch', context);
	}
	if (isCron(context.actionContext)) {
		commonLogger.startProcess('Target PullRequest Ref [%s]', getPrHeadRef(context));
	}
	if (isActionPr(context)) {
		const result = await checkActionPr(helper, logger, octokit, context);
		if (result !== true) {
			return result;
		}
	}

	let mergeable    = false;
	const branchName = getPrBranchName(context);

	const {files, output}               = await getChangedFiles(helper, logger, context);
	let result: 'succeeded' | 'skipped' = 'succeeded';
	let detail                          = 'updated';
	if (!files.length) {
		logger.info('There is no diff.');
		const pr = await getApiHelper(logger).findPullRequest(branchName, octokit, context.actionContext);
		if (!pr) {
			// There is no PR
			return getResult('skipped', 'There is no diff', context);
		}
		if (!(await getRefDiff(getPrHeadRef(context), helper, logger, context)).length) {
			// Close if there is no diff
			await closePR(branchName, logger, octokit, context);
			return getResult('succeeded', 'There is no reference diff', context);
		}
		mergeable = await isMergeable(pr.number, octokit, context);
		if (mergeable) {
			result = 'skipped';
			detail = 'There is no diff';
		}
	} else {
		// Commit local diffs
		await commit(helper, logger, context);
		if (!(await getRefDiff(getPrHeadRef(context), helper, logger, context)).length) {
			// Close if there is no diff
			await closePR(branchName, logger, octokit, context);
			return getResult('succeeded', 'has been closed because there is no reference diff', context);
		}
		await push(branchName, helper, logger, context);
		mergeable = await updatePr(branchName, files, output, logger, octokit, context);
	}

	if (!mergeable) {
		// Resolve conflicts if PR is not mergeable
		await resolveConflicts(branchName, helper, logger, octokit, context);
	}

	return getResult(result, detail, context);
};

const createCommit = async(helper: GitHelper, logger: Logger, octokit: GitHub, context: ActionContext): Promise<void> => {
	const branchName = getBranch(context.actionContext);
	if (!isTargetBranch(branchName, context)) {
		return;
	}

	const {files} = await getChangedFiles(helper, logger, context);
	if (!files.length) {
		logger.info('There is no diff.');
		return;
	}

	await commit(helper, logger, context);
	try {
		await push(branchName, helper, logger, context);
	} catch (error) {
		if (/protected branch hook declined/.test(error.message)) {
			logger.warn('Branch [%s] is protected.', branchName);
			return;
		}
		throw error;
	}
};

const outputResults = async(results: ProcessResult[]): Promise<void> => {
	const total     = results.length;
	const succeeded = results.filter(item => item.result === 'succeeded').length;
	const failed    = results.filter(item => item.result === 'failed').length;
	const mark      = {
		'succeeded': commonLogger.c('✔', 'green'),
		'failed': commonLogger.c('×', 'red'),
		'skipped': commonLogger.c('→', 'yellow'),
	};
	commonLogger.startProcess('Total:%d  Succeeded:%d  Failed:%d  Skipped:%d', total, succeeded, failed, total - succeeded - failed);
	results.forEach(result => {
		commonLogger.info(mark[result.result] + '\t[%s] %s', result.branch, result.detail);
	});
};

const getActionContext = (context: ActionContext, pull: PullsParams): ActionContext => ({
	actionContext: Object.assign({}, context.actionContext, {
		payload: {
			'pull_request': {
				number: pull.number,
				id: pull.id,
				head: pull.head,
				base: pull.base,
				title: pull.title,
				'html_url': pull.html_url,
			},
		},
		repo: {
			owner: pull.base.repo.owner.login,
			repo: pull.base.repo.name,
		},
		ref: pull.head.ref,
	}),
	actionDetail: context.actionDetail,
	defaultBranch: context.defaultBranch,
});

export const execute = async(octokit: GitHub, context: ActionContext): Promise<void> => {
	if (isClosePR(context)) {
		await closePR(getPrBranchName(context), commonLogger, octokit, context);
		return;
	}

	const helper = getHelper(context);
	if (isPush(context.actionContext)) {
		await createCommit(helper, commonLogger, octokit, context);
	} else if (isPr(context.actionContext)) {
		await createPr(helper, commonLogger, octokit, context);
	} else {
		const logger                   = new Logger(replaceDirectory, true);
		const results: ProcessResult[] = [];
		if (checkDefaultBranch(context)) {
			try {
				results.push(await createPr(helper, logger, octokit, getActionContext(context, getPullsArgsForDefaultBranch(context))));
			} catch (error) {
				results.push(getResult('failed', error.message, getActionContext(context, getPullsArgsForDefaultBranch(context))));
			}
		}
		for await (const pull of getApiHelper(logger).pullsList({}, octokit, context.actionContext)) {
			await sleep(INTERVAL_MS);
			try {
				results.push(await createPr(helper, logger, octokit, getActionContext(context, pull)));
			} catch (error) {
				results.push(getResult('failed', error.message, getActionContext(context, pull)));
			}
		}
		await outputResults(results);
	}
	commonLogger.endProcess();
};
