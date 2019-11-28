import { Utils, ContextHelper, GitHelper, Logger } from '@technote-space/github-action-helper';
import { isTargetEvent, isTargetLabels } from '@technote-space/filter-github-action';
import moment from 'moment';
import { DEFAULT_TARGET_EVENTS, DEFAULT_COMMIT_NAME, DEFAULT_COMMIT_EMAIL } from '../constant';
import { ActionContext, PullsParams } from '../types';
import { getNewPatchVersion } from './command';

const {getWorkspace, getPrefixRegExp, getRegExp} = Utils;
const {escapeRegExp, replaceAll, getBranch}      = Utils;
const {isPr, isCron, isPush}                     = ContextHelper;

export const getActionDetail = <T>(key: string, context: ActionContext, defaultValue?: T): T => {
	if (undefined === defaultValue && !(key in context.actionDetail)) {
		throw new Error(`parameter [${key}] is required.`);
	}
	if (undefined === defaultValue && typeof context.actionDetail[key] === 'string' && context.actionDetail[key].trim() === '') {
		throw new Error(`parameter [${key}] is required.`);
	}
	return context.actionDetail[key] ?? defaultValue;
};

export const getCommitMessage = (context: ActionContext): string => getActionDetail<string>('commitMessage', context);

export const getCommitName = (context: ActionContext): string => getActionDetail<string>('commitName', context, DEFAULT_COMMIT_NAME);

export const getCommitEmail = (context: ActionContext): string => getActionDetail<string>('commitEmail', context, DEFAULT_COMMIT_EMAIL);

export const replaceDirectory = (message: string): string => {
	const workDir = getWorkspace();
	return replaceAll(replaceAll(message, ` -C ${workDir}`, ''), workDir, '[Working Directory]');
};

const getVariable = (index: number, context: ActionContext): string => getActionDetail<string[]>('prVariables', context)[index];

const getDate = (index: number, context: ActionContext): string => moment().format(getActionDetail<string[]>('prDateFormats', context)[index]);

const getDefaultBranchUrl = (context: ActionContext): string => `https://github.com/${context.actionContext.repo.owner}/${context.actionContext.repo.repo}/tree/${context.defaultBranch}`;

/**
 * @param {GitHelper} helper git helper
 * @param {ActionContext} context context
 * @return {{string, Function}[]} replacer
 */
const contextVariables = (helper: GitHelper, context: ActionContext): { key: string; replace: () => Promise<string> }[] => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const getPrParamFunc = (extractor: (pr: { [key: string]: any }) => string) => async(): Promise<string> => {
		if (!context.actionContext.payload.pull_request) {
			throw new Error('Invalid context.');
		}
		return extractor(context.actionContext.payload.pull_request);
	};
	return [
		{key: 'PR_NUMBER', replace: getPrParamFunc(pr => pr.number)},
		{key: 'PR_NUMBER_REF', replace: getPrParamFunc(pr => pr.number ? `#${pr.number}` : getDefaultBranchUrl(context))},
		{key: 'PR_ID', replace: getPrParamFunc(pr => pr.id)},
		{key: 'PR_HEAD_REF', replace: getPrParamFunc(pr => pr.head.ref)},
		{key: 'PR_BASE_REF', replace: getPrParamFunc(pr => pr.base.ref)},
		{key: 'PR_TITLE', replace: getPrParamFunc(pr => pr.title)},
		{key: 'PR_URL', replace: getPrParamFunc(pr => pr.html_url)},
		{key: 'PR_MERGE_REF', replace: getPrParamFunc(pr => pr.number ? `${pr.head.ref} -> ${pr.base.ref}` : context.defaultBranch)},
		{key: 'PATCH_VERSION', replace: (): Promise<string> => getNewPatchVersion(helper)},
		// eslint-disable-next-line no-magic-numbers
	].concat([...Array(context.actionDetail.prVariables?.length ?? 0).keys()].map(index => ({
		// eslint-disable-next-line no-magic-numbers
		key: `VARIABLE${index + 1}`, replace: async(): Promise<string> => getVariable(index, context),
		// eslint-disable-next-line no-magic-numbers
	}))).concat([...Array(context.actionDetail.prDateFormats?.length ?? 0).keys()].map(index => ({
		// eslint-disable-next-line no-magic-numbers
		key: `DATE${index + 1}`, replace: async(): Promise<string> => getDate(index, context),
	})));
};

/**
 * @param {string} string string
 * @param {object[]} variables variables
 * @return {string} replaced
 */
const replaceVariables = async(string: string, variables: { key: string; replace: () => Promise<string> }[]): Promise<string> => {
	let replaced = string;
	for (const variable of variables) {
		if (getRegExp(`\${${variable.key}}`).test(replaced)) {
			replaced = replaceAll(replaced, `\${${variable.key}}`, await variable.replace());
		}
	}
	return replaced;
};

