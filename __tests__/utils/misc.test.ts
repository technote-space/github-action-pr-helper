/* eslint-disable no-magic-numbers */
import { Context } from '@actions/github/lib/context';
import { testEnv, generateContext } from '@technote-space/github-action-test-helper';
import moment from 'moment';
import path from 'path';
import {
	getCommitMessage,
	getCommitName,
	getCommitEmail,
	replaceDirectory,
	getPrBranchName,
	getPrHeadRef,
	isActionPr,
	getPrTitle,
	getPrLink,
	getPrBody,
	isDisabledDeletePackage,
	isTargetContext,
	isClosePR,
	isTargetBranch,
	filterGitStatus,
	filterExtension,
} from '../../src/utils/misc';
import { ActionContext, ActionDetails } from '../../src/types';

const actionDetails: ActionDetails = {
	actionName: 'Test Action',
	actionOwner: 'octocat',
	actionRepo: 'hello-world',
};
const getActionContext             = (context: Context, _actionDetails?: ActionDetails): ActionContext => ({
	actionContext: context,
	actionDetail: _actionDetails ?? actionDetails,
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

describe('isTargetContext', () => {
	testEnv();

	it('should return true 1', () => {
		expect(isTargetContext(generateActionContext({
			event: 'pull_request',
			action: 'opened',
		}, {
			payload: {
				'pull_request': {
					labels: [],
				},
			},
		}))).toBe(true);
	});

	it('should return true 2', () => {
		expect(isTargetContext(generateActionContext({
			event: 'pull_request',
			action: 'synchronize',
		}, {
			payload: {
				'pull_request': {
					labels: [{name: 'label1'}, {name: 'label2'}],
				},
			},
		}, {includeLabels: ['label2']}))).toBe(true);
	});

	it('should return true 3', () => {
		expect(isTargetContext(generateActionContext({
			event: 'pull_request',
			action: 'synchronize',
		}, {
			payload: {
				'pull_request': {
					labels: [{name: 'label2'}],
				},
			},
		}, {includeLabels: ['label1', 'label2', 'label3']}))).toBe(true);
	});

	it('should return true 4', () => {
		expect(isTargetContext(generateActionContext({
			event: 'pull_request',
			action: 'opened',
		}, {
			payload: {
				'pull_request': {
					labels: [],
				},
			},
		}))).toBe(true);
	});

	it('should return true 5', () => {
		expect(isTargetContext(generateActionContext({
			event: 'pull_request',
			action: 'closed',
		}, {
			payload: {
				'pull_request': {
					labels: [],
				},
			},
		}))).toBe(true);
	});

	it('should return true 6', () => {
		expect(isTargetContext(generateActionContext({
			event: 'schedule',
		}))).toBe(true);
	});

	it('should return true 6', () => {
		expect(isTargetContext(generateActionContext({
			ref: 'heads/test/change',
			event: 'push',
		}, {}, {targetBranchPrefix: 'test/', targetEvents: {push: '*'}}))).toBe(true);
	});

	it('should return false 1', () => {
		expect(isTargetContext(generateActionContext({
			ref: 'tags/test',
			event: 'issues',
			action: 'opened',
		}))).toBe(false);
	});

	it('should return false 2', () => {
		expect(isTargetContext(generateActionContext({
			event: 'pull_request',
			action: 'opened',
		}, {
			payload: {
				'pull_request': {
					labels: [{name: 'label1'}],
				},
			},
		}, {includeLabels: 'test2'}))).toBe(false);
	});

	it('should return false 3', () => {
		expect(isTargetContext(generateActionContext({
			ref: 'heads/master',
			event: 'pull_request',
			action: 'synchronize',
		}, {
			payload: {
				'pull_request': {
					labels: [{name: 'label2'}],
				},
			},
		}, {includeLabels: 'test1'}))).toBe(false);
	});

	it('should return false 4', () => {
		expect(isTargetContext(generateActionContext({
			event: 'pull_request',
			action: 'closed',
		}))).toBe(false);
	});

	it('should return false 5', () => {
		expect(isTargetContext(generateActionContext({
			ref: 'heads/test/change',
			event: 'push',
		}))).toBe(false);
	});
});

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

	it('should throw error', () => {
		expect(() => getCommitName(generateActionContext({}))).toThrow();
		expect(() => getCommitName(generateActionContext({}, {}, {commitName: ''}))).toThrow();
	});
});

