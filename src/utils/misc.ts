import { Utils, ContextHelper, GitHelper, Logger } from '@technote-space/github-action-helper';
import { isTargetEvent, isTargetLabels } from '@technote-space/filter-github-action';
import { GitHub } from '@actions/github';
import { DEFAULT_TARGET_EVENTS } from '../constant';
import { ActionContext, PullsParams, PayloadPullsParams, Null } from '../types';
import { getDefaultBranch } from './command';

const {getWorkspace, getPrefixRegExp}       = Utils;
const {escapeRegExp, replaceAll, getBranch} = Utils;
const {isPr, isCron, isPush, isCustomEvent} = ContextHelper;

export const getActionDetail = <T>(key: string, context: ActionContext, defaultValue?: () => T): T => {
	if (undefined === defaultValue && !(key in context.actionDetail)) {
		throw new Error(`parameter [${key}] is required.`);
	}
	if (undefined === defaultValue && typeof context.actionDetail[key] === 'string' && context.actionDetail[key].trim() === '') {
		throw new Error(`parameter [${key}] is required.`);
	}
	return context.actionDetail[key] || (typeof defaultValue === 'function' ? defaultValue() : undefined);
};

const toArray = <T>(item: T | T[]): T[] => Array.isArray(item) ? item : [item];

export const replaceDirectory = (message: string): string => {
	const workDir = getWorkspace();
	return replaceAll(replaceAll(message, ` -C ${workDir}`, ''), workDir, '[Working Directory]');
};

export const getDefaultBranchUrl = async(octokit: GitHub, context: ActionContext): Promise<string> => `https://github.com/${context.actionContext.repo.owner}/${context.actionContext.repo.repo}/tree/${await getDefaultBranch(octokit, context)}`;

export const getPrHeadRef = (context: ActionContext): string => context.actionContext.payload.pull_request?.head.ref ?? '';

export const getPrBaseRef = (context: ActionContext): string => context.actionContext.payload.pull_request?.base.ref ?? '';

const getPrBranchPrefix = (context: ActionContext): string => context.actionDetail.prBranchPrefix || `${context.actionDetail.actionRepo}/`;

const getPrBranchPrefixForDefaultBranch = (context: ActionContext): string => context.actionDetail.prBranchPrefixForDefaultBranch || getPrBranchPrefix(context);

export const isActionPr = (context: ActionContext): boolean => getPrefixRegExp(getPrBranchPrefix(context)).test(getPrHeadRef(context)) || getPrefixRegExp(getPrBranchPrefixForDefaultBranch(context)).test(getPrHeadRef(context));

export const getContextBranch = (context: ActionContext): string => context.isBatchProcess ? getPrBaseRef(context) : (getBranch(context.actionContext) || getPrHeadRef(context));

export const isDefaultBranch = async(octokit: GitHub, context: ActionContext): Promise<boolean> => await getDefaultBranch(octokit, context) === getContextBranch(context);

export const checkDefaultBranch = (context: ActionContext): boolean => context.actionDetail.checkDefaultBranch ?? true;

export const isDisabledDeletePackage = (context: ActionContext): boolean => !(context.actionDetail.deletePackage ?? false);

export const isClosePR = (context: ActionContext): boolean => isPr(context.actionContext) && context.actionContext.payload.action === 'closed';

export const isTargetBranch = async(branchName: string, octokit: GitHub, context: ActionContext): Promise<boolean> => {
	if (branchName === await getDefaultBranch(octokit, context)) {
		return checkDefaultBranch(context);
	}
	const prefix = toArray<string>(getActionDetail<string | string[]>('targetBranchPrefix', context, () => []));
	if (prefix.length) {
		return prefix.some(prefix => getPrefixRegExp(prefix).test(branchName));
	}
	return true;
};

export const isTargetContext = async(octokit: GitHub, context: ActionContext): Promise<boolean> => {
	if (!isTargetEvent(context.actionDetail.targetEvents ?? DEFAULT_TARGET_EVENTS, context.actionContext)) {
		return false;
	}

	if (isCron(context.actionContext) || isCustomEvent(context.actionContext)) {
		return true;
	}

	if (isPush(context.actionContext)) {
		return isTargetBranch(getBranch(context.actionContext), octokit, context);
	}

	if (isActionPr(context)) {
		return true;
	}

	if (isClosePR(context)) {
		return true;
	}

	if (!await isTargetBranch(getPrHeadRef(context), octokit, context)) {
		return false;
	}

	return isTargetLabels(toArray<string>(getActionDetail<string | string[]>('includeLabels', context, () => [])), [], context.actionContext);
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
	const extensions = toArray<string>(getActionDetail<string | string[]>('filterExtensions', context, () => []));
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

export const getPullsArgsForDefaultBranch = async(octokit: GitHub, context: ActionContext): Promise<PullsParams> => ({
	number: 0,
	id: 0,
	head: {
		ref: await getDefaultBranch(octokit, context),
	},
	base: {
		repo: {
			name: context.actionContext.repo.repo,
			owner: {
				login: context.actionContext.repo.owner,
			},
		},
		ref: await getDefaultBranch(octokit, context),
	},
	title: 'default branch',
	'html_url': await getDefaultBranchUrl(octokit, context),
});

export const ensureGetPulls = async(pull: PayloadPullsParams | Null, octokit: GitHub, context: ActionContext): Promise<PayloadPullsParams> => pull ?? await getPullsArgsForDefaultBranch(octokit, context);

export const getActionContext = async(pull: PayloadPullsParams | Null, octokit: GitHub, context: ActionContext): Promise<ActionContext> => {
	const _pull = await ensureGetPulls(pull, octokit, context);
	return {
		...context,
		actionContext: Object.assign({}, context.actionContext, {
			payload: {
				'pull_request': {
					number: _pull.number,
					id: _pull.id,
					head: _pull.head,
					base: _pull.base,
					title: _pull.title,
					'html_url': _pull.html_url,
				},
			},
			repo: {
				owner: _pull.base.repo.owner.login,
				repo: _pull.base.repo.name,
			},
			ref: `refs/heads/${_pull.head.ref}`,
		}),
		isBatchProcess: !!_pull.number,
	};
};

export const getCacheKey = (method: string, args = {}): string => method + JSON.stringify(args);

export const getCache = async <T>(key: string, generator: () => (T | Promise<T>), context: ActionContext): Promise<T> => {
	if (!(key in context.cache)) {
		// eslint-disable-next-line require-atomic-updates
		context.cache[key] = await generator();
	}
	return context.cache[key];
};

export const isCached = (key: string, context: ActionContext): boolean => key in context.cache;
