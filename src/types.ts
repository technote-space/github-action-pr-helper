import type { Context } from '@actions/github/lib/context';
import { GitHelper } from '@technote-space/github-action-helper';
import { Logger } from '@technote-space/github-action-log-helper';

export type ExecuteTask = (context: ActionContext, helper: GitHelper, logger: Logger) => Promise<CommandOutput>;

export type ActionDetails = {
  actionName: string;
  actionOwner: string;
  actionRepo: string;
  targetEvents?: { [key: string]: string | ((context: Context) => boolean) | (string | ((context: Context) => boolean))[] };
  installPackages?: string[];
  devInstallPackages?: string[];
  globalInstallPackages?: string[];
  executeCommands?: (string | ExecuteTask)[];
  commitMessage?: string;
  commitName?: string;
  commitEmail?: string;
  prBranchPrefix?: string;
  prBranchName?: string;
  prTitle?: string;
  prBody?: string;
  prBranchPrefixForDefaultBranch?: string;
  prBranchNameForDefaultBranch?: string;
  prTitleForDefaultBranch?: string;
  prBodyForDefaultBranch?: string;
  prBodyForComment?: string;
  prVariables?: string[];
  prDateFormats?: string[];
  prCloseMessage?: string;
  filterGitStatus?: string;
  filterExtensions?: string | string[];
  targetBranchPrefix?: string | string[];
  deletePackage?: boolean;
  includeLabels?: string | string[];
  checkDefaultBranch?: boolean;
  checkOnlyDefaultBranch?: boolean;
  triggerWorkflowMessage?: string;
  autoMergeThresholdDays?: string;
  labels?: string[];
  assignees?: string[];
  reviewers?: string[];
  teamReviewers?: string[];
  notCreatePr?: boolean;
}

export type MainArguments = ActionDetails & {
  logger?: Logger;
  notTargetEventMessage?: string;
  rootDir?: string;
  context?: Context;
};

export type ActionContext = {
  actionContext: Context;
  actionDetail: ActionDetails;
  isBatchProcess?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cache: { [key: string]: any };
}

export const AllProcessResult = [
  'skipped',
  'not changed',
  'succeeded',
  'failed',
] as const;

export type ProcessResult = {
  result: typeof AllProcessResult[number];
  detail: string;
  branch: string;
}

export type Null = null | undefined;

export type PayloadPullsParams = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  number: number;
  'html_url'?: string;
  body?: string | null;
};

export type PullsParams = PayloadPullsParams & {
  number: number;
  id: number;
  head: {
    ref: string;
    user: {
      login: string;
    } | null;
  };
  base: {
    repo: {
      name: string;
      owner: {
        login: string;
      } | null;
    };
    ref: string;
  };
  title: string;
  'html_url': string;
}

export type CommandOutput = {
  command: string;
  stdout: string[];
  stderr: string[];
}
