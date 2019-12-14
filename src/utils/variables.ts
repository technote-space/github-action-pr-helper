import { Utils, ContextHelper, GitHelper } from '@technote-space/github-action-helper';
import moment from 'moment';
import { DEFAULT_COMMIT_NAME, DEFAULT_COMMIT_EMAIL } from '../constant';
import { ActionContext, CommandOutput } from '../types';
import { getNewPatchVersion } from './command';
import {
	getActionDetail,
	getDefaultBranchUrl, getPrHeadRef, isActionPr,
	isDefaultBranch,
} from './misc';

const {getRegExp, replaceAll, getBranch} = Utils;
const {isPush, isCron}                   = ContextHelper;

export const getCommitMessage = (context: ActionContext): string => getActionDetail<string>('commitMessage', context);

export const getCommitName = (context: ActionContext): string => getActionDetail<string>('commitName', context, () => DEFAULT_COMMIT_NAME);

export const getCommitEmail = (context: ActionContext): string => getActionDetail<string>('commitEmail', context, () => DEFAULT_COMMIT_EMAIL);

const getVariable = (index: number, context: ActionContext): string => getActionDetail<string[]>('prVariables', context)[index];

const getDate = (index: number, context: ActionContext): string => moment().format(getActionDetail<string[]>('prDateFormats', context)[index]);

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
		{key: 'PATCH_VERSION', replace: (): Promise<string> => getNewPatchVersion(helper, context)},
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

const getPrBranchPrefix = (context: ActionContext): string => context.actionDetail.prBranchPrefix || `${context.actionDetail.actionRepo}/`;

const getPrBranchPrefixForDefaultBranch = (context: ActionContext): string => context.actionDetail.prBranchPrefixForDefaultBranch || getPrBranchPrefix(context);

export const getPrBranchName = async(helper: GitHelper, context: ActionContext): Promise<string> =>
	isPush(context.actionContext) ?
		getBranch(context.actionContext) :
		(
			isActionPr(context) ? getPrHeadRef(context) : (
				isDefaultBranch(context) ?
					getPrBranchPrefixForDefaultBranch(context) + await replaceContextVariables(getActionDetail<string>('prBranchNameForDefaultBranch', context, () => getActionDetail<string>('prBranchName', context)), helper, context) :
					getPrBranchPrefix(context) + await replaceContextVariables(getActionDetail<string>('prBranchName', context), helper, context)
			)
		);

export const getPrTitle = async(helper: GitHelper, context: ActionContext): Promise<string> => await replaceContextVariables(
	(
		isDefaultBranch(context) ?
			getActionDetail<string>('prTitleForDefaultBranch', context, () => getActionDetail<string>('prTitle', context)) :
			getActionDetail<string>('prTitle', context)
	).trim(),
	helper,
	context,
);

export const getPrLink = (context: ActionContext): string => context.actionContext.payload.pull_request ? `[${context.actionContext.payload.pull_request.title}](${context.actionContext.payload.pull_request.html_url})` : '';

const prBodyVariables = (files: string[], output: CommandOutput[], helper: GitHelper, context: ActionContext): { key: string; replace: () => Promise<string> }[] => {
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

const replacePrBodyVariables = (prBody: string, files: string[], output: CommandOutput[], helper: GitHelper, context: ActionContext): Promise<string> => replaceVariables(prBody, prBodyVariables(files, output, helper, context));

export const getPrBody = async(files: string[], output: CommandOutput[], helper: GitHelper, context: ActionContext): Promise<string> => replacePrBodyVariables(
	(
		isCron(context.actionContext) ?
			getActionDetail<string>('prBodyForSchedule', context, () => getActionDetail<string>('prBody', context)) :
			(
				isDefaultBranch(context) ?
					getActionDetail<string>('prBodyForDefaultBranch', context, () => getActionDetail<string>('prBody', context)) :
					getActionDetail<string>('prBody', context)
			)
	).trim().split(/\r?\n/).map(line => line.replace(/^[\s\t]+/, '')).join('\n'),
	files,
	output,
	helper,
	context,
);
