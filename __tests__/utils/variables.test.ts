/* eslint-disable no-magic-numbers */
import { Context } from '@actions/github/lib/context';
import { GitHelper, Logger } from '@technote-space/github-action-helper';
import { testEnv, generateContext, testChildProcess, setChildProcessParams, testFs } from '@technote-space/github-action-test-helper';
import moment from 'moment';
import {
	getCommitMessage,
	getCommitName,
	getCommitEmail,
	getPrBranchName,
	getPrTitle,
	getPrLink,
	getPrBody,
} from '../../src/utils/variables';
import { ActionContext, ActionDetails } from '../../src/types';
import { DEFAULT_COMMIT_NAME, DEFAULT_COMMIT_EMAIL } from '../../src/constant';

beforeEach(() => {
	Logger.resetForTesting();
});
const logger = new Logger();
const helper = new GitHelper(logger, {depth: -1});
testFs(true);

const actionDetails: ActionDetails = {
	actionName: 'Test Action',
	actionOwner: 'octocat',
	actionRepo: 'hello-world',
};
const getActionContext             = (context: Context, _actionDetails?: ActionDetails): ActionContext => ({
	actionContext: context,
	actionDetail: _actionDetails ?? actionDetails,
	defaultBranch: 'master',
});
const generateActionContext        = (
	settings: {
		event?: string | undefined;
		action?: string | undefined;
		ref?: string | undefined;
		sha?: string | undefined;
		owner?: string | undefined;
		repo?: string | undefined;
	},
	override?: object,
	_actionDetails?: object,
): ActionContext => getActionContext(
	generateContext(settings, override),
	_actionDetails ? Object.assign({}, actionDetails, _actionDetails) : undefined,
);
const prPayload                    = {
	'pull_request': {
		number: 11,
		id: 21031067,
		head: {
			ref: 'change',
		},
		base: {
			ref: 'master',
		},
		title: 'test title',
		'html_url': 'http://example.com',
	},
};

describe('getCommitMessage', () => {
	testEnv();

	it('should get commit message', () => {
		expect(getCommitMessage(generateActionContext({}, {}, {commitMessage: 'test'}))).toBe('test');
	});

	it('should throw error', () => {
		expect(() => getCommitMessage(generateActionContext({}))).toThrow();
	});
});

describe('getCommitName', () => {
	testEnv();

	it('should get commit name', () => {
		expect(getCommitName(generateActionContext({}, {}, {commitName: 'test'}))).toBe('test');
	});

	it('should get default commit name', () => {
		expect(getCommitName(generateActionContext({}))).toBe(DEFAULT_COMMIT_NAME);
	});
});

describe('getCommitEmail', () => {
	testEnv();

	it('should get commit email', () => {
		expect(getCommitEmail(generateActionContext({}, {}, {commitEmail: 'test'}))).toBe('test');
	});

	it('should get default commit email', () => {
		expect(getCommitEmail(generateActionContext({}))).toBe(DEFAULT_COMMIT_EMAIL);
	});
});

describe('getPrBranchName', () => {
	testEnv();
	testChildProcess();

	it('should get pr branch name', async() => {
		setChildProcessParams({stdout: '1.2.3'});
		expect(await getPrBranchName(helper, generateActionContext({event: 'pull_request'}, {
			payload: prPayload,
		}, {
			prBranchName: '${PR_NUMBER}::${PR_NUMBER_REF}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_TITLE}::${PR_URL}::${PR_MERGE_REF}::${PATCH_VERSION}',
		}))).toBe('hello-world/11::#11::21031067::change::master::test title::http://example.com::change -> master::v1.2.4');
	});

	it('should get pr branch name for default branch 1', async() => {
		setChildProcessParams({stdout: '1.2.3'});
		expect(await getPrBranchName(helper, generateActionContext({owner: 'owner', repo: 'repo', event: 'pull_request', ref: 'heads/master'}, {
			payload: {
				'pull_request': {
					number: 0,
					id: 21031067,
					head: {
						ref: 'master',
					},
					base: {
						ref: 'master',
					},
					title: 'test title',
					'html_url': 'http://example.com',
				},
			},
		}, {
			prBranchPrefix: 'prefix/',
			prBranchName: '${PR_NUMBER}::${PR_NUMBER_REF}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_TITLE}::${PR_URL}::${PR_MERGE_REF}::${PATCH_VERSION}',
			prBranchPrefixForDefaultBranch: 'release/',
			prBranchNameForDefaultBranch: '${PATCH_VERSION}',
		}))).toBe('release/v1.2.4');
	});

	it('should get pr branch name for default branch 2', async() => {
		setChildProcessParams({stdout: '1.2.3'});
		expect(await getPrBranchName(helper, generateActionContext({owner: 'owner', repo: 'repo', event: 'pull_request', ref: 'heads/master'}, {
			payload: {
				'pull_request': {
					number: 0,
					id: 21031067,
					head: {
						ref: 'master',
					},
					base: {
						ref: 'master',
					},
					title: 'test title',
					'html_url': 'http://example.com',
				},
			},
		}, {
			prBranchName: '${PR_NUMBER}::${PR_NUMBER_REF}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_TITLE}::${PR_URL}::${PR_MERGE_REF}::${PATCH_VERSION}',
		}))).toBe('hello-world/0::https://github.com/owner/repo/tree/master::21031067::master::master::test title::http://example.com::master::v1.2.4');
	});

	it('should get push branch name', async() => {
		expect(await getPrBranchName(helper, generateActionContext({event: 'push'}, {ref: 'heads/test-ref'}, {
			prBranchName: '${PR_NUMBER}::${PR_NUMBER_REF}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_TITLE}::${PR_URL}::${PR_MERGE_REF}::${PATCH_VERSION}',
		}))).toBe('test-ref');
	});

	it('should throw error', async() => {
		await expect(getPrBranchName(helper, generateActionContext({}))).rejects.toThrow();
		await expect(getPrBranchName(helper, generateActionContext({}, {}, {prBranchName: ''}))).rejects.toThrow();
	});

	it('should throw error', async() => {
		await expect(getPrBranchName(helper, generateActionContext({event: 'pull_request'}, {}, {
			prBranchName: '${PR_NUMBER}::${PR_NUMBER_REF}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_TITLE}::${PR_URL}::${PR_MERGE_REF}::${PATCH_VERSION}',
		}))).rejects.toThrow();
	});
});