/**
 * @param {string} string string
 * @param {GitHelper} helper git helper
 * @param {ActionDetails} context action details
 * @return {Promise<string>} replaced
 */
const replaceContextVariables = (string: string, helper: GitHelper, context: ActionContext): Promise<string> => replaceVariables(string, contextVariables(helper, context));

export const getPrHeadRef = (context: ActionContext): string => context.actionContext.payload.pull_request?.head.ref ?? '';

export const getPrBaseRef = (context: ActionContext): string => context.actionContext.payload.pull_request?.base.ref ?? '';

const getPrBranchPrefix = (context: ActionContext): string => context.actionDetail.prBranchPrefix || `${context.actionDetail.actionRepo}/`;

const getPrBranchPrefixForDefaultBranch = (context: ActionContext): string => context.actionDetail.prBranchPrefixForDefaultBranch || getPrBranchPrefix(context);

export const isActionPr = (context: ActionContext): boolean => getPrefixRegExp(getPrBranchPrefix(context)).test(getPrHeadRef(context)) || getPrefixRegExp(getPrBranchPrefixForDefaultBranch(context)).test(getPrHeadRef(context));

export const getPrBranchName = async(helper: GitHelper, context: ActionContext): Promise<string> =>
	isPush(context.actionContext) ?
		getBranch(context.actionContext) :
		(
			context.defaultBranch === getBranch(context.actionContext) ?
				getPrBranchPrefixForDefaultBranch(context) + await replaceContextVariables(getActionDetail<string>('prBranchNameForDefaultBranch', context, getActionDetail<string>('prBranchName', context)), helper, context) :
				getPrBranchPrefix(context) + await replaceContextVariables(getActionDetail<string>('prBranchName', context), helper, context)
		);

export const getPrTitle = async(helper: GitHelper, context: ActionContext): Promise<string> => replaceContextVariables(getActionDetail<string>('prTitle', context), helper, context);

export const getPrLink = (context: ActionContext): string => context.actionContext.payload.pull_request ? `[${context.actionContext.payload.pull_request.title}](${context.actionContext.payload.pull_request.html_url})` : '';

const prBodyVariables = (files: string[], output: {
	command: string;
	stdout: string[];
	stderr: string[];
}[], helper: GitHelper, context: ActionContext): { key: string; replace: () => Promise<string> }[] => {
	const toCode = (string: string): string => string.length ? ['', '```Shell', string, '```', ''].join('\n') : '';
	return [
		{
			key: 'PR_LINK',
			replace: async(): Promise<string> => getPrLink(context),
		},
		{
			key: 'COMMANDS',
			replace: async(): Promise<string> => output.length ? toCode(output.map(item => `$ ${item.command}`).join('\n')) : '',
		},
		{
			key: 'COMMANDS_STDOUT',
			replace: async(): Promise<string> => output.length ? '<details>\n' + output.map(item => [
				`<summary><em>${item.command}</em></summary>`,
				toCode(item.stdout.join('\n')),
			].join('\n')).join('\n</details>\n<details>\n') + '\n</details>' : '',
		},
		{
			key: 'COMMANDS_OUTPUT',
			replace: async(): Promise<string> => output.length ? '<details>\n' + output.map(item => [
				`<summary><em>${item.command}</em></summary>`,
				toCode(item.stdout.join('\n')),
				item.stderr.length ? '### stderr:' : '',
				toCode(item.stderr.join('\n')),
			].join('\n')).join('\n</details>\n<details>\n') + '\n</details>' : '',
		},
		{
			key: 'COMMANDS_STDOUT_OPENED',
			replace: async(): Promise<string> => output.length ? '<details open>\n' + output.map(item => [
				`<summary><em>${item.command}</em></summary>`,
				toCode(item.stdout.join('\n')),
			].join('\n')).join('\n</details>\n<details open>\n') + '\n</details>' : '',
		},
		{
			key: 'COMMANDS_STDERR',
			replace: async(): Promise<string> => output.length ? '<details>\n' + output.map(item => [
				`<summary><em>${item.command}</em></summary>`,
				toCode(item.stderr.join('\n')),
			].join('\n')).join('\n</details>\n<details>\n') + '\n</details>' : '',
		},
		{
			key: 'COMMANDS_STDERR_OPENED',
			replace: async(): Promise<string> => output.length ? '<details open>\n' + output.map(item => [
				`<summary><em>${item.command}</em></summary>`,
				toCode(item.stderr.join('\n')),
			].join('\n')).join('\n</details>\n<details open>\n') + '\n</details>' : '',
		},
		{
			key: 'FILES',
			replace: async(): Promise<string> => files.map(file => `- ${file}`).join('\n'),
		},
		{
			key: 'FILES_SUMMARY',
			// eslint-disable-next-line no-magic-numbers
			replace: async(): Promise<string> => 'Changed ' + (files.length > 1 ? `${files.length} files` : 'file'),
		},
		{
			key: 'ACTION_NAME',
			replace: async(): Promise<string> => context.actionDetail.actionName,
		},
		{
			key: 'ACTION_OWNER',
			replace: async(): Promise<string> => context.actionDetail.actionOwner,
		},
		{
			key: 'ACTION_REPO',
			replace: async(): Promise<string> => context.actionDetail.actionRepo,
		},
		{
			key: 'ACTION_URL',
			replace: async(): Promise<string> => `https://github.com/${context.actionDetail.actionOwner}/${context.actionDetail.actionRepo}`,
		},
		{
			key: 'ACTION_MARKETPLACE_URL',
			replace: async(): Promise<string> => `https://github.com/marketplace/actions/${context.actionDetail.actionRepo}`,
		},
	].concat(contextVariables(helper, context));
};

