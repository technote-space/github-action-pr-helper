import { Utils, ContextHelper, GitHelper, Logger } from '@technote-space/github-action-helper';
import { isTargetEvent, isTargetLabels } from '@technote-space/filter-github-action';
import { DEFAULT_TARGET_EVENTS } from '../constant';
import { ActionContext, PullsParams } from '../types';

const {getWorkspace, getPrefixRegExp}       = Utils;
const {escapeRegExp, replaceAll, getBranch} = Utils;
const {isPr, isCron, isPush}                = ContextHelper;

export const getActionDetail = <T>(key: string, context: ActionContext, defaultValue?: () => T): T => {
	if (undefined === defaultValue && !(key in context.actionDetail)) {
		throw new Error(`parameter [${key}] is required.`);
	}
	if (undefined === defaultValue && typeof context.actionDetail[key] === 'string' && context.actionDetail[key].trim() === '') {
		throw new Error(`parameter [${key}] is required.`);
	}
	return context.actionDetail[key] || (typeof defaultValue === 'function' ? defaultValue() : undefined);
};

export const replaceDirectory = (message: string): string => {
	const workDir = getWorkspace();
	return replaceAll(replaceAll(message, ` -C ${workDir}`, ''), workDir, '[Working Directory]');
};

export const getDefaultBranchUrl = (context: ActionContext): string => `https://github.com/${context.actionContext.repo.owner}/${context.actionContext.repo.repo}/tree/${context.defaultBranch}`;

export const getPrHeadRef = (context: ActionContext): string => context.actionContext.payload.pull_request?.head.ref ?? '';

export const getPrBaseRef = (context: ActionContext): string => context.actionContext.payload.pull_request?.base.ref ?? '';

const getPrBranchPrefix = (context: ActionContext): string => context.actionDetail.prBranchPrefix || `${context.actionDetail.actionRepo}/`;

const getPrBranchPrefixForDefaultBranch = (context: ActionContext): string => context.actionDetail.prBranchPrefixForDefaultBranch || getPrBranchPrefix(context);

export const isActionPr = (context: ActionContext): boolean => getPrefixRegExp(getPrBranchPrefix(context)).test(getPrHeadRef(context)) || getPrefixRegExp(getPrBranchPrefixForDefaultBranch(context)).test(getPrHeadRef(context));

export const isDefaultBranch = (context: ActionContext): boolean => context.defaultBranch === getBranch(context.actionContext);

export const checkDefaultBranch = (context: ActionContext): boolean => context.actionDetail.checkDefaultBranch ?? true;

export const isDisabledDeletePackage = (context: ActionContext): boolean => !(context.actionDetail.deletePackage ?? false);

export const isClosePR = (context: ActionContext): boolean => isPr(context.actionContext) && context.actionContext.payload.action === 'closed';

export const isTargetBranch = (branchName: string, context: ActionContext): boolean => {
	if (branchName === context.defaultBranch) {
		return checkDefaultBranch(context);
	}
	const prefix = getActionDetail<string>('targetBranchPrefix', context, () => '');
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

	return isTargetLabels(getActionDetail<string[]>('includeLabels', context, () => []), [], context.actionContext);
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
	const extensions = getActionDetail<string[]>('filterExtensions', context, () => []);
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