describe('getPrTitle', () => {
	testEnv();
	testChildProcess();

	it('should get PR title', async() => {
		setChildProcessParams({stdout: '1.2.3'});
		expect(await getPrTitle(helper, generateActionContext({}, {payload: prPayload}, {
			prTitle: '${PR_NUMBER}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_MERGE_REF}::${PR_NUMBER_REF}::${PATCH_VERSION}',
		}))).toBe('11::21031067::change::master::change -> master::#11::v1.2.4');
	});

	it('should get PR title for default branch 1', async() => {
		setChildProcessParams({stdout: '1.2.3'});
		expect(await getPrTitle(helper, generateActionContext({owner: 'owner', repo: 'repo', event: 'pull_request', ref: 'heads/master'}, {
			payload: {
				'pull_request': {
					number: 0,
					id: 21031067,
					head: {
						ref: 'master',
					},
					base: {
						ref: 'master',
					},
					title: 'test title',
					'html_url': 'http://example.com',
				},
			},
		}, {
			prTitle: '${PR_NUMBER}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_MERGE_REF}::${PR_NUMBER_REF}::${PATCH_VERSION}',
			prTitleForDefaultBranch: 'release/${PATCH_VERSION}',
		}))).toBe('release/v1.2.4');
	});

	it('should get PR title for default branch 2', async() => {
		setChildProcessParams({stdout: '1.2.3'});
		expect(await getPrTitle(helper, generateActionContext({owner: 'owner', repo: 'repo', event: 'pull_request', ref: 'heads/master'}, {
			payload: {
				'pull_request': {
					number: 0,
					id: 21031067,
					head: {
						ref: 'master',
					},
					base: {
						ref: 'master',
					},
					title: 'test title',
					'html_url': 'http://example.com',
				},
			},
		}, {
			prTitle: '${PR_NUMBER}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_MERGE_REF}::${PR_NUMBER_REF}::${PATCH_VERSION}',
		}))).toBe('0::21031067::master::master::master::https://github.com/owner/repo/tree/master::v1.2.4');
	});

	it('should throw error', async() => {
		await expect(getPrTitle(helper, generateActionContext({}))).rejects.toThrow();
	});

	it('should throw error', async() => {
		await expect(getPrTitle(helper, generateActionContext({}, {}, {
			prTitle: '${PR_NUMBER}::${PR_ID}::${PR_HEAD_REF}::${PR_BASE_REF}::${PR_BASE_REF}::${PATCH_VERSION}',
		}))).rejects.toThrow();
	});
});

describe('getPrLink', () => {
	it('should get pr link', () => {
		expect(getPrLink(generateActionContext({
			ref: 'heads/test',
			event: 'push',
		}, {
			payload: {
				'pull_request': {
					title: 'test title',
					'html_url': 'http://example.com',
				},
			},
		}))).toBe('[test title](http://example.com)');
	});

	it('should get empty', () => {
		expect(getPrLink(generateActionContext({}))).toEqual('');
	});
});

