import { Context } from '@actions/github/lib/context';
import { GitHelper, Logger } from '@technote-space/github-action-helper';

export type ExecuteTask = (context: ActionContext, helper: GitHelper, logger: Logger) => Promise<CommandOutput>;

export type ActionDetails = {
	actionName: string;
	actionOwner: string;
	actionRepo: string;
	targetEvents?: { [key: string]: string | Function | (string | Function)[] };
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

export type ProcessResult = {
	result: 'succeeded' | 'failed' | 'skipped' | 'not changed';
	detail: string;
	branch: string;
}

export type Null = null | undefined;

export type PayloadPullsParams = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
	number: number;
	'html_url'?: string;
	body?: string;
};

export type PullsParams = PayloadPullsParams & {
	number: number;
	id: number;
	head: {
		ref: string;
		user: {
			login: string;
		};
	};
	base: {
		repo: {
			name: string;
			owner: {
				login: string;
			};
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
