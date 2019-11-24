import { Utils, ContextHelper, GitHelper, Logger } from '@technote-space/github-action-helper';
import { isTargetEvent, isTargetLabels } from '@technote-space/filter-github-action';
import moment from 'moment';
import { DEFAULT_TARGET_EVENTS } from '../constant';
import { ActionContext, PullsParams } from '../types';

const {getWorkspace, getPrefixRegExp}       = Utils;
const {escapeRegExp, replaceAll, getBranch} = Utils;
const {isPr, isCron, isPush}                = ContextHelper;

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

export const getCommitName = (context: ActionContext): string => getActionDetail<string>('commitName', context);

export const getCommitEmail = (context: ActionContext): string => getActionDetail<string>('commitEmail', context);

export const replaceDirectory = (message: string): string => {
	const workDir = getWorkspace();
	return replaceAll(replaceAll(message, ` -C ${workDir}`, ''), workDir, '[Working Directory]');
};

const getVariable = (index: number, context: ActionContext): string => getActionDetail<string[]>('prVariables', context)[index];

const getDate = (index: number, context: ActionContext): string => moment().format(getActionDetail<string[]>('prDateFormats', context)[index]);

const getDefaultBranchUrl = (context: ActionContext): string => `https://github.com/${context.actionContext.repo.owner}/${context.actionContext.repo.repo}/tree/${context.defaultBranch}`;

/**
 * @param {ActionContext} context context
 * @return {{string, Function}[]} replacer
 */
const contextVariables = (context: ActionContext): { key: string; replace: () => string }[] => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const getPrParam = (extractor: (pr: { [key: string]: any }) => string): string => {
		if (!context.actionContext.payload.pull_request) {
			throw new Error('Invalid context.');
		}
		return extractor(context.actionContext.payload.pull_request);
	};
	return [
		{key: 'PR_NUMBER', replace: (): string => getPrParam(pr => pr.number)},
		{key: 'PR_NUMBER_REF', replace: (): string => getPrParam(pr => pr.number ? `#${pr.number}` : getDefaultBranchUrl(context))},
		{key: 'PR_ID', replace: (): string => getPrParam(pr => pr.id)},
		{key: 'PR_HEAD_REF', replace: (): string => getPrParam(pr => pr.head.ref)},
		{key: 'PR_BASE_REF', replace: (): string => getPrParam(pr => pr.base.ref)},
		{key: 'PR_TITLE', replace: (): string => getPrParam(pr => pr.title)},
		{key: 'PR_URL', replace: (): string => getPrParam(pr => pr.html_url)},
		// eslint-disable-next-line no-magic-numbers
	].concat([...Array(context.actionDetail.prVariables?.length ?? 0).keys()].map(index => ({
		// eslint-disable-next-line no-magic-numbers
		key: `VARIABLE${index + 1}`, replace: (): string => getVariable(index, context),
		// eslint-disable-next-line no-magic-numbers
	}))).concat([...Array(context.actionDetail.prDateFormats?.length ?? 0).keys()].map(index => ({
		// eslint-disable-next-line no-magic-numbers
		key: `DATE${index + 1}`, replace: (): string => getDate(index, context),
	})));
};

/**
 * @param {string} string string
 * @param {object[]} variables variables
 * @return {string} replaced
 */
const replaceVariables = (string: string, variables: { key: string; replace: () => string }[]): string => variables.reduce((acc, value) => replaceAll(acc, `\${${value.key}}`, value.replace()), string);

/**
 * @param {string} string string
 * @param {ActionDetails} context action details
 * @return {string} replaced
 */
const replaceContextVariables = (string: string, context: ActionContext): string => replaceVariables(string, contextVariables(context));

export const getPrHeadRef = (context: ActionContext): string => context.actionContext.payload.pull_request?.head.ref ?? '';

const getPrBranchPrefix = (context: ActionContext): string => context.actionDetail.prBranchPrefix || `${context.actionDetail.actionRepo}/`;

export const isActionPr = (context: ActionContext): boolean => getPrefixRegExp(getPrBranchPrefix(context)).test(getPrHeadRef(context));

export const getPrBranchName = (context: ActionContext): string => isPush(context.actionContext) ? getBranch(context.actionContext) : (getPrBranchPrefix(context) + replaceContextVariables(getActionDetail<string>('prBranchName', context), context));

export const getPrTitle = (context: ActionContext): string => replaceContextVariables(getActionDetail<string>('prTitle', context), context);

export const getPrLink = (context: ActionContext): string => context.actionContext.payload.pull_request ? `[${context.actionContext.payload.pull_request.title}](${context.actionContext.payload.pull_request.html_url})` : '';

