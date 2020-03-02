import { getInput } from '@actions/core' ;
import { Octokit } from '@octokit/rest';
import { Logger, GitHelper, Utils, ContextHelper, ApiHelper } from '@technote-space/github-action-helper';
import {
	getActionDetail,
	isDisabledDeletePackage,
	filterExtension,
	getPrHeadRef,
	getPrBaseRef,
	getContextBranch,
	getGitFilterStatus,
	getCacheKey,
	getCache,
	isActiveTriggerWorkflow,
	getTriggerWorkflowMessage,
	getApiToken,
} from './misc';
import {
	getPrBranchName,
	getCommitName,
	getCommitEmail,
	getCommitMessage,
	getPrTitle,
	getPrBody,
} from './variables';
import { ActionContext, CommandOutput, ExecuteTask, Null } from '../types';

const {getWorkspace, useNpm, getOctokit} = Utils;
const {getLocalRefspec, getRefspec}      = Utils;
const {getRepository, isPush}            = ContextHelper;

export const getApiHelper = (octokit: Octokit, context: ActionContext, logger?: Logger): ApiHelper => new ApiHelper(octokit, context.actionContext, logger);

export const clone = async(helper: GitHelper, logger: Logger, octokit: Octokit, context: ActionContext): Promise<void> => {
	const branchName = await getPrBranchName(helper, octokit, context);
	logger.startProcess('Fetching...');
	helper.useOrigin(true);
	await helper.fetchOrigin(getWorkspace(), context.actionContext, ['--no-tags'], [getRefspec(branchName)]);

	logger.startProcess('Switching branch to [%s]...', branchName);
	await helper.switchBranch(getWorkspace(), branchName);
};

export const checkBranch = async(helper: GitHelper, logger: Logger, octokit: Octokit, context: ActionContext): Promise<boolean> => {
	const clonedBranch = await helper.getCurrentBranchName(getWorkspace());
	const branchName   = await getPrBranchName(helper, octokit, context);
	if (branchName === clonedBranch) {
		await helper.runCommand(getWorkspace(), {
			command: 'git reset',
			args: ['--hard'],
		});
		await helper.runCommand(getWorkspace(),
			{
				command: 'git merge',
				args: ['--no-edit', getLocalRefspec(branchName)],
			},
		);
		await helper.runCommand(getWorkspace(), 'ls -la');
		return !isPush(context.actionContext);
	}

	if (isPush(context.actionContext)) {
		throw new Error(`remote branch [${branchName}] not found.`);
	}

	logger.info('remote branch [%s] not found.', branchName);
	logger.info('now branch: %s', clonedBranch);
	const headRef = getPrHeadRef(context);
	logger.startProcess('Cloning [%s] from the remote repo...', headRef);
	await helper.fetchOrigin(getWorkspace(), context.actionContext, ['--no-tags'], [getRefspec(headRef)]);
	await helper.switchBranch(getWorkspace(), headRef);
	await helper.createBranch(getWorkspace(), branchName);
	await helper.runCommand(getWorkspace(), 'ls -la');
	return false;
};

const getClearPackageCommands = (context: ActionContext): string[] => {
	if (isDisabledDeletePackage(context)) {
		return [];
	}

	return [
		'rm -f package.json',
		'rm -f package-lock.json',
		'rm -f yarn.lock',
	];
};

const getGlobalInstallPackagesCommands = (context: ActionContext): string[] => {
	const packages = getActionDetail<string[]>('globalInstallPackages', context, () => []);
	if (packages.length) {
		if (useNpm(getWorkspace(), getInput('PACKAGE_MANAGER'))) {
			return [
				'sudo npm install -g ' + packages.join(' '),
			];
		} else {
			return [
				'sudo yarn global add ' + packages.join(' '),
			];
		}
	}

	return [];
};

const getDevInstallPackagesCommands = (context: ActionContext): string[] => {
	const packages = getActionDetail<string[]>('devInstallPackages', context, () => []);
	if (packages.length) {
		if (useNpm(getWorkspace(), getInput('PACKAGE_MANAGER'))) {
			return [
				'npm install --save-dev ' + packages.join(' '),
			];
		} else {
			return [
				'yarn add --dev ' + packages.join(' '),
			];
		}
	}

	return [];
};

const getInstallPackagesCommands = (context: ActionContext): string[] => {
	const packages = getActionDetail<string[]>('installPackages', context, () => []);
	if (packages.length) {
		if (useNpm(getWorkspace(), getInput('PACKAGE_MANAGER'))) {
			return [
				'npm install --save ' + packages.join(' '),
			];
		} else {
			return [
				'yarn add ' + packages.join(' '),
			];
		}
	}

	return [];
};

const getExecuteCommands = (context: ActionContext): (string | ExecuteTask)[] => getActionDetail<(string | ExecuteTask)[]>('executeCommands', context, () => []);

export const getDiff = async(helper: GitHelper, logger: Logger): Promise<string[]> => {
	logger.startProcess('Checking diff...');

	await helper.runCommand(getWorkspace(), 'git add --all');
	return await helper.getDiff(getWorkspace());
};