describe('getPrBody', () => {
	testEnv();

	it('should get PR Body 1', async() => {
		const prBody = `
      ## Base PullRequest

      \${PR_TITLE} (#\${PR_NUMBER})

      ## Command results
      <details>
        <summary>Details: </summary>

        \${COMMANDS_OUTPUT}

      </details>

      ## Changed files
      <details>
        <summary>\${FILES_SUMMARY}: </summary>

        \${FILES}

      </details>

      <hr>

      [:octocat: Repo](\${ACTION_URL}) | [:memo: Issues](\${ACTION_URL}/issues) | [:department_store: Marketplace](\${ACTION_MARKETPLACE_URL})
`;

		expect(await getPrBody(['README.md', 'CHANGELOG.md'], [
			{command: 'test1', stdout: ['test1-1', 'test1-2'], stderr: []},
			{command: 'test2', stdout: ['test2-1', 'test2-2'], stderr: ['test2-3']},
		], helper, generateActionContext({}, {
			payload: prPayload,
		}, {
			prBody,
		}))).toBe([
			'## Base PullRequest',
			'',
			'test title (#11)',
			'',
			'## Command results',
			'<details>',
			'<summary>Details: </summary>',
			'',
			'<details>',
			'<summary><em>test1</em></summary>',
			'',
			'```Shell',
			'test1-1',
			'test1-2',
			'```',
			'',
			'',
			'',
			'</details>',
			'<details>',
			'<summary><em>test2</em></summary>',
			'',
			'```Shell',
			'test2-1',
			'test2-2',
			'```',
			'',
			'### stderr:',
			'',
			'```Shell',
			'test2-3',
			'```',
			'',
			'</details>',
			'',
			'</details>',
			'',
			'## Changed files',
			'<details>',
			'<summary>Changed 2 files: </summary>',
			'',
			'- README.md',
			'- CHANGELOG.md',
			'',
			'</details>',
			'',
			'<hr>',
			'',
			'[:octocat: Repo](https://github.com/octocat/hello-world) | [:memo: Issues](https://github.com/octocat/hello-world/issues) | [:department_store: Marketplace](https://github.com/marketplace/actions/hello-world)',
		].join('\n'));
	});

	it('should get PR Body 2', async() => {
		const prBody = `
		\${PR_LINK}
		---------------------------
		\${COMMANDS}
		---------------------------
		\${COMMANDS_OUTPUT}
		---------------------------
		\${COMMANDS_STDOUT}
		---------------------------
		\${COMMANDS_STDOUT_OPENED}
		---------------------------
		\${COMMANDS_STDERR}
		---------------------------
		\${COMMANDS_STDERR_OPENED}
		---------------------------
		\${FILES}
		---------------------------
		\${FILES_SUMMARY}
		---------------------------
		\${ACTION_NAME}
		---------------------------
		\${ACTION_OWNER}
		---------------------------
		\${ACTION_REPO}
		---------------------------
		\${ACTION_URL}
		---------------------------
		\${ACTION_MARKETPLACE_URL}
		---------------------------
		\${DATE1}
		---------------------------
		\${DATE2}
		---------------------------
		\${VARIABLE1}
		---------------------------
		\${VARIABLE2}
`;

		expect(await getPrBody(['README.md'], [
			{command: 'test1', stdout: ['test1-1', 'test1-2'], stderr: ['test1-3', 'test1-4']},
			{command: 'test2', stdout: [], stderr: []},
		], helper, generateActionContext({}, {
			payload: prPayload,
		}, {
			prBody,
			prVariables: ['variable1', ''],
			prDateFormats: ['YYYY/MM/DD', 'DD/MM/YYYY'],
		}))).toBe([
			'[test title](http://example.com)',
			'---------------------------',
			'',
			'```Shell',
			'$ test1',
			'$ test2',
			'```',
			'',
			'---------------------------',
			'<details>',
			'<summary><em>test1</em></summary>',
			'',
			'```Shell',
			'test1-1',
			'test1-2',
			'```',
			'',
			'### stderr:',
			'',
			'```Shell',
			'test1-3',
			'test1-4',
			'```',
			'',
			'</details>',
			'<details>',
			'<summary><em>test2</em></summary>',
			'',
			'',
			'',
			'</details>',
			'---------------------------',
			'<details>',
			'<summary><em>test1</em></summary>',
			'',
			'```Shell',
			'test1-1',
			'test1-2',
			'```',
			'',
			'</details>',
			'<details>',
			'<summary><em>test2</em></summary>',
			'',
			'</details>',
			'---------------------------',
			'<details open>',
			'<summary><em>test1</em></summary>',
			'',
			'```Shell',
			'test1-1',
			'test1-2',
			'```',
			'',
			'</details>',
			'<details open>',
			'<summary><em>test2</em></summary>',
			'',
			'</details>',
			'---------------------------',
			'<details>',
			'<summary><em>test1</em></summary>',
			'',
			'```Shell',
			'test1-3',
			'test1-4',
			'```',
			'',
			'</details>',
			'<details>',
			'<summary><em>test2</em></summary>',
			'',
			'</details>',
			'---------------------------',
			'<details open>',
			'<summary><em>test1</em></summary>',
			'',
			'```Shell',
			'test1-3',
			'test1-4',
			'```',
			'',
			'</details>',
			'<details open>',
			'<summary><em>test2</em></summary>',
			'',
			'</details>',
			'---------------------------',
			'- README.md',
			'---------------------------',
			'Changed file',
			'---------------------------',
			'Test Action',
			'---------------------------',
			'octocat',
			'---------------------------',
			'hello-world',
			'---------------------------',
			'https://github.com/octocat/hello-world',
			'---------------------------',
			'https://github.com/marketplace/actions/hello-world',
			'---------------------------',
			moment().format('YYYY/MM/DD'),
			'---------------------------',
			moment().format('DD/MM/YYYY'),
			'---------------------------',
			'variable1',
			'---------------------------',
			'',
		].join('\n'));
	});

	it('should get PR Body for default branch 1', async() => {
		const prBody                 = '${ACTION_OWNER}';
		const prBodyForDefaultBranch = '${ACTION_REPO}';

		expect(await getPrBody([], [], helper, generateActionContext({owner: 'owner', repo: 'repo', event: 'pull_request', ref: 'heads/master'}, {
			payload: {
				'pull_request': {
					number: 0,
					id: 21031067,
					head: {
						ref: 'master',
					},
					base: {
						ref: 'master',
					},
					title: 'test title',
					'html_url': 'http://example.com',
				},
			},
		}, {
			prBody,
			prBodyForDefaultBranch,
		}))).toBe([
			'hello-world',
		].join('\n'));
	});

	it('should get PR Body for default branch 2', async() => {
		const prBody = '${ACTION_OWNER}';

		expect(await getPrBody([], [], helper, generateActionContext({owner: 'owner', repo: 'repo', event: 'pull_request', ref: 'heads/master'}, {
			payload: {
				'pull_request': {
					number: 0,
					id: 21031067,
					head: {
						ref: 'master',
					},
					base: {
						ref: 'master',
					},
					title: 'test title',
					'html_url': 'http://example.com',
				},
			},
		}, {
			prBody,
		}))).toBe([
			'octocat',
		].join('\n'));
	});

	it('should get PR Body with empty output', async() => {
		const prBody = `
		\${PR_LINK}
		---------------------------
		\${COMMANDS}
		---------------------------
		\${COMMANDS_OUTPUT}
		---------------------------
		\${COMMANDS_STDOUT}
		---------------------------
		\${COMMANDS_STDOUT_OPENED}
		---------------------------
		\${COMMANDS_STDERR}
		---------------------------
		\${COMMANDS_STDERR_OPENED}
		---------------------------
		\${FILES}
		---------------------------
		\${FILES_SUMMARY}
		---------------------------
		\${ACTION_NAME}
		---------------------------
		\${ACTION_OWNER}
		---------------------------
		\${ACTION_REPO}
		---------------------------
		\${ACTION_URL}
		---------------------------
		\${ACTION_MARKETPLACE_URL}
		---------------------------
		\${DATE1}
		---------------------------
		\${DATE2}
		---------------------------
		\${VARIABLE1}
		---------------------------
		\${VARIABLE2}
`;

		expect(await getPrBody([], [], helper, generateActionContext({}, {
			payload: prPayload,
		}, {
			prBody,
			prVariables: ['variable1', ''],
			prDateFormats: ['YYYY/MM/DD', 'DD/MM/YYYY'],
		}))).toBe([
			'[test title](http://example.com)',
			'---------------------------',
			'',
			'---------------------------',
			'',
			'---------------------------',
			'',
			'---------------------------',
			'',
			'---------------------------',
			'',
			'---------------------------',
			'',
			'---------------------------',
			'',
			'---------------------------',
			'Changed file',
			'---------------------------',
			'Test Action',
			'---------------------------',
			'octocat',
			'---------------------------',
			'hello-world',
			'---------------------------',
			'https://github.com/octocat/hello-world',
			'---------------------------',
			'https://github.com/marketplace/actions/hello-world',
			'---------------------------',
			moment().format('YYYY/MM/DD'),
			'---------------------------',
			moment().format('DD/MM/YYYY'),
			'---------------------------',
			'variable1',
			'---------------------------',
			'',
		].join('\n'));
	});

	it('should not be code', async() => {
		expect(await getPrBody([], [], helper, generateActionContext({}, {
			payload: prPayload,
		}, {
			prBody: '${COMMANDS}',
		}))).toBe('');
	});

	it('should throw error', async() => {
		await expect(getPrBody([], [], helper, generateActionContext({}))).rejects.toThrow();
	});
});