const replacePrBodyVariables = (prBody: string, files: string[], output: {
	command: string;
	stdout: string[];
	stderr: string[];
}[], helper: GitHelper, context: ActionContext): Promise<string> => replaceVariables(prBody, prBodyVariables(files, output, helper, context));

export const getPrBody = async(files: string[], output: {
	command: string;
	stdout: string[];
	stderr: string[];
}[], helper: GitHelper, context: ActionContext): Promise<string> => replacePrBodyVariables(
	getActionDetail<string>('prBody', context).trim().split(/\r?\n/).map(line => line.replace(/^[\s\t]+/, '')).join('\n'),
	files,
	output,
	helper,
	context,
);

export const checkDefaultBranch = (context: ActionContext): boolean => context.actionDetail.checkDefaultBranch ?? true;

export const isDisabledDeletePackage = (context: ActionContext): boolean => !(context.actionDetail.deletePackage ?? false);

export const isClosePR = (context: ActionContext): boolean => isPr(context.actionContext) && context.actionContext.payload.action === 'closed';

export const isTargetBranch = (branchName: string, context: ActionContext): boolean => {
	if (branchName === context.defaultBranch) {
		return checkDefaultBranch(context);
	}
	const prefix = getActionDetail<string>('targetBranchPrefix', context, '');
	if (prefix) {
		return getPrefixRegExp(prefix).test(branchName);
	}
	return true;
};

export const isTargetContext = (context: ActionContext): boolean => {
	if (!isTargetEvent(context.actionDetail.targetEvents ?? DEFAULT_TARGET_EVENTS, context.actionContext)) {
		return false;
	}

	if (isCron(context.actionContext)) {
		return true;
	}

	if (isPush(context.actionContext)) {
		return isTargetBranch(getBranch(context.actionContext), context);
	}

	if (isActionPr(context)) {
		return true;
	}

	if (!isTargetBranch(getPrHeadRef(context), context)) {
		return false;
	}

	return isTargetLabels(getActionDetail<string[]>('includeLabels', context, []), [], context.actionContext);
};

export const getGitFilterStatus = (context: ActionContext): string | undefined => context.actionDetail.filterGitStatus;

export const filterGitStatus = (line: string, context: ActionContext): boolean => {
	const filter = getGitFilterStatus(context);
	if (filter) {
		const targets = filter.toUpperCase().replace(/[^MDA]/g, '');
		if (!targets) {
			throw new Error('Invalid input [FILTER_GIT_STATUS].');
		}
		// language=JSRegexp
		return (new RegExp(`^[${targets}]\\s+`)).test(line);
	}
	return true;
};

export const filterExtension = (line: string, context: ActionContext): boolean => {
	const extensions = getActionDetail<string[]>('filterExtensions', context, []);
	if (extensions.length) {
		const pattern = '(' + extensions.map(item => escapeRegExp('.' + item.replace(/^\./, ''))).join('|') + ')';
		return (new RegExp(`${pattern}$`)).test(line);
	}
	return true;
};

export const getHelper = (context: ActionContext): GitHelper => new GitHelper(new Logger(replaceDirectory), {
	depth: -1,
	filter: (line: string): boolean => filterGitStatus(line, context) && filterExtension(line, context),
});

export const getPullsArgsForDefaultBranch = (context: ActionContext): PullsParams => ({
	number: 0,
	id: 0,
	head: {
		ref: context.defaultBranch,
	},
	base: {
		repo: {
			name: context.actionContext.repo.repo,
			owner: {
				login: context.actionContext.repo.owner,
			},
		},
		ref: context.defaultBranch,
	},
	title: 'default branch',
	'html_url': getDefaultBranchUrl(context),
});
