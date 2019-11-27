/* eslint-disable no-magic-numbers */
import { Context } from '@actions/github/lib/context';
import { GitHub } from '@actions/github';
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
import { execute } from '../../src';
import { clearCache } from '../../src/utils/command';
import * as constants from '../../src/constant';

const rootDir   = resolve(__dirname, '..', 'fixtures');
const setExists = testFs();
beforeEach(() => {
	Logger.resetForTesting();
	clearCache();
});

const actionDetails: ActionDetails = {
	actionName: 'Test Action',
	actionOwner: 'octocat',
	actionRepo: 'hello-world',
};
const getActionContext             = (context: Context, _actionDetails?: object, branch?: string): ActionContext => ({
	actionContext: context,
	actionDetail: _actionDetails ? Object.assign({}, actionDetails, _actionDetails) : actionDetails,
	defaultBranch: branch ?? 'master',
});

const context = (action: string, event = 'pull_request', ref = 'heads/test'): Context => generateContext({
	owner: 'hello',
	repo: 'world',
	event,
	action,
	ref,
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
const octokit = new GitHub('');

describe('execute', () => {
	disableNetConnect(nock);
	testEnv();
	testChildProcess();

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
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Ftest-21031067')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.post('/repos/hello/world/issues/1347/comments')
			.reply(201)
			.get('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

		await execute(octokit, getActionContext(context('synchronize'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-${PR_ID}',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Cloning [hello-world/test-21031067] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-21031067',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/test-21031067] not found.',
			'> now branch: test',
			'::endgroup::',
			'::group::Cloning [change] from the remote repo...',
			'[command]git clone --branch=change',
			'[command]git checkout -b "hello-world/test-21031067"',
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
			'::group::Pushing to hello/world@hello-world/test-21031067...',
			'[command]git push origin "hello-world/test-21031067":"refs/heads/hello-world/test-21031067"',
			'::endgroup::',
			'::group::Creating comment to PullRequest... [hello-world/test-21031067] -> [heads/test]',
			'::endgroup::',
			'> \x1b[32;40;0m✔\x1b[0m\t[change] updated',
		]);
	});

	it('should create commit', async() => {
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

		await execute(octokit, getActionContext(context('', 'push'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create test commit',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Cloning [test] branch from the remote repo...',
			'[command]git clone --branch=test',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
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
			'[command]git commit -qm "test: create test commit"',
			'[command]git show --stat-count=10 HEAD',
			'::endgroup::',
			'::group::Pushing to hello/world@test...',
			'[command]git push origin "test":"refs/heads/test"',
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
			.get('/repos/hello/world')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list2'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Ftest-1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.post('/repos/octocat/Hello-World/issues/1347/comments')
			.reply(201)
			.get('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

		await execute(octokit, getActionContext(context('', 'schedule'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-${PR_ID}',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
			targetBranchPrefix: 'feature/',
			checkDefaultBranch: false,
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [feature/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Cloning [hello-world/test-1] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-1',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/test-1] not found.',
			'> now branch: test',
			'> Cloning [feature/new-topic] from the remote repo...',
			'[command]git clone --branch=feature/new-topic',
			'[command]git checkout -b "hello-world/test-1"',
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
			'> Pushing to octocat/Hello-World@hello-world/test-1...',
			'[command]git push origin "hello-world/test-1":"refs/heads/hello-world/test-1"',
			'> Creating comment to PullRequest... [hello-world/test-1] -> [feature/new-topic]',
			'::endgroup::',
			'::group::Target PullRequest Ref [feature/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Cloning [hello-world/test-1] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-1',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/test-1] not found.',
			'> now branch: test',
			'> Cloning [feature/new-topic] from the remote repo...',
			'[command]git clone --branch=feature/new-topic',
			'[command]git checkout -b "hello-world/test-1"',
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
			'> Pushing to octocat/Hello-World@hello-world/test-1...',
			'[command]git push origin "hello-world/test-1":"refs/heads/hello-world/test-1"',
			'> Creating comment to PullRequest... [hello-world/test-1] -> [feature/new-topic]',
			'::endgroup::',
			'::group::Total:2  Succeeded:2  Failed:0  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[feature/new-topic] updated',
			'> \x1b[32;40;0m✔\x1b[0m\t[feature/new-topic] updated',
			'::endgroup::',
		]);
	});

	it('should do schedule (action base pull request has not been closed)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get.dev'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Amaster')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Ftest-1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

		await execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			prBranchName: 'test-${PR_ID}',
			checkDefaultBranch: false,
		}, 'develop'));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'  >> stdout',
			'> Cloning [hello-world/test-1] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-1',
			'> remote branch [hello-world/test-1] not found.',
			'> now branch: ',
			'> Cloning [hello-world/new-topic] from the remote repo...',
			'[command]git clone --branch=hello-world/new-topic',
			'[command]git checkout -b "hello-world/test-1"',
			'  >> stdout',
			'[command]ls -la',
			'  >> stdout',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'  >> stdout',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/hello-world/new-topic:refs/remotes/origin/hello-world/new-topic',
			'[command]git diff HEAD..origin/hello-world/new-topic --name-only',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'  >> stdout',
			'> Cloning [hello-world/test-1] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-1',
			'> remote branch [hello-world/test-1] not found.',
			'> now branch: ',
			'> Cloning [hello-world/new-topic] from the remote repo...',
			'[command]git clone --branch=hello-world/new-topic',
			'[command]git checkout -b "hello-world/test-1"',
			'  >> stdout',
			'[command]ls -la',
			'  >> stdout',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'  >> stdout',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/hello-world/new-topic:refs/remotes/origin/hello-world/new-topic',
			'[command]git diff HEAD..origin/hello-world/new-topic --name-only',
			'::endgroup::',
			'::group::Total:2  Succeeded:0  Failed:0  Skipped:2',
			'> \x1b[33;40;0m→\x1b[0m\t[hello-world/new-topic] There is no diff',
			'> \x1b[33;40;0m→\x1b[0m\t[hello-world/new-topic] There is no diff',
			'::endgroup::',
		]);
	});

	it('should do schedule (action base pull request is default branch)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Ftest-1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

		await execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			prBranchName: 'test-${PR_ID}',
			checkDefaultBranch: false,
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'  >> stdout',
			'> Cloning [hello-world/test-1] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-1',
			'> remote branch [hello-world/test-1] not found.',
			'> now branch: ',
			'> Cloning [hello-world/new-topic] from the remote repo...',
			'[command]git clone --branch=hello-world/new-topic',
			'[command]git checkout -b "hello-world/test-1"',
			'  >> stdout',
			'[command]ls -la',
			'  >> stdout',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'  >> stdout',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/hello-world/new-topic:refs/remotes/origin/hello-world/new-topic',
			'[command]git diff HEAD..origin/hello-world/new-topic --name-only',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'  >> stdout',
			'> Cloning [hello-world/test-1] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-1',
			'> remote branch [hello-world/test-1] not found.',
			'> now branch: ',
			'> Cloning [hello-world/new-topic] from the remote repo...',
			'[command]git clone --branch=hello-world/new-topic',
			'[command]git checkout -b "hello-world/test-1"',
			'  >> stdout',
			'[command]ls -la',
			'  >> stdout',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'  >> stdout',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/hello-world/new-topic:refs/remotes/origin/hello-world/new-topic',
			'[command]git diff HEAD..origin/hello-world/new-topic --name-only',
			'::endgroup::',
			'::group::Total:2  Succeeded:0  Failed:0  Skipped:2',
			'> \x1b[33;40;0m→\x1b[0m\t[hello-world/new-topic] There is no diff',
			'> \x1b[33;40;0m→\x1b[0m\t[hello-world/new-topic] There is no diff',
			'::endgroup::',
		]);
	});

	it('should process default branch', async() => {
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
			.get('/repos/hello/world')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => ([]))
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Ftest-0')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.post('/repos/hello/world/issues/1347/comments')
			.reply(201)
			.get('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

		await execute(octokit, getActionContext(context('', 'schedule'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-${PR_ID}',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [master]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Cloning [hello-world/test-0] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-0',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/test-0] not found.',
			'> now branch: test',
			'> Cloning [master] from the remote repo...',
			'[command]git clone --branch=master',
			'[command]git checkout -b "hello-world/test-0"',
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
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
			'[command]git diff HEAD..origin/master --name-only',
			'> Pushing to hello/world@hello-world/test-0...',
			'[command]git push origin "hello-world/test-0":"refs/heads/hello-world/test-0"',
			'> Creating comment to PullRequest... [hello-world/test-0] -> [master]',
			'::endgroup::',
			'::group::Total:1  Succeeded:1  Failed:0  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[master] updated',
			'::endgroup::',
		]);
	});

	it('should do fail', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					throw new Error('test error');
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
			.get('/repos/hello/world')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list2'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]));

		await execute(octokit, getActionContext(context('', 'schedule'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-${PR_ID}',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [feature/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Cloning [hello-world/test-1] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-1',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/test-1] not found.',
			'> now branch: test',
			'> Cloning [feature/new-topic] from the remote repo...',
			'[command]git clone --branch=feature/new-topic',
			'[command]git checkout -b "hello-world/test-1"',
			'[command]ls -la',
			'> Running commands...',
			'[command]yarn upgrade',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'undefined',
			'{}',
			'::endgroup::',
			'::group::Target PullRequest Ref [feature/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Cloning [hello-world/test-1] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-1',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/test-1] not found.',
			'> now branch: test',
			'> Cloning [feature/new-topic] from the remote repo...',
			'[command]git clone --branch=feature/new-topic',
			'[command]git checkout -b "hello-world/test-1"',
			'[command]ls -la',
			'> Running commands...',
			'[command]yarn upgrade',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'undefined',
			'{}',
			'::endgroup::',
			'::group::Target PullRequest Ref [master]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Cloning [hello-world/test-0] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-0',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/test-0] not found.',
			'> now branch: test',
			'> Cloning [master] from the remote repo...',
			'[command]git clone --branch=master',
			'[command]git checkout -b "hello-world/test-0"',
			'[command]ls -la',
			'> Running commands...',
			'[command]yarn upgrade',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'undefined',
			'{}',
			'::endgroup::',
			'::group::Total:3  Succeeded:0  Failed:3  Skipped:0',
			'> \x1b[31;40;0m×\x1b[0m\t[feature/new-topic] test error',
			'> \x1b[31;40;0m×\x1b[0m\t[feature/new-topic] test error',
			'> \x1b[31;40;0m×\x1b[0m\t[master] test error',
			'::endgroup::',
		]);
	});

	it('should do fail (closed action)', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					throw new Error('test error');
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
			.get('/repos/hello/world/pulls?sort=created&direction=asc&base=hello%3Amaster&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&base=hello%3Amaster&per_page=100&page=2')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Ftest-1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'));

		await execute(octokit, getActionContext(context('closed'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-${PR_ID}',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
		}));

		stdoutCalledWith(mockStdout, [
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Cloning [hello-world/test-1] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-1',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/test-1] not found.',
			'> now branch: test',
			'> Cloning [hello-world/new-topic] from the remote repo...',
			'[command]git clone --branch=hello-world/new-topic',
			'[command]git checkout -b "hello-world/test-1"',
			'[command]ls -la',
			'> Running commands...',
			'[command]yarn upgrade',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'undefined',
			'{}',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Cloning [hello-world/test-1] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-1',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/test-1] not found.',
			'> now branch: test',
			'> Cloning [hello-world/new-topic] from the remote repo...',
			'[command]git clone --branch=hello-world/new-topic',
			'[command]git checkout -b "hello-world/test-1"',
			'[command]ls -la',
			'> Running commands...',
			'[command]yarn upgrade',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'undefined',
			'{}',
			'::group::Total:2  Succeeded:0  Failed:2  Skipped:0',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic] test error',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic] test error',
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
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Ftest-21031067')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.false'));

		await execute(octokit, getActionContext(context('synchronize'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-${PR_ID}',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Cloning [hello-world/test-21031067] branch from the remote repo...',
			'[command]git clone --branch=hello-world/test-21031067',
			'[command]git branch -a | grep -E \'^\\*\' | cut -b 3-',
			'  >> test',
			'> remote branch [hello-world/test-21031067] not found.',
			'> now branch: test',
			'::endgroup::',
			'::group::Cloning [change] from the remote repo...',
			'[command]git clone --branch=change',
			'[command]git checkout -b "hello-world/test-21031067"',
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
			'::group::Pushing to hello/world@hello-world/test-21031067...',
			'[command]git push origin "hello-world/test-21031067":"refs/heads/hello-world/test-21031067"',
			'::endgroup::',
			'> \x1b[32;40;0m✔\x1b[0m\t[change] updated',
		]);
	});

	it('should throw error if push branch not found', async() => {
		process.env.GITHUB_WORKSPACE   = resolve('test');
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({stdout: ''});

		await expect(execute(octokit, getActionContext(context('', 'push', 'heads/test/change'), {
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

		await expect(execute(octokit, getActionContext(context('', 'push', 'heads/test/change'), {
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

		await execute(octokit, getActionContext(context('', 'push', 'heads/test/change'), {
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