const prBodyVariables = (files: string[], output: {
	command: string;
	stdout: string[];
	stderr: string[];
}[], context: ActionContext): { key: string; replace: () => string }[] => {
	const toCode = (string: string): string => string.length ? ['', '```Shell', string, '```', ''].join('\n') : '';
	return [
		{
			key: 'PR_LINK',
			replace: (): string => getPrLink(context),
		},
		{
			key: 'COMMANDS',
			replace: (): string => output.length ? toCode(output.map(item => `$ ${item.command}`).join('\n')) : '',
		},
		{
			key: 'COMMANDS_STDOUT',
			replace: (): string => output.length ? '<details>\n' + output.map(item => [
				`<summary><em>${item.command}</em></summary>`,
				toCode(item.stdout.join('\n')),
			].join('\n')).join('\n</details>\n<details>\n') + '\n</details>' : '',
		},
		{
			key: 'COMMANDS_OUTPUT',
			replace: (): string => output.length ? '<details>\n' + output.map(item => [
				`<summary><em>${item.command}</em></summary>`,
				toCode(item.stdout.join('\n')),
				item.stderr.length ? '### stderr:' : '',
				toCode(item.stderr.join('\n')),
			].join('\n')).join('\n</details>\n<details>\n') + '\n</details>' : '',
		},
		{
			key: 'COMMANDS_STDOUT_OPENED',
			replace: (): string => output.length ? '<details open>\n' + output.map(item => [
				`<summary><em>${item.command}</em></summary>`,
				toCode(item.stdout.join('\n')),
			].join('\n')).join('\n</details>\n<details open>\n') + '\n</details>' : '',
		},
		{
			key: 'COMMANDS_STDERR',
			replace: (): string => output.length ? '<details>\n' + output.map(item => [
				`<summary><em>${item.command}</em></summary>`,
				toCode(item.stderr.join('\n')),
			].join('\n')).join('\n</details>\n<details>\n') + '\n</details>' : '',
		},
		{
			key: 'COMMANDS_STDERR_OPENED',
			replace: (): string => output.length ? '<details open>\n' + output.map(item => [
				`<summary><em>${item.command}</em></summary>`,
				toCode(item.stderr.join('\n')),
			].join('\n')).join('\n</details>\n<details open>\n') + '\n</details>' : '',
		},
		{
			key: 'FILES',
			replace: (): string => files.map(file => `- ${file}`).join('\n'),
		},
		{
			key: 'FILES_SUMMARY',
			// eslint-disable-next-line no-magic-numbers
			replace: (): string => 'Changed ' + (files.length > 1 ? `${files.length} files` : 'file'),
		},
		{
			key: 'ACTION_NAME',
			replace: (): string => context.actionDetail.actionName,
		},
		{
			key: 'ACTION_OWNER',
			replace: (): string => context.actionDetail.actionOwner,
		},
		{
			key: 'ACTION_REPO',
			replace: (): string => context.actionDetail.actionRepo,
		},
		{
			key: 'ACTION_URL',
			replace: (): string => `https://github.com/${context.actionDetail.actionOwner}/${context.actionDetail.actionRepo}`,
		},
		{
			key: 'ACTION_MARKETPLACE_URL',
			replace: (): string => `https://github.com/marketplace/actions/${context.actionDetail.actionRepo}`,
		},
	].concat(contextVariables(context));
};

const replacePrBodyVariables = (prBody: string, files: string[], output: {
	command: string;
	stdout: string[];
	stderr: string[];
}[], context: ActionContext): string => replaceVariables(prBody, prBodyVariables(files, output, context));

export const getPrBody = (files: string[], output: {
	command: string;
	stdout: string[];
	stderr: string[];
}[], context: ActionContext): string => replacePrBodyVariables(
	getActionDetail<string>('prBody', context).trim().split(/\r?\n/).map(line => line.replace(/^[\s\t]+/, '')).join('\n'),
	files,
	output,
	context,
);

export const isDisabledDeletePackage = (context: ActionContext): boolean => !(context.actionDetail.deletePackage ?? false);

export const isClosePR = (context: ActionContext): boolean => isPr(context.actionContext) && context.actionContext.payload.action === 'closed';

export const isTargetBranch = (branchName: string, context: ActionContext): boolean => {
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

	if (isActionPr(context) || !isTargetBranch(getPrHeadRef(context), context)) {
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

export const checkDefaultBranch = (context: ActionContext): boolean => context.actionDetail.checkDefaultBranch ?? true;

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
