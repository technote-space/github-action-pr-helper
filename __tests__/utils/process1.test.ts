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

const workDir   = resolve(__dirname, 'test');
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

	it('should close pull request (closed action)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' branch -a')) {
					return '* hello-world/new-topic';
				}
				return '';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&base=change&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&base=change&per_page=100&page=2')
			.reply(200, () => [])
			.get('/repos/hello/world/pulls?sort=created&direction=asc&head=hello%3Amaster&per_page=100&page=1')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.post('/repos/octocat/Hello-World/issues/1347/comments')
			.reply(201)
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/octocat/Hello-World/git/refs/heads/hello-world/new-topic')
			.reply(204);

		await execute(octokit, getActionContext(context('closed'), {
			prBranchName: 'test-${PR_ID}',
			prCloseMessage: 'close message',
			checkDefaultBranch: false,
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Fetching...',
			'[command]rm -rdf [Working Directory]',
			'[command]git init \'.\'',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'> Switching branch to [hello-world/new-topic]...',
			'[command]git checkout -b hello-world/new-topic origin/hello-world/new-topic',
			'[command]git branch -a',
			'  >> * hello-world/new-topic',
			'[command]ls -la',
			'> Configuring git committer to be github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>',
			'[command]git config \'user.name\' \'github-actions[bot]\'',
			'[command]git config \'user.email\' \'41898282+github-actions[bot]@users.noreply.github.com\'',
			'> Merging [hello-world/new-topic] branch...',
			'[command]git merge --no-edit origin/hello-world/new-topic || :',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
			'[command]git diff \'HEAD..origin/master\' --name-only',
			'> Closing PullRequest... [hello-world/new-topic]',
			'> Deleting reference... [refs/heads/hello-world/new-topic]',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Fetching...',
			'[command]rm -rdf [Working Directory]',
			'[command]git init \'.\'',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'> Switching branch to [hello-world/new-topic]...',
			'[command]git checkout -b hello-world/new-topic origin/hello-world/new-topic',
			'[command]git branch -a',
			'  >> * hello-world/new-topic',
			'[command]ls -la',
			'> Configuring git committer to be github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>',
			'[command]git config \'user.name\' \'github-actions[bot]\'',
			'[command]git config \'user.email\' \'41898282+github-actions[bot]@users.noreply.github.com\'',
			'> Merging [hello-world/new-topic] branch...',
			'[command]git merge --no-edit origin/hello-world/new-topic || :',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
			'[command]git diff \'HEAD..origin/master\' --name-only',
			'> Closing PullRequest... [hello-world/new-topic]',
			'> Deleting reference... [refs/heads/hello-world/new-topic]',
			'::endgroup::',
			'::group::Total:2  Succeeded:2  Failed:0  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic] has been closed because there is no reference diff',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic] has been closed because there is no reference diff',
			'::endgroup::',
		]);
	});

	it('should close pull request (no ref diff)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					return 'M  __tests__/fixtures/test.md';
				}
				if (command.includes(' branch -a')) {
					return '* test';
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
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Ftest-21031067')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.patch('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/hello/world/git/refs/heads/hello-world/test-21031067')
			.reply(204);

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
			'::group::Fetching...',
			'[command]rm -rdf [Working Directory]',
			'[command]git init \'.\'',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'::endgroup::',
			'::group::Switching branch to [hello-world/test-21031067]...',
			'[command]git checkout -b hello-world/test-21031067 origin/hello-world/test-21031067',
			'[command]git branch -a',
			'  >> * test',
			'> remote branch [hello-world/test-21031067] not found.',
			'> now branch: test',
			'::endgroup::',
			'::group::Cloning [change] from the remote repo...',
			'[command]git checkout -b change origin/change',
			'[command]git checkout -b hello-world/test-21031067',
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
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'::endgroup::',
			'::group::Committing...',
			'[command]git commit -qm \'test: create pull request\'',
			'[command]git show \'--stat-count=10\' HEAD',
			'::endgroup::',
			'::group::Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/change:refs/remotes/origin/change',
			'[command]git diff \'HEAD..origin/change\' --name-only',
			'::endgroup::',
			'::group::Closing PullRequest... [hello-world/test-21031067]',
			'::endgroup::',
			'::group::Deleting reference... [refs/heads/hello-world/test-21031067]',
			'::endgroup::',
			'> \x1b[32;40;0m✔\x1b[0m\t[change] has been closed because there is no reference diff',
		]);
	});

	it('should close pull request (no diff, no ref diff)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
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
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Ftest-21031067')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.patch('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/hello/world/git/refs/heads/hello-world/test-21031067')
			.reply(204);

		await execute(octokit, getActionContext(context('synchronize'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			prBranchName: 'test-${PR_ID}',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'  >> stdout',
			'::endgroup::',
			'::group::Fetching...',
			'[command]rm -rdf [Working Directory]',
			'  >> stdout',
			'[command]git init \'.\'',
			'  >> stdout',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'  >> stdout',
			'::endgroup::',
			'::group::Switching branch to [hello-world/test-21031067]...',
			'[command]git checkout -b hello-world/test-21031067 origin/hello-world/test-21031067',
			'  >> stdout',
			'[command]git branch -a',
			'  >> stdout',
			'> remote branch [hello-world/test-21031067] not found.',
			'> now branch: ',
			'::endgroup::',
			'::group::Cloning [change] from the remote repo...',
			'[command]git checkout -b change origin/change',
			'  >> stdout',
			'[command]git checkout -b hello-world/test-21031067',
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
			'[command]git diff \'HEAD..origin/change\' --name-only',
			'::endgroup::',
			'::group::Closing PullRequest... [hello-world/test-21031067]',
			'::endgroup::',
			'::group::Deleting reference... [refs/heads/hello-world/test-21031067]',
			'::endgroup::',
			'> \x1b[32;40;0m✔\x1b[0m\t[change] has been closed because there is no reference diff',
		]);
	});

	it('should close pull request (base pull request has been closed)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
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
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.close'))
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/octocat/Hello-World/git/refs/heads/hello-world/new-topic')
			.reply(204);

		await execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			prBranchName: 'test-${PR_ID}',
			checkDefaultBranch: false,
		}, 'develop'));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Closing PullRequest... [hello-world/new-topic]',
			'> Deleting reference... [refs/heads/hello-world/new-topic]',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Closing PullRequest... [hello-world/new-topic]',
			'> Deleting reference... [refs/heads/hello-world/new-topic]',
			'::endgroup::',
			'::group::Total:2  Succeeded:2  Failed:0  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic] has been closed because base PullRequest has been closed',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic] has been closed because base PullRequest has been closed',
			'::endgroup::',
		]);
	});

	it('should close pull request (no ref diff, is action pr)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					return 'M  __tests__/fixtures/test.md';
				}
				if (command.includes(' branch -a')) {
					return '* hello-world/new-topic';
				}
				return '';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&base=change&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&base=change&per_page=100&page=2')
			.reply(200, () => [])
			.get('/repos/hello/world/pulls?sort=created&direction=asc&head=hello%3Amaster&per_page=100&page=1')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.post('/repos/octocat/Hello-World/issues/1347/comments')
			.reply(201)
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/octocat/Hello-World/git/refs/heads/hello-world/new-topic')
			.reply(204);

		await execute(octokit, getActionContext(context('closed'), {
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-${PR_ID}',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
			prCloseMessage: 'close message',
			checkDefaultBranch: false,
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Fetching...',
			'[command]rm -rdf [Working Directory]',
			'[command]git init \'.\'',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'> Switching branch to [hello-world/new-topic]...',
			'[command]git checkout -b hello-world/new-topic origin/hello-world/new-topic',
			'[command]git branch -a',
			'  >> * hello-world/new-topic',
			'[command]ls -la',
			'> Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'> Merging [hello-world/new-topic] branch...',
			'[command]git merge --no-edit origin/hello-world/new-topic || :',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'> Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'> Committing...',
			'[command]git commit -qm \'test: create pull request\'',
			'[command]git show \'--stat-count=10\' HEAD',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
			'[command]git diff \'HEAD..origin/master\' --name-only',
			'> Closing PullRequest... [hello-world/new-topic]',
			'> Deleting reference... [refs/heads/hello-world/new-topic]',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'> Fetching...',
			'[command]rm -rdf [Working Directory]',
			'[command]git init \'.\'',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'> Switching branch to [hello-world/new-topic]...',
			'[command]git checkout -b hello-world/new-topic origin/hello-world/new-topic',
			'[command]git branch -a',
			'  >> * hello-world/new-topic',
			'[command]ls -la',
			'> Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'> Merging [hello-world/new-topic] branch...',
			'[command]git merge --no-edit origin/hello-world/new-topic || :',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'> Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'> Committing...',
			'[command]git commit -qm \'test: create pull request\'',
			'[command]git show \'--stat-count=10\' HEAD',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
			'[command]git diff \'HEAD..origin/master\' --name-only',
			'> Closing PullRequest... [hello-world/new-topic]',
			'> Deleting reference... [refs/heads/hello-world/new-topic]',
			'::endgroup::',
			'::group::Total:2  Succeeded:2  Failed:0  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic] has been closed because there is no reference diff',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic] has been closed because there is no reference diff',
			'::endgroup::',
		]);
	});

	it('should do nothing (action base pull request not found)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
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
			.reply(200, () => [])
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/octocat/Hello-World/git/refs/heads/hello-world/new-topic')
			.reply(204);

		await execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			checkDefaultBranch: false,
		}, 'develop'));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Closing PullRequest... [hello-world/new-topic]',
			'> Deleting reference... [refs/heads/hello-world/new-topic]',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'> Closing PullRequest... [hello-world/new-topic]',
			'> Deleting reference... [refs/heads/hello-world/new-topic]',
			'::endgroup::',
			'::group::Total:2  Succeeded:2  Failed:0  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic] has been closed because base PullRequest does not exist',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic] has been closed because base PullRequest does not exist',
			'::endgroup::',
		]);
	});

	it('should do nothing (action pull request not found)', async() => {
		process.env.GITHUB_WORKSPACE = workDir;
		const mockStdout             = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic')
			.reply(200, () => []);

		await execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			checkDefaultBranch: false,
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic]',
			'::endgroup::',
			'::group::Total:2  Succeeded:0  Failed:2  Skipped:0',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic] not found',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic] not found',
			'::endgroup::',
		]);
	});

	it('should do nothing (not target branch)', async() => {
		process.env.GITHUB_WORKSPACE = workDir;
		const mockStdout             = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list2'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&per_page=100&page=2')
			.reply(200, () => ([]));

		await execute(octokit, getActionContext(context('synchronize'), {
			targetBranchPrefix: 'test/',
		}));

		stdoutCalledWith(mockStdout, [
			'> \x1b[33;40;0m→\x1b[0m\t[change] This is not target branch',
		]);
	});

	it('should do nothing (no diff)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Ftest-21031067')
			.reply(200, () => []);

		await execute(octokit, getActionContext(context('synchronize'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			prBranchName: 'test-${PR_ID}',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'  >> stdout',
			'::endgroup::',
			'::group::Fetching...',
			'[command]rm -rdf [Working Directory]',
			'  >> stdout',
			'[command]git init \'.\'',
			'  >> stdout',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'  >> stdout',
			'::endgroup::',
			'::group::Switching branch to [hello-world/test-21031067]...',
			'[command]git checkout -b hello-world/test-21031067 origin/hello-world/test-21031067',
			'  >> stdout',
			'[command]git branch -a',
			'  >> stdout',
			'> remote branch [hello-world/test-21031067] not found.',
			'> now branch: ',
			'::endgroup::',
			'::group::Cloning [change] from the remote repo...',
			'[command]git checkout -b change origin/change',
			'  >> stdout',
			'[command]git checkout -b hello-world/test-21031067',
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
			'> \x1b[33;40;0m→\x1b[0m\t[change] There is no diff',
		]);
	});

	it('should do nothing (not target branch (push))', async() => {
		const mockStdout = spyOnStdout();

		await execute(octokit, getActionContext(context('', 'push'), {
			targetBranchPrefix: 'test/',
		}));

		stdoutCalledWith(mockStdout, []);
	});

	it('should do nothing (no diff (push)))', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' branch -a')) {
					return '* test/change';
				}
				return '';
			},
		});
		setExists(true);

		await execute(octokit, getActionContext(context('', 'push', 'heads/test/change'), {
			targetBranchPrefix: 'test/',
			executeCommands: ['yarn upgrade'],
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Initializing working directory...',
			'[command]rm -rdf ./* ./.[!.]*',
			'::endgroup::',
			'::group::Fetching...',
			'[command]rm -rdf [Working Directory]',
			'[command]git init \'.\'',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'::endgroup::',
			'::group::Switching branch to [test/change]...',
			'[command]git checkout -b test/change origin/test/change',
			'[command]git branch -a',
			'  >> * test/change',
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
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					return 'M  __tests__/fixtures/test.md';
				}
				if (command.includes(' branch -a')) {
					return '* test/change';
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

		await execute(octokit, getActionContext(context('', 'push', 'heads/test/change'), {
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
			'::group::Fetching...',
			'[command]rm -rdf [Working Directory]',
			'[command]git init \'.\'',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'::endgroup::',
			'::group::Switching branch to [test/change]...',
			'[command]git checkout -b test/change origin/test/change',
			'[command]git branch -a',
			'  >> * test/change',
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
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'::endgroup::',
			'::group::Committing...',
			'[command]git commit -qm \'test: create pull request\'',
			'[command]git show \'--stat-count=10\' HEAD',
			'::endgroup::',
			'::group::Pushing to hello/world@test/change...',
			'[command]git push origin test/change:refs/heads/test/change',
			'undefined',
			'{}',
			'::warning::Branch [test/change] is protected.',
			'::endgroup::',
		]);
	});
});
