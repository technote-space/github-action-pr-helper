/* eslint-disable no-magic-numbers */
import { Context } from '@actions/github/lib/context';
import nock from 'nock';
import { resolve } from 'path';
import {
	generateContext,
	testEnv,
	testFs,
	disableNetConnect,
	spyOnStdout,
	stdoutCalledWith,
	getApiFixture,
	setChildProcessParams,
	testChildProcess,
} from '@technote-space/github-action-test-helper';
import { Logger } from '@technote-space/github-action-helper';
import { ActionContext, ActionDetails } from '../../src/types';
import { execute } from '../../src/utils/process';
import * as constants from '../../src/constant';

const rootDir   = resolve(__dirname, '..', 'fixtures');
const setExists = testFs();
beforeEach(() => {
	Logger.resetForTesting();
});

const actionDetails: ActionDetails = {
	actionName: 'Test Action',
	actionOwner: 'octocat',
	actionRepo: 'hello-world',
};
const getActionContext             = (context: Context, _actionDetails?: object): ActionContext => ({
	actionContext: context,
	actionDetail: _actionDetails ? Object.assign({}, actionDetails, _actionDetails) : actionDetails,
});

const context = (action: string, event = 'pull_request'): Context => generateContext({
	owner: 'hello',
	repo: 'world',
	event,
	action,
	ref: 'heads/test',
	sha: '7638417db6d59f3c431d3e1f261cc637155684cd',
}, {
	payload: {
		'pull_request': {
			number: 11,
			id: 21031067,
			head: {
				ref: 'change',
			},
			base: {
				ref: 'master',
			},
		},
	},
});