describe('getCommitEmail', () => {
	testEnv();

	it('should get commit email', () => {
		expect(getCommitEmail(generateActionContext({}, {}, {commitEmail: 'test'}))).toBe('test');
	});

	it('should throw error', () => {
		expect(() => getCommitEmail(generateActionContext({}))).toThrow();
		expect(() => getCommitEmail(generateActionContext({}, {}, {commitEmail: ''}))).toThrow();
	});
});

describe('replaceDirectory', () => {
	testEnv();

	it('should replace working directory 1', () => {
		process.env.GITHUB_WORKSPACE = path.resolve('test-dir');
		const workDir                = path.resolve('test-dir');

		expect(replaceDirectory(`git -C ${workDir} fetch`)).toBe('git fetch');
	});

	it('should replace working directory 2', () => {
		process.env.GITHUB_WORKSPACE = path.resolve('test-dir');
		const workDir                = path.resolve('test-dir');

		expect(replaceDirectory(`cp -a ${workDir}/test1 ${workDir}/test2`)).toBe('cp -a [Working Directory]/test1 [Working Directory]/test2');
	});
});

describe('getPrBranchName', () => {
	testEnv();

	it('should get pr branch name', () => {
		expect(getPrBranchName(generateActionContext({event: 'pull_request'}, {
			payload: prPayload,
		}, {
			prBranchName: '${PR_NUMBER}-${PR_ID}-${PR_HEAD_REF}-${PR_BASE_REF}-${PR_TITLE}-${PR_URL}',
		}))).toBe('hello-world/11-21031067-change-master-test title-http://example.com');
	});

	it('should get push branch name', () => {
		expect(getPrBranchName(generateActionContext({event: 'push'}, {ref: 'heads/test-ref'}, {
			prBranchName: '${PR_NUMBER}-${PR_ID}-${PR_HEAD_REF}-${PR_BASE_REF}-${PR_TITLE}-${PR_URL}',
		}))).toBe('test-ref');
	});

	it('should throw error', () => {
		expect(() => getPrBranchName(generateActionContext({}))).toThrow();
		expect(() => getPrBranchName(generateActionContext({}, {}, {prBranchName: ''}))).toThrow();
	});

	it('should throw error', () => {
		expect(() => getPrBranchName(generateActionContext({event: 'pull_request'}, {}, {
			prBranchName: '${PR_NUMBER}-${PR_ID}-${PR_HEAD_REF}-${PR_BASE_REF}-${PR_TITLE}-${PR_URL}',
		}))).toThrow();
	});
});

describe('getPrHeadRef', () => {
	it('should get pr head ref', () => {
		expect(getPrHeadRef(generateActionContext({}, {
			payload: {
				'pull_request': {
					head: {
						ref: 'change',
					},
				},
			},
		}))).toBe('change');
	});

	it('should return empty', () => {
		expect(getPrHeadRef(generateActionContext({}))).toBe('');
	});
});

describe('isActionPr', () => {
	testEnv();

	it('should return true', () => {
		expect(isActionPr(generateActionContext({}, {
			payload: {
				'pull_request': {
					head: {
						ref: 'prefix/test',
					},
				},
			},
		}, {prBranchPrefix: 'prefix/'}))).toBe(true);
	});

	it('should return false 1', () => {
		expect(isActionPr(generateActionContext({}, {
			payload: {
				'pull_request': {
					head: {
						ref: 'prefix/test',
					},
				},
			},
		}))).toBe(false);
	});

	it('should return false 2', () => {
		expect(isActionPr(generateActionContext({}, {
			payload: {},
		}))).toBe(false);
	});
});

