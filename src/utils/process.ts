import { getInput } from '@actions/core';
import { GitHub } from '@actions/github';
import { Logger, GitHelper, Utils, ContextHelper } from '@technote-space/github-action-helper';
import { PullsListResponseItem } from '@octokit/rest';
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
} from './misc';
import { INTERVAL_MS } from '../constant';
import { ActionContext, ProcessResult } from '../types';

const {sleep, getBranch}     = Utils;
const {isPr, isCron, isPush} = ContextHelper;
const commonLogger           = new Logger(replaceDirectory);

const getResult = (result: boolean, detail: string, context: ActionContext): ProcessResult => ({
	result,
	detail,
	branch: getPrHeadRef(context),
});

const checkActionPr = async(helper: GitHelper, logger: Logger, octokit: GitHub, context: ActionContext): Promise<ProcessResult> => {
	const pr = await getApiHelper(logger).findPullRequest(getPrHeadRef(context), octokit, context.actionContext);
	if (!pr) {
		return getResult(false, 'not found', context);
	}
	const basePr = await getApiHelper(logger).findPullRequest(pr.base.ref, octokit, context.actionContext);
	if (!basePr) {
		return getResult(false, 'Base PullRequest not found', context);
	}
	if (basePr.state === 'open') {
		return getResult(false, 'Base PullRequest has been closed', context);
	}
	await closePR(getPrHeadRef(context), logger, octokit, context, '');
	return getResult(true, 'has been closed because base PullRequest has been closed', context);
};

const createPr = async(helper: GitHelper, logger: Logger, octokit: GitHub, context: ActionContext): Promise<ProcessResult> => {
	if (!isTargetBranch(getPrHeadRef(context), context)) {
		return getResult(false, 'This is not target branch', context);
	}
	if (isActionPr(context)) {
		return checkActionPr(helper, logger, octokit, context);
	}
	if (isCron(context.actionContext)) {
		commonLogger.startProcess('Target PullRequest Ref [%s]', getPrHeadRef(context));
	}

	let mergeable    = false;
	const branchName = getPrBranchName(context);

	const {files, output} = await getChangedFiles(helper, logger, context);
	if (!files.length) {
		logger.info('There is no diff.');
		const pr = await getApiHelper(logger).findPullRequest(branchName, octokit, context.actionContext);
		if (!pr) {
			// There is no PR
			return getResult(true, 'There is no diff', context);
		}
		if (!(await getRefDiff(getPrHeadRef(context), helper, logger, context)).length) {
			// Close if there is no diff
			await closePR(branchName, logger, octokit, context);
			return getResult(true, 'There is no reference diff', context);
		}
		mergeable = await isMergeable(pr.number, octokit, context);
	} else {
		// Commit local diffs
		await commit(helper, logger, context);
		if (!(await getRefDiff(getPrHeadRef(context), helper, logger, context)).length) {
			// Close if there is no diff
			await closePR(branchName, logger, octokit, context);
			return getResult(true, 'There is no reference diff', context);
		}
		await push(branchName, helper, logger, context);
		mergeable = await updatePr(branchName, files, output, logger, octokit, context);
	}

	if (!mergeable) {
		// Resolve conflicts if PR is not mergeable
		await resolveConflicts(branchName, helper, logger, octokit, context);
	}

	return getResult(true, 'updated', context);
};

const createCommit = async(helper: GitHelper, logger: Logger, octokit: GitHub, context: ActionContext): Promise<void> => {
	const branchName = getBranch(context.actionContext);
	if (!isTargetBranch(branchName, context, false)) {
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
	const processed = results.filter(item => item.result).length;
	commonLogger.startProcess('Total:%d  Processed:%d  Skipped:%d', total, processed, total - processed);
	results.forEach(result => {
		if (result.result) {
			commonLogger.info(commonLogger.c('✔', 'green') + '\t[%s] %s', result.branch, result.detail);
		} else {
			commonLogger.info(commonLogger.c('→', 'yellow') + '\t[%s] %s', result.branch, result.detail);
		}
	});
};

const getActionContext = (context: ActionContext, pull: PullsListResponseItem): ActionContext => ({
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
});

export const execute = async(context: ActionContext): Promise<void> => {
	const octokit = new GitHub(getInput('GITHUB_TOKEN', {required: true}));
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
		for await (const pull of getApiHelper(logger).pullsList({}, octokit, context.actionContext)) {
			if (results.length) {
				await sleep(INTERVAL_MS);
			}
			results.push(await createPr(helper, logger, octokit, getActionContext(context, pull)));
		}
		await outputResults(results);
	}
	commonLogger.endProcess();
};