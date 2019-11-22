import { Context } from '@actions/github/lib/context';
import { Logger } from '@technote-space/github-action-helper';

export type ActionDetails = {
	actionName: string;
	actionOwner: string;
	actionRepo: string;
	targetEvents?: { [key: string]: string | Function | (string | Function)[] };
	installPackages?: string[];
	devInstallPackages?: string[];
	globalInstallPackages?: string[];
	executeCommands?: string[];
	commitMessage?: string;
	commitName?: string;
	commitEmail?: string;
	prBranchPrefix?: string;
	prBranchName?: string;
	prTitle?: string;
	prBody?: string;
	prVariables?: string[];
	prDateFormats?: string[];
	prCloseMessage?: string;
	filterGitStatus?: string;
	filterExtensions?: string[];
	targetBranchPrefix?: string;
	deletePackage?: boolean;
	includeLabels?: string[];
	checkDefaultBranch?: boolean;
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
}

export type ProcessResult = {
	result: 'succeeded' | 'failed' | 'skipped';
	detail: string;
	branch: string;
}

export type PullsParams = {
	number: number;
	id: number;
	head: {
		ref: string;
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
