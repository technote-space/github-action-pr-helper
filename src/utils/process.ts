import { getInput } from '@actions/core';
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
} from './misc';
import { INTERVAL_MS } from '../constant';
import { ActionContext } from '../types';

const {sleep, getBranch}     = Utils;
const {isPr, isCron, isPush} = ContextHelper;
const commonLogger           = new Logger(replaceDirectory);

const createPr = async(helper: GitHelper, logger: Logger, octokit: GitHub, context: ActionContext): Promise<boolean> => {
	if (isActionPr(context) || !isTargetBranch(getPrHeadRef(context), context)) {
		return false;
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
			return true;
		}
		if (!(await getRefDiff(getPrHeadRef(context), helper, logger, context)).length) {
			// Close if there is no diff
			await closePR(branchName, logger, octokit, context);
			return true;
		}
		mergeable = await isMergeable(pr.number, octokit, context);
	} else {
		// Commit local diffs
		await commit(helper, logger, context);
		if (!(await getRefDiff(getPrHeadRef(context), helper, logger, context)).length) {
			// Close if there is no diff
			await closePR(branchName, logger, octokit, context);
			return true;
		}
		await push(branchName, helper, logger, context);
		mergeable = await updatePr(branchName, files, output, logger, octokit, context);
	}

	if (!mergeable) {
		// Resolve conflicts if PR is not mergeable
		await resolveConflicts(branchName, helper, logger, octokit, context);
	}

	if (isCron(context.actionContext)) {
		// Sleep
		await sleep(INTERVAL_MS);
	}
	return true;
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
		const logger  = new Logger(replaceDirectory, true);
		let total     = 0;
		let processed = 0;
		for await (const pull of getApiHelper(logger).pullsList({}, octokit, context.actionContext)) {
			total++;
			if (await createPr(helper, logger, octokit, {
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
			})) {
				processed++;
			}
		}
		commonLogger.startProcess('Total:%d  Processed:%d  Skipped:%d', total, processed, total - processed);
	}
	commonLogger.endProcess();
};