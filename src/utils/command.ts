import { Context } from '@actions/github/lib/context';
import { mkdirSync } from 'fs';
import { Logger, GitHelper, Utils, ContextHelper, ApiHelper } from '@technote-space/github-action-helper';
import { GitHub } from '@actions/github';
import { getInput } from '@actions/core' ;
import {
	getActionDetail,
	isDisabledDeletePackage,
	filterExtension,
	getPrHeadRef,
	getGitFilterStatus,
} from './misc';
import {
	getPrBranchName,
	getCommitName,
	getCommitEmail,
	getCommitMessage,
	getPrTitle,
	getPrBody,
} from './variables';
import { ActionContext } from '../types';

const {getWorkspace, useNpm}  = Utils;
const {getRepository, isPush} = ContextHelper;
const cache                   = {};

export const clearCache = (): void => Object.getOwnPropertyNames(cache).forEach(prop => delete cache[prop]);

export const getApiHelper = (logger: Logger): ApiHelper => new ApiHelper(logger);

export const clone = async(helper: GitHelper, logger: Logger, context: ActionContext): Promise<void> => {
	logger.startProcess('Fetching...');
	await helper.fetchOrigin(getWorkspace(), context.actionContext);

	const branchName = await getPrBranchName(helper, context);
	logger.startProcess('Switching branch to [%s]...', branchName);
	await helper.switchBranch(getWorkspace(), branchName);
};

export const checkBranch = async(helper: GitHelper, logger: Logger, context: ActionContext): Promise<boolean> => {
	const clonedBranch = await helper.getCurrentBranchName(getWorkspace());
	const branchName   = await getPrBranchName(helper, context);
	if (branchName === clonedBranch) {
		await helper.runCommand(getWorkspace(), 'ls -la');
		return !isPush(context.actionContext);
	}

	if (isPush(context.actionContext)) {
		throw new Error(`remote branch [${branchName}] not found.`);
	}

	logger.info('remote branch [%s] not found.', branchName);
	logger.info('now branch: %s', clonedBranch);
	logger.startProcess('Cloning [%s] from the remote repo...', getPrHeadRef(context));
	await helper.cloneBranch(getWorkspace(), getPrHeadRef(context), context.actionContext);
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

const normalizeCommand = (command: string): string => command.trim().replace(/\s{2,}/g, ' ');

const getExecuteCommands = (context: ActionContext): string[] => getActionDetail<string[]>('executeCommands', context, () => []).map(normalizeCommand);

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

const initDirectory = async(helper: GitHelper, logger: Logger): Promise<void> => {
	logger.startProcess('Initializing working directory...');

	await helper.runCommand(getWorkspace(), 'rm -rdf ./* ./.[!.]*');
	mkdirSync(getWorkspace(), {recursive: true});
};

export const config = async(helper: GitHelper, logger: Logger, context: ActionContext): Promise<void> => {
	const name  = getCommitName(context);
	const email = getCommitEmail(context);

	logger.startProcess('Configuring git committer to be %s <%s>', name, email);

	await helper.config(getWorkspace(), name, email);
};

export const merge = async(branch: string, helper: GitHelper, logger: Logger, context: ActionContext): Promise<boolean> => {
	await config(helper, logger, context);

	logger.startProcess('Merging [%s] branch...', branch.replace(/^(refs\/)?heads/, ''));
	const results = await helper.runCommand(getWorkspace(),
		`git merge --no-edit origin/${branch.replace(/^(refs\/)?heads/, '')} || :`,
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

	await helper.push(getWorkspace(), branchName, false, context.actionContext);
};

const forcePush = async(branchName: string, helper: GitHelper, logger: Logger, context: ActionContext): Promise<void> => {
	logger.startProcess('Pushing to %s@%s...', getRepository(context.actionContext), branchName);

	await helper.forcePush(getWorkspace(), branchName, context.actionContext);
};

const getCacheKey = (method: string, args: object): string => method + JSON.stringify(args);

export const isMergeable = async(number: number, octokit: GitHub, context: ActionContext): Promise<boolean> => {
	const key = getCacheKey('pulls.get', {
		owner: context.actionContext.repo.owner,
		repo: context.actionContext.repo.repo,
		'pull_number': number,
	});
	if (!(key in cache)) {
		// eslint-disable-next-line require-atomic-updates
		cache[key] = (await octokit.pulls.get({
			owner: context.actionContext.repo.owner,
			repo: context.actionContext.repo.repo,
			'pull_number': number,
		})).data.mergeable;
	}
	return cache[key];
};

export const updatePr = async(branchName: string, files: string[], output: {
	command: string;
	stdout: string[];
	stderr: string[];
}[], helper: GitHelper, logger: Logger, octokit: GitHub, context: ActionContext): Promise<boolean> => {
	const info = await getApiHelper(logger).pullsCreateOrComment(branchName, {
		title: await getPrTitle(helper, context),
		body: await getPrBody(files, output, helper, context),
	}, octokit, context.actionContext);

	if (!info.isPrCreated) {
		// updated PR
		return isMergeable(info.number, octokit, context);
	}
	return true;
};

const runCommands = async(helper: GitHelper, logger: Logger, context: ActionContext): Promise<{
	files: string[];
	output: {
		command: string;
		stdout: string[];
		stderr: string[];
	}[];
}> => {
	const commands: string[] = ([] as string[]).concat.apply([], [
		getClearPackageCommands(context),
		getGlobalInstallPackagesCommands(context),
		getDevInstallPackagesCommands(context),
		getInstallPackagesCommands(context),
		getExecuteCommands(context),
	]);

	logger.startProcess('Running commands...');
	const output = await helper.runCommand(getWorkspace(), commands);

	return {
		files: await getDiff(helper, logger),
		output,
	};
};

export const getChangedFiles = async(helper: GitHelper, logger: Logger, context: ActionContext): Promise<{
	files: string[];
	output: {
		command: string;
		stdout: string[];
		stderr: string[];
	}[];
}> => {
	await initDirectory(helper, logger);
	await clone(helper, logger, context);
	if (await checkBranch(helper, logger, context)) {
		if (!await merge(getPrHeadRef(context), helper, logger, context)) {
			await abortMerge(helper, logger);
		}
	}

	return runCommands(helper, logger, context);
};

export const getChangedFilesForRebase = async(helper: GitHelper, logger: Logger, context: ActionContext): Promise<{
	files: string[];
	output: {
		command: string;
		stdout: string[];
		stderr: string[];
	}[];
}> => {
	await initDirectory(helper, logger);
	await helper.cloneBranch(getWorkspace(), getPrHeadRef(context), context.actionContext);
	await helper.createBranch(getWorkspace(), await getPrBranchName(helper, context));

	return runCommands(helper, logger, context);
};

export const closePR = async(branchName: string, logger: Logger, octokit: GitHub, context: ActionContext, message?: string): Promise<void> => getApiHelper(logger).closePR(branchName, octokit, context.actionContext, message ?? context.actionDetail.prCloseMessage);

export const resolveConflicts = async(branchName: string, helper: GitHelper, logger: Logger, octokit: GitHub, context: ActionContext): Promise<void> => {
	if (await merge(getPrHeadRef(context), helper, logger, context)) {
		// succeeded to merge
		await push(branchName, helper, logger, context);
	} else {
		// failed to merge
		const {files, output} = await getChangedFilesForRebase(helper, logger, context);
		if (!files.length) {
			await closePR(branchName, logger, octokit, context);
			return;
		}
		await commit(helper, logger, context);
		await forcePush(branchName, helper, logger, context);
		await getApiHelper(logger).pullsCreateOrUpdate(branchName, {
			title: await getPrTitle(helper, context),
			body: await getPrBody(files, output, helper, context),
		}, octokit, context.actionContext);
	}
};

export const getDefaultBranch = async(octokit: GitHub, context: Context): Promise<string> => {
	const key = getCacheKey('repos', {
		owner: context.repo.owner,
		repo: context.repo.repo,
	});
	if (!(key in cache)) {
		// eslint-disable-next-line require-atomic-updates
		cache[key] = (await octokit.repos.get({
			owner: context.repo.owner,
			repo: context.repo.repo,
		})).data.default_branch;
	}
	return cache[key];
};


export const getNewPatchVersion = async(helper: GitHelper, context: ActionContext): Promise<string> => {
	if (!context.newPatchVersion) {
		// eslint-disable-next-line require-atomic-updates
		context.newPatchVersion = await helper.getNewPatchVersion(getWorkspace());
	}
	return context.newPatchVersion;
};