export const getRefDiff = async(compare: string, helper: GitHelper, logger: Logger, context: ActionContext): Promise<string[]> => {
	logger.startProcess('Checking references diff...');

	await helper.fetchBranch(getWorkspace(), compare, context.actionContext);
	return (await helper.getRefDiff(getWorkspace(), 'HEAD', compare, getGitFilterStatus(context), '..')).filter(line => filterExtension(line, context));
};

const initDirectory = async(helper: GitHelper, logger: Logger, context: ActionContext): Promise<void> => {
	logger.startProcess('Initializing working directory...');

	helper.useOrigin(true);
	await helper.addOrigin(getWorkspace(), context.actionContext);
};

export const config = async(helper: GitHelper, logger: Logger, context: ActionContext): Promise<void> => await helper.config(getWorkspace(), getCommitName(context), getCommitEmail(context));

export const merge = async(branch: string, helper: GitHelper, logger: Logger, context: ActionContext): Promise<boolean> => {
	logger.startProcess('Merging [%s] branch...', getLocalRefspec(branch));
	await helper.fetchOrigin(getWorkspace(), context.actionContext, ['--no-tags'], [getRefspec(branch)]);
	await config(helper, logger, context);
	const results = await helper.runCommand(getWorkspace(),
		{
			command: 'git merge',
			args: ['--no-edit', getLocalRefspec(branch)],
			suppressError: true,
		},
	);

	return !results[0].stdout.some(RegExp.prototype.test, /^CONFLICT /);
};

export const abortMerge = async(helper: GitHelper, logger: Logger): Promise<void> => {
	logger.startProcess('Aborting merge...');
	await helper.runCommand(getWorkspace(), 'git merge --abort');
};

export const commit = async(helper: GitHelper, logger: Logger, context: ActionContext): Promise<void> => {
	await config(helper, logger, context);

	logger.startProcess('Committing...');
	await helper.makeCommit(getWorkspace(), getCommitMessage(context));
};

export const push = async(branchName: string, helper: GitHelper, logger: Logger, context: ActionContext): Promise<void> => {
	logger.startProcess('Pushing to %s@%s...', getRepository(context.actionContext), branchName);

	await helper.push(getWorkspace(), branchName, context.actionContext);
};

const forcePush = async(branchName: string, helper: GitHelper, logger: Logger, context: ActionContext): Promise<void> => {
	logger.startProcess('Pushing to %s@%s...', getRepository(context.actionContext), branchName);

	await helper.forcePush(getWorkspace(), branchName, context.actionContext);
};

export const isMergeable = async(number: number, octokit: Octokit, context: ActionContext): Promise<boolean> => getCache<boolean>(getCacheKey('pulls.get', {
	owner: context.actionContext.repo.owner,
	repo: context.actionContext.repo.repo,
	'pull_number': number,
}), async() => (await octokit.pulls.get({
	owner: context.actionContext.repo.owner,
	repo: context.actionContext.repo.repo,
	'pull_number': number,
})).data.mergeable, context);

export const afterCreatePr = async(branchName: string, number: number, helper: GitHelper, logger: Logger, octokit: Octokit, context: ActionContext): Promise<void> => {
	if (context.actionDetail.labels?.length) {
		logger.info('Adding labels...');
		console.log(context.actionDetail.labels);
		await octokit.issues.addLabels({
			...context.actionContext.repo,
			'issue_number': number,
			labels: context.actionDetail.labels,
		});
	}

	if (context.actionDetail.assignees?.length) {
		logger.info('Adding assignees...');
		console.log(context.actionDetail.assignees);
		await octokit.issues.addAssignees({
			...context.actionContext.repo,
			'issue_number': number,
			assignees: context.actionDetail.assignees,
		});
	}

	if (context.actionDetail.reviewers?.length || context.actionDetail.teamReviewers?.length) {
		logger.info('Adding reviewers...');
		console.log(context.actionDetail.reviewers);
		console.log(context.actionDetail.teamReviewers);
		await octokit.pulls.createReviewRequest({
			...context.actionContext.repo,
			'pull_number': number,
			reviewers: context.actionDetail.reviewers,
			'team_reviewers': context.actionDetail.teamReviewers,
		});
	}

	if (isActiveTriggerWorkflow(context)) {
		// add empty commit to trigger pr event
		await helper.runCommand(getWorkspace(), {
			command: 'git commit',
			args: [
				'--allow-empty',
				'-qm',
				getTriggerWorkflowMessage(context),
			],
		});
		await push(branchName, helper, logger, context);
	}
};

export const updatePr = async(branchName: string, files: string[], output: CommandOutput[], helper: GitHelper, logger: Logger, octokit: Octokit, context: ActionContext): Promise<boolean> => {
	const apiHelper = getApiHelper(getOctokit(getApiToken()), context, logger);
	const pr        = await apiHelper.findPullRequest(branchName);
	if (pr) {
		logger.startProcess('Creating comment to PullRequest...');
		await apiHelper.createCommentToPr(branchName, await getPrBody(true, files, output, helper, octokit, context));
		return isMergeable(pr.number, octokit, context);
	}

	logger.startProcess('Creating PullRequest...');
	const {data: {number}} = await apiHelper.pullsCreate(branchName, {
		title: await getPrTitle(helper, octokit, context),
		body: await getPrBody(false, files, output, helper, octokit, context),
	});

	await afterCreatePr(branchName, number, helper, logger, octokit, context);

	return true;
};

