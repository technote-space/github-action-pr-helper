import type { ActionContext, CommandOutput } from '../types.js';
import type { Octokit } from '@technote-space/github-action-helper';
import { Utils, ContextHelper } from '@technote-space/github-action-helper';
import moment from 'moment';
import { getNewPatchVersion, getNewMinorVersion, getNewMajorVersion, getCurrentVersion, findPR, getDefaultBranch } from './command.js';
import {
  getActionDetail,
  getDefaultBranchUrl,
  getPrHeadRef,
  isActionPr,
  getContextBranch,
  isDefaultBranch,
  getActionContext,
  ensureGetPulls,
  getPullsArgsForDefaultBranch,
  getPrBranchPrefix,
  getPrBranchPrefixForDefaultBranch,
  isNotCreatePR,
  ParameterRequiredError,
} from './misc.js';

const { getBranch } = Utils;
const { isPush }    = ContextHelper;

export const getCommitMessage = (context: ActionContext): string => getActionDetail<string>('commitMessage', context);

export const getCommitName = (context: ActionContext): string => getActionDetail<string>('commitName', context, () => context.actionContext.actor);

export const getCommitEmail = (context: ActionContext): string => getActionDetail<string>('commitEmail', context, () => `${context.actionContext.actor}@users.noreply.github.com`);

const getVariable = (index: number, context: ActionContext): string => getActionDetail<string[]>('prVariables', context)[index]!;

export const getPrLink = (context: ActionContext): string => context.actionContext.payload.pull_request ? `[${context.actionContext.payload.pull_request.title}](${context.actionContext.payload.pull_request.html_url})` : '';

const getDate = (index: number, context: ActionContext): string => moment().format(getActionDetail<string[]>('prDateFormats', context)[index]);

const contextVariables = async(isComment: boolean, octokit: Octokit, context: ActionContext): Promise<{ key: string; replace: () => Promise<string> }[]> => {
  const getContext = async(branch: string): Promise<ActionContext> => {
    if (isComment) {
      if (branch === await getDefaultBranch(octokit, context)) {
        return getActionContext(await getPullsArgsForDefaultBranch(octokit, context), octokit, context);
      }

      return getActionContext(await findPR(branch, octokit, context), octokit, context);
    }

    return context;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getPrParamFunc = (extractor: (pr: { [key: string]: any }) => Promise<string>) => async(): Promise<string> => {
    if (!context.actionContext.payload.pull_request) {
      throw new Error('Invalid context.');
    }

    return extractor(await ensureGetPulls((await getContext(getContextBranch(context))).actionContext.payload.pull_request, octokit, context));
  };

  return [
    { key: 'PR_NUMBER', replace: getPrParamFunc(pr => pr.number) },
    { key: 'PR_NUMBER_REF', replace: getPrParamFunc(async(pr) => pr.number ? `#${pr.number}` : await getDefaultBranchUrl(octokit, context)) },
    { key: 'PR_ID', replace: getPrParamFunc(pr => pr.id) },
    { key: 'PR_HEAD_REF', replace: getPrParamFunc(pr => pr.head.ref) },
    { key: 'PR_BASE_REF', replace: getPrParamFunc(pr => pr.base.ref) },
    { key: 'PR_TITLE', replace: getPrParamFunc(pr => pr.title) },
    { key: 'PR_URL', replace: getPrParamFunc(pr => pr.html_url) },
    { key: 'PR_MERGE_REF', replace: getPrParamFunc(async(pr) => pr.number ? `${pr.head.ref} -> ${pr.base.ref}` : await getDefaultBranch(octokit, context)) },
    { key: 'PR_LINK', replace: async(): Promise<string> => getPrLink(context) },
    { key: 'CURRENT_VERSION', replace: async(): Promise<string> => getCurrentVersion(octokit, context) },
    { key: 'PATCH_VERSION', replace: async(): Promise<string> => getNewPatchVersion(octokit, context) },
    { key: 'MINOR_VERSION', replace: async(): Promise<string> => getNewMinorVersion(octokit, context) },
    { key: 'MAJOR_VERSION', replace: async(): Promise<string> => getNewMajorVersion(octokit, context) },
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

const replaceContextVariables = async(string: string, octokit: Octokit, context: ActionContext): Promise<string> => Utils.replaceVariables(string, await contextVariables(false, octokit, context));

export const getPrBranchName = async(octokit: Octokit, context: ActionContext, isDuplicateCheck = false): Promise<string> => {
  if (isPush(context.actionContext)) {
    return getBranch(context.actionContext);
  }

  if (isActionPr(context) || isNotCreatePR(context)) {
    return getPrHeadRef(context);
  }

  let prefix: string;
  let branch: string;
  if (await isDefaultBranch(octokit, context)) {
    prefix = getPrBranchPrefixForDefaultBranch(context);
  } else {
    prefix = getPrBranchPrefix(context);
  }

  try {
    if (await isDefaultBranch(octokit, context)) {
      branch = getActionDetail<string>('prBranchNameForDefaultBranch', context, () => getActionDetail<string>('prBranchName', context));
    } else {
      branch = getActionDetail<string>('prBranchName', context);
    }
  } catch (error) {
    if (isDuplicateCheck && (error instanceof ParameterRequiredError)) {
      return `${context.actionContext.runNumber}`;
    }

    throw error;
  }

  return prefix + await replaceContextVariables(branch, octokit, context);
};

export const getPrTitle = async(octokit: Octokit, context: ActionContext): Promise<string> => await replaceContextVariables(
  (
    await isDefaultBranch(octokit, context) ?
      getActionDetail<string>('prTitleForDefaultBranch', context, () => getActionDetail<string>('prTitle', context)) :
      getActionDetail<string>('prTitle', context)
  ).trim(),
  octokit,
  context,
);

const prBodyVariables = async(isComment: boolean, files: string[], output: CommandOutput[], octokit: Octokit, context: ActionContext): Promise<{ key: string; replace: () => Promise<string> }[]> => {
  const toCode = (string: string): string => string.length ? ['', '```Shell', string, '```', ''].join('\n') : '';
  return [
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
  ].concat(await contextVariables(isComment, octokit, context));
};

const replacePrBodyVariables = async(isComment: boolean, prBody: string, files: string[], output: CommandOutput[], octokit: Octokit, context: ActionContext): Promise<string> => Utils.replaceVariables(prBody, await prBodyVariables(isComment, files, output, octokit, context));

export const getPrBody = async(isComment: boolean, files: string[], output: CommandOutput[], octokit: Octokit, context: ActionContext): Promise<string> => replacePrBodyVariables(
  isComment,
  (
    isComment ?
      getActionDetail<string>('prBodyForComment', context, () => getActionDetail<string>('prBody', context)) :
      (
        await isDefaultBranch(octokit, context) ?
          getActionDetail<string>('prBodyForDefaultBranch', context, () => getActionDetail<string>('prBody', context)) :
          getActionDetail<string>('prBody', context)
      )
  ).trim().split(/\r?\n/).map(line => line.replace(/^[\s\t]+/, '')).join('\n'),
  files,
  output,
  octokit,
  context,
);