describe('getPrTitle', () => {
	testEnv();

	it('should get PR title', () => {
		expect(getPrTitle(generateActionContext({}, {payload: prPayload}, {
			prTitle: '${PR_NUMBER}-${PR_ID}-${PR_HEAD_REF}-${PR_BASE_REF}',
		}))).toBe('11-21031067-change-master');
	});

	it('should throw error', () => {
		expect(() => getPrTitle(generateActionContext({}))).toThrow();
	});

	it('should throw error', () => {
		expect(() => getPrTitle(generateActionContext({}, {}, {
			prTitle: '${PR_NUMBER}-${PR_ID}-${PR_HEAD_REF}-${PR_BASE_REF}',
		}))).toThrow();
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

	it('should get PR Body 1', () => {
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

		expect(getPrBody(['README.md', 'CHANGELOG.md'], [
			{command: 'test1', stdout: ['test1-1', 'test1-2'], stderr: []},
			{command: 'test2', stdout: ['test2-1', 'test2-2'], stderr: ['test2-3']},
		], generateActionContext({}, {
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

	it('should get PR Body 2', () => {
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

		expect(getPrBody(['README.md'], [
			{command: 'test1', stdout: ['test1-1', 'test1-2'], stderr: ['test1-3', 'test1-4']},
			{command: 'test2', stdout: [], stderr: []},
		], generateActionContext({}, {
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

	it('should not be code', () => {
		expect(getPrBody([], [], generateActionContext({}, {
			payload: prPayload,
		}, {
			prBody: '${COMMANDS}',
		}))).toBe('');
	});

	it('should throw error', () => {
		expect(() => getPrBody([], [], generateActionContext({}))).toThrow();
	});
});

describe('isDisabledDeletePackage', () => {
	testEnv();

	it('should be false', () => {
		expect(isDisabledDeletePackage(generateActionContext({}, {}, {
			deletePackage: true,
		}))).toBe(false);
	});

	it('should be true 1', () => {
		expect(isDisabledDeletePackage(generateActionContext({}, {}, {
			deletePackage: false,
		}))).toBe(true);
	});

	it('should be true 2', () => {
		expect(isDisabledDeletePackage(generateActionContext({}))).toBe(true);
	});
});

describe('isClosePR', () => {
	testEnv();
	it('should return true', () => {
		expect(isClosePR(generateActionContext({
			event: 'pull_request',
			action: 'closed',
		}))).toBe(true);
	});

	it('should return false 1', () => {
		expect(isClosePR(generateActionContext({
			event: 'push',
		}, {}, {
			prBranchName: 'test',
		}))).toBe(false);
	});

	it('should return false 2', () => {
		expect(isClosePR(generateActionContext({
			event: 'pull_request',
			action: 'synchronize',
		}))).toBe(false);
	});
});

describe('isTargetBranch', () => {
	testEnv();

	it('should return true 1', () => {
		expect(isTargetBranch('test', generateActionContext({}))).toBe(true);
	});

	it('should return true 2', () => {
		expect(isTargetBranch('feature/test', generateActionContext({}, {}, {
			targetBranchPrefix: 'feature/',
		}))).toBe(true);
	});

	it('should return false', () => {
		expect(isTargetBranch('test', generateActionContext({}, {}, {
			targetBranchPrefix: 'feature/',
		}))).toBe(false);
	});
});

describe('filterGitStatusFunc', () => {
	testEnv();

	it('should filter git status', () => {
		const context = generateActionContext({}, {}, {
			filterGitStatus: 'Mdc',
		});
		expect(filterGitStatus('M  test.md', context)).toBe(true);
		expect(filterGitStatus('D  test.md', context)).toBe(true);
		expect(filterGitStatus('A  test.md', context)).toBe(false);
		expect(filterGitStatus('C  test.md', context)).toBe(false);
	});

	it('should not filter', () => {
		const context = generateActionContext({});
		expect(filterGitStatus('M  test.md', context)).toBe(true);
		expect(filterGitStatus('D  test.md', context)).toBe(true);
		expect(filterGitStatus('A  test.md', context)).toBe(true);
		expect(filterGitStatus('C  test.md', context)).toBe(true);
	});

	it('should throw error', () => {
		expect(() => filterGitStatus('C  test.md', generateActionContext({}, {}, {
			filterGitStatus: 'c',
		}))).toThrow();
	});
});

describe('filterExtension', () => {
	testEnv();

	it('should filter extension', () => {
		const context = generateActionContext({}, {}, {
			filterExtensions: ['md', '.txt'],
		});
		expect(filterExtension('test.md', context)).toBe(true);
		expect(filterExtension('test.txt', context)).toBe(true);
		expect(filterExtension('test.js', context)).toBe(false);
		expect(filterExtension('test.1md', context)).toBe(false);
		expect(filterExtension('test.md1', context)).toBe(false);
	});

	it('should not filter', () => {
		const context = generateActionContext({});
		expect(filterExtension('test.md', context)).toBe(true);
		expect(filterExtension('test.txt', context)).toBe(true);
		expect(filterExtension('test.js', context)).toBe(true);
		expect(filterExtension('test.1md', context)).toBe(true);
		expect(filterExtension('test.md1', context)).toBe(true);
	});
});