const runCommand = async(command: string | ExecuteTask, helper: GitHelper, logger: Logger, context: ActionContext): Promise<CommandOutput> => {
	if ('string' === typeof command) {
		return (await helper.runCommand(getWorkspace(), command))[0];
	}

	const result = await command(context, helper, logger);
	logger.displayCommand(result.command);
	if (result.stdout.length) {
		logger.displayStdout(result.stdout);
	}
	if (result.stderr.length) {
		logger.displayStderr(result.stderr);
	}

	return result;
};

const runCommands = async(helper: GitHelper, logger: Logger, context: ActionContext): Promise<{
	files: string[];
	output: Array<CommandOutput>;
}> => {
	const commands: (string | ExecuteTask)[] = ([] as (string | ExecuteTask)[]).concat.apply([], [
		getClearPackageCommands(context),
		getGlobalInstallPackagesCommands(context),
		getDevInstallPackagesCommands(context),
		getInstallPackagesCommands(context),
		getExecuteCommands(context),
	]);

	logger.startProcess('Running commands...');
	const output = await commands.reduce(async(prev, command) => {
		const acc = await prev;
		return acc.concat(await runCommand(command, helper, logger, context));
	}, Promise.resolve([] as Array<CommandOutput>));

	return {
		files: await getDiff(helper, logger),
		output,
	};
};

export const getChangedFiles = async(helper: GitHelper, logger: Logger, octokit: Octokit, context: ActionContext): Promise<{
	files: string[];
	output: CommandOutput[];
}> => {
	await clone(helper, logger, octokit, context);
	if (await checkBranch(helper, logger, octokit, context)) {
		if (!await merge(getContextBranch(context), helper, logger, context)) {
			await abortMerge(helper, logger);
		}
	}

	return runCommands(helper, logger, context);
};

export const getChangedFilesForRebase = async(helper: GitHelper, logger: Logger, octokit: Octokit, context: ActionContext): Promise<{
	files: string[];
	output: CommandOutput[];
}> => {
	await initDirectory(helper, logger, context);
	await helper.cloneBranch(getWorkspace(), getPrBaseRef(context), context.actionContext);
	await helper.createBranch(getWorkspace(), await getPrBranchName(helper, octokit, context));

	return runCommands(helper, logger, context);
};

export const closePR = async(branchName: string, logger: Logger, context: ActionContext, message?: string): Promise<void> => getApiHelper(getOctokit(getApiToken()), context, logger).closePR(branchName, message ?? context.actionDetail.prCloseMessage);

export const resolveConflicts = async(branchName: string, helper: GitHelper, logger: Logger, octokit: Octokit, context: ActionContext): Promise<void> => {
	if (await merge(getContextBranch(context), helper, logger, context)) {
		// succeeded to merge
		await push(branchName, helper, logger, context);
	} else {
		// failed to merge
		const {files, output} = await getChangedFilesForRebase(helper, logger, octokit, context);
		if (!files.length) {
			await closePR(branchName, logger, context);
			return;
		}
		await commit(helper, logger, context);
		await forcePush(branchName, helper, logger, context);
		await getApiHelper(getOctokit(getApiToken()), context, logger).pullsCreateOrUpdate(branchName, {
			title: await getPrTitle(helper, octokit, context),
			body: await getPrBody(false, files, output, helper, octokit, context),
		});
	}
};

export const getDefaultBranch = async(octokit: Octokit, context: ActionContext): Promise<string> => getCache<string>(getCacheKey('repos', {
	owner: context.actionContext.repo.owner,
	repo: context.actionContext.repo.repo,
}), async() => await getApiHelper(octokit, context).getDefaultBranch(), context);

export const getCurrentVersion = async(octokit: Octokit, context: ActionContext): Promise<string> => getCache<string>(getCacheKey('current-version'), async() => await getApiHelper(octokit, context).getLastTag(), context);

export const getNewPatchVersion = async(octokit: Octokit, context: ActionContext): Promise<string> => getCache<string>(getCacheKey('new-patch-version'), async() => await getApiHelper(octokit, context).getNewPatchVersion(), context);

export const getNewMinorVersion = async(octokit: Octokit, context: ActionContext): Promise<string> => getCache<string>(getCacheKey('new-minor-version'), async() => await getApiHelper(octokit, context).getNewMinorVersion(), context);

export const getNewMajorVersion = async(octokit: Octokit, context: ActionContext): Promise<string> => getCache<string>(getCacheKey('new-major-version'), async() => await getApiHelper(octokit, context).getNewMajorVersion(), context);

export const findPR = async(branchName: string, octokit: Octokit, context: ActionContext): Promise<Octokit.PullsListResponseItem | Null> => getCache(getCacheKey('pr', {branchName}), async() => getApiHelper(octokit, context).findPullRequest(branchName), context);