describe('execute', () => {
	disableNetConnect(nock);
	testEnv();
	testChildProcess();

	it('should close pull request (closed action)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Fclose%2Ftest')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.post('/repos/hello/world/issues/1347/comments')
			.reply(201)
			.patch('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/hello/world/git/refs/heads/hello-world/close/test')
			.reply(204);

		await execute(getActionContext(context('closed'), {
			prBranchName: 'close/test',
			prCloseMessage: 'close message',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Closing PullRequest... [hello-world/close/test]',
			'::endgroup::',
			'::group::Deleting reference... [refs/heads/hello-world/close/test]',
			'::endgroup::',
		]);
	});

	it('should close pull request (no ref diff)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					return 'M  __tests__/fixtures/test.md';
				}
				if (command.includes(' branch -a ')) {
					return 'test';
				}
				return '';
			},
		});
		setExists(true);
		// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
		// @ts-ignore
		constants.INTERVAL_MS = 1;

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]))
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Fcreate%2Ftest')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.patch('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/hello/world/git/refs/heads/hello-world/create/test')
			.reply(204);

		await execute(getActionContext(context('synchronize'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'create/test',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Cloning [hello-world/create/test] branch from the remote repo...',
			'[command]git clone --branch=hello-world/create/test',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/create/test] not found.',
			'> now branch: test',
			'::endgroup::',
			'::group::Cloning [change] from the remote repo...',
			'[command]git clone --branch=change',
			'[command]git checkout -b "hello-world/create/test"',
			'[command]ls -la',
			'::endgroup::',
			'::group::Running commands...',
			'[command]yarn upgrade',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'::endgroup::',
			'::group::Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config user.name "GitHub Actions"',
			'[command]git config user.email "example@example.com"',
			'::endgroup::',
			'::group::Committing...',
			'[command]git commit -qm "test: create pull request"',
			'[command]git show --stat-count=10 HEAD',
			'::endgroup::',
			'::group::Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/change:refs/remotes/origin/change',
			'[command]git diff HEAD..origin/change --name-only',
			'::endgroup::',
			'::group::Closing PullRequest... [hello-world/create/test]',
			'::endgroup::',
			'::group::Deleting reference... [refs/heads/hello-world/create/test]',
			'::endgroup::',
		]);
	});

	it('should close pull request (no diff, no ref diff)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' diff ')) {
					return '';
				}
				return 'stdout';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Ftest-branch')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.patch('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/hello/world/git/refs/heads/hello-world/test-branch')
			.reply(204);

		await execute(getActionContext(context('synchronize'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			prBranchName: 'test-branch',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'  >> stdout',
			'::endgroup::',
			'::group::Cloning [hello-world/test-branch] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-branch',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> stdout',
			'> remote branch [hello-world/test-branch] not found.',
			'> now branch: stdout',
			'::endgroup::',
			'::group::Cloning [change] from the remote repo...',
			'[command]git clone --branch=change',
			'[command]git checkout -b "hello-world/test-branch"',
			'  >> stdout',
			'[command]ls -la',
			'  >> stdout',
			'::endgroup::',
			'::group::Running commands...',
			'[command]yarn upgrade',
			'  >> stdout',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'  >> stdout',
			'[command]git status --short -uno',
			'> There is no diff.',
			'::endgroup::',
			'::group::Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/change:refs/remotes/origin/change',
			'[command]git diff HEAD..origin/change --name-only',
			'::endgroup::',
			'::group::Closing PullRequest... [hello-world/test-branch]',
			'::endgroup::',
			'::group::Deleting reference... [refs/heads/hello-world/test-branch]',
			'::endgroup::',
		]);
	});

	it('should close pull request (base pull request has been closed)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Amaster')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.close'))
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/octocat/Hello-World/git/refs/heads/hello-world/new-topic')
			.reply(204);

		await execute(getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
		}));

		stdoutCalledWith(mockStdout, [
			'> Closing PullRequest... [hello-world/new-topic]',
			'> Deleting reference... [refs/heads/hello-world/new-topic]',
			'> Closing PullRequest... [hello-world/new-topic]',
			'> Deleting reference... [refs/heads/hello-world/new-topic]',
			'::group::Total:2  Processed:2  Skipped:0',
			'::endgroup::',
		]);
	});

	it('should do nothing (action pull request not found)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic')
			.reply(200, () => []);

		await execute(getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Total:2  Processed:0  Skipped:2',
			'::endgroup::',
		]);
	});

	it('should do nothing (action base pull request not found)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Amaster')
			.reply(200, () => []);

		await execute(getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Total:2  Processed:0  Skipped:2',
			'::endgroup::',
		]);
	});

	it('should do nothing (action base pull request has not been closed)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Amaster')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'));

		await execute(getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Total:2  Processed:0  Skipped:2',
			'::endgroup::',
		]);
	});

	it('should do nothing (not target branch)', async() => {
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list2'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]));

		await execute(getActionContext(context('synchronize'), {
			targetBranchPrefix: 'test/',
		}));

		stdoutCalledWith(mockStdout, []);
	});

	it('should do nothing (no diff)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Ftest-branch')
			.reply(200, () => []);

		await execute(getActionContext(context('synchronize'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			prBranchName: 'test-branch',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'  >> stdout',
			'::endgroup::',
			'::group::Cloning [hello-world/test-branch] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-branch',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> stdout',
			'> remote branch [hello-world/test-branch] not found.',
			'> now branch: stdout',
			'::endgroup::',
			'::group::Cloning [change] from the remote repo...',
			'[command]git clone --branch=change',
			'[command]git checkout -b "hello-world/test-branch"',
			'  >> stdout',
			'[command]ls -la',
			'  >> stdout',
			'::endgroup::',
			'::group::Running commands...',
			'[command]yarn upgrade',
			'  >> stdout',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'  >> stdout',
			'[command]git status --short -uno',
			'> There is no diff.',
			'::endgroup::',
		]);
	});

	it('should do nothing (not target branch (push))', async() => {
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		await execute(getActionContext(context('', 'push')));

		stdoutCalledWith(mockStdout, []);
	});

	it('should do nothing (no diff (push)))', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' branch -a ')) {
					return 'test/change';
				}
				return '';
			},
		});
		setExists(true);

		await execute(getActionContext(Object.assign(context('', 'push'), {
			ref: 'refs/heads/test/change',
		}), {
			targetBranchPrefix: 'test/',
			executeCommands: ['yarn upgrade'],
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Cloning [test/change] branch from the remote repo...',
			'[command]git clone --branch=test/change',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test/change',
			'[command]ls -la',
			'::endgroup::',
			'::group::Running commands...',
			'[command]yarn upgrade',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'> There is no diff.',
			'::endgroup::',
		]);
	});

	it('should do nothing (push to protected branch)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					return 'M  __tests__/fixtures/test.md';
				}
				if (command.includes(' branch -a ')) {
					return 'test/change';
				}
				if (command.includes('git push ')) {
					throw new Error(
						'remote: error: GH006: Protected branch update failed for refs/heads/test/change.        \n' +
						'remote: error: 4 of 4 required status checks are expected.        \n' +
						'To https://test:test-token@github.com/hello/world.git\n' +
						' ! [remote rejected] test/change -> test/change (protected branch hook declined)\n' +
						'error: failed to push some refs to \'https://test:test-token@github.com/hello/world.git\'\n',
					);
				}
				return '';
			},
		});
		setExists(true);

		await execute(getActionContext(Object.assign(context('', 'push'), {
			ref: 'refs/heads/test/change',
		}), {
			targetBranchPrefix: 'test/',
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Cloning [test/change] branch from the remote repo...',
			'[command]git clone --branch=test/change',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test/change',
			'[command]ls -la',
			'::endgroup::',
			'::group::Running commands...',
			'[command]yarn upgrade',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'::endgroup::',
			'::group::Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config user.name "GitHub Actions"',
			'[command]git config user.email "example@example.com"',
			'::endgroup::',
			'::group::Committing...',
			'[command]git commit -qm "test: create pull request"',
			'[command]git show --stat-count=10 HEAD',
			'::endgroup::',
			'::group::Pushing to hello/world@test/change...',
			'[command]git push origin "test/change":"refs/heads/test/change"',
			'undefined',
			'{}',
			'::warning::Branch [test/change] is protected.',
			'::endgroup::',
		]);
	});

	it('should create pull request', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					return 'M  __tests__/fixtures/test.md';
				}
				if (command.includes(' diff ')) {
					return '__tests__/fixtures/test.md';
				}
				if (command.includes(' branch -a ')) {
					return 'test';
				}
				return '';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Fcreate%2Ftest')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.post('/repos/hello/world/issues/1347/comments')
			.reply(201)
			.get('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

		await execute(getActionContext(context('synchronize'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'create/test',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Cloning [hello-world/create/test] branch from the remote repo...',
			'[command]git clone --branch=hello-world/create/test',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/create/test] not found.',
			'> now branch: test',
			'::endgroup::',
			'::group::Cloning [change] from the remote repo...',
			'[command]git clone --branch=change',
			'[command]git checkout -b "hello-world/create/test"',
			'[command]ls -la',
			'::endgroup::',
			'::group::Running commands...',
			'[command]yarn upgrade',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'::endgroup::',
			'::group::Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config user.name "GitHub Actions"',
			'[command]git config user.email "example@example.com"',
			'::endgroup::',
			'::group::Committing...',
			'[command]git commit -qm "test: create pull request"',
			'[command]git show --stat-count=10 HEAD',
			'::endgroup::',
			'::group::Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/change:refs/remotes/origin/change',
			'[command]git diff HEAD..origin/change --name-only',
			'::endgroup::',
			'::group::Pushing to hello/world@hello-world/create/test...',
			'[command]git push origin "hello-world/create/test":"refs/heads/hello-world/create/test"',
			'::endgroup::',
			'::group::Creating comment to PullRequest... [hello-world/create/test] -> [heads/test]',
			'::endgroup::',
		]);
	});

	it('should do schedule', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					return 'M  __tests__/fixtures/test.md';
				}
				if (command.includes(' diff ')) {
					return '__tests__/fixtures/test.md';
				}
				if (command.includes(' branch -a ')) {
					return 'test';
				}
				return '';
			},
		});
		setExists(true);
		// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
		// @ts-ignore
		constants.INTERVAL_MS = 1;

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list2'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fcreate%2Ftest')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.post('/repos/octocat/Hello-World/issues/1347/comments')
			.reply(201)
			.get('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

		await execute(getActionContext(context('', 'schedule'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'create/test',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
			targetBranchPrefix: 'feature/',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [feature/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Cloning [hello-world/create/test] branch from the remote repo...',
			'[command]git clone --branch=hello-world/create/test',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/create/test] not found.',
			'> now branch: test',
			'> Cloning [feature/new-topic] from the remote repo...',
			'[command]git clone --branch=feature/new-topic',
			'[command]git checkout -b "hello-world/create/test"',
			'[command]ls -la',
			'> Running commands...',
			'[command]yarn upgrade',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'> Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config user.name "GitHub Actions"',
			'[command]git config user.email "example@example.com"',
			'> Committing...',
			'[command]git commit -qm "test: create pull request"',
			'[command]git show --stat-count=10 HEAD',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/feature/new-topic:refs/remotes/origin/feature/new-topic',
			'[command]git diff HEAD..origin/feature/new-topic --name-only',
			'> Pushing to octocat/Hello-World@hello-world/create/test...',
			'[command]git push origin "hello-world/create/test":"refs/heads/hello-world/create/test"',
			'> Creating comment to PullRequest... [hello-world/create/test] -> [feature/new-topic]',
			'::endgroup::',
			'::group::Target PullRequest Ref [feature/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Cloning [hello-world/create/test] branch from the remote repo...',
			'[command]git clone --branch=hello-world/create/test',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/create/test] not found.',
			'> now branch: test',
			'> Cloning [feature/new-topic] from the remote repo...',
			'[command]git clone --branch=feature/new-topic',
			'[command]git checkout -b "hello-world/create/test"',
			'[command]ls -la',
			'> Running commands...',
			'[command]yarn upgrade',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'> Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config user.name "GitHub Actions"',
			'[command]git config user.email "example@example.com"',
			'> Committing...',
			'[command]git commit -qm "test: create pull request"',
			'[command]git show --stat-count=10 HEAD',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/feature/new-topic:refs/remotes/origin/feature/new-topic',
			'[command]git diff HEAD..origin/feature/new-topic --name-only',
			'> Pushing to octocat/Hello-World@hello-world/create/test...',
			'[command]git push origin "hello-world/create/test":"refs/heads/hello-world/create/test"',
			'> Creating comment to PullRequest... [hello-world/create/test] -> [feature/new-topic]',
			'::endgroup::',
			'::group::Total:2  Processed:2  Skipped:0',
			'::endgroup::',
		]);
	});

	it('should resolve conflicts', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.startsWith('git merge')) {
					return 'Already up to date.';
				}
				if (command.includes(' diff ')) {
					return '__tests__/fixtures/test.md';
				}
				if (command.includes(' branch -a ')) {
					return 'test';
				}
				return '';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Fcreate%2Ftest')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.false'));

		await execute(getActionContext(context('synchronize'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'create/test',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Cloning [hello-world/create/test] branch from the remote repo...',
			'[command]git clone --branch=hello-world/create/test',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/create/test] not found.',
			'> now branch: test',
			'::endgroup::',
			'::group::Cloning [change] from the remote repo...',
			'[command]git clone --branch=change',
			'[command]git checkout -b "hello-world/create/test"',
			'[command]ls -la',
			'::endgroup::',
			'::group::Running commands...',
			'[command]yarn upgrade',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'> There is no diff.',
			'::endgroup::',
			'::group::Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/change:refs/remotes/origin/change',
			'[command]git diff HEAD..origin/change --name-only',
			'::endgroup::',
			'::group::Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config user.name "GitHub Actions"',
			'[command]git config user.email "example@example.com"',
			'::endgroup::',
			'::group::Merging [change] branch...',
			'[command]git merge --no-edit origin/change || :',
			'  >> Already up to date.',
			'::endgroup::',
			'::group::Pushing to hello/world@hello-world/create/test...',
			'[command]git push origin "hello-world/create/test":"refs/heads/hello-world/create/test"',
			'::endgroup::',
		]);
	});

	it('should throw error if push branch not found', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({stdout: ''});

		await expect(execute(getActionContext(Object.assign(context('', 'push'), {
			ref: 'refs/heads/test/change',
		}), {
			executeCommands: ['yarn upgrade'],
			targetBranchPrefix: 'test/',
		}))).rejects.toThrow('remote branch [test/change] not found.');

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Cloning [test/change] branch from the remote repo...',
			'[command]git clone --branch=test/change',
		]);
	});

	it('should throw error if push failed', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					return 'M  __tests__/fixtures/test.md';
				}
				if (command.includes(' branch -a ')) {
					return 'test/change';
				}
				if (command.includes('git push ')) {
					throw new Error('unexpected error');
				}
				return '';
			},
		});
		setExists(true);

		await expect(execute(getActionContext(Object.assign(context('', 'push'), {
			ref: 'refs/heads/test/change',
		}), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			targetBranchPrefix: 'test/',
		}))).rejects.toThrow('unexpected error');

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Cloning [test/change] branch from the remote repo...',
			'[command]git clone --branch=test/change',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test/change',
			'[command]ls -la',
			'::endgroup::',
			'::group::Running commands...',
			'[command]yarn upgrade',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'::endgroup::',
			'::group::Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config user.name "GitHub Actions"',
			'[command]git config user.email "example@example.com"',
			'::endgroup::',
			'::group::Committing...',
			'[command]git commit -qm "test: create pull request"',
			'[command]git show --stat-count=10 HEAD',
			'::endgroup::',
			'::group::Pushing to hello/world@test/change...',
			'[command]git push origin "test/change":"refs/heads/test/change"',
			'undefined',
			'{}',
		]);
	});

	it('should create commit', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					return 'M  __tests__/fixtures/test.md';
				}
				if (command.includes(' branch -a ')) {
					return 'test/change';
				}
				return '';
			},
		});
		setExists(true);

		await execute(getActionContext(Object.assign(context('', 'push'), {
			ref: 'refs/heads/test/change',
		}), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			targetBranchPrefix: 'test/',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Cloning [test/change] branch from the remote repo...',
			'[command]git clone --branch=test/change',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test/change',
			'[command]ls -la',
			'::endgroup::',
			'::group::Running commands...',
			'[command]yarn upgrade',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'::endgroup::',
			'::group::Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config user.name "GitHub Actions"',
			'[command]git config user.email "example@example.com"',
			'::endgroup::',
			'::group::Committing...',
			'[command]git commit -qm "test: create pull request"',
			'[command]git show --stat-count=10 HEAD',
			'::endgroup::',
			'::group::Pushing to hello/world@test/change...',
			'[command]git push origin "test/change":"refs/heads/test/change"',
			'::endgroup::',
		]);
	});
});
