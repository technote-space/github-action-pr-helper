/* eslint-disable no-magic-numbers */
import { Context } from '@actions/github/lib/context';
import moment from 'moment';
import nock from 'nock';
import { resolve } from 'path';
import { Logger } from '@technote-space/github-action-helper';
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
	getOctokit,
} from '@technote-space/github-action-test-helper';
import { ActionContext, ActionDetails } from '../../src/types';
import { execute, autoMerge } from '../../src/utils/process';
import { getCacheKey } from '../../src/utils/misc';

const workDir   = resolve(__dirname, 'test');
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
const getActionContext             = (context: Context, _actionDetails?: object, branch?: string, isBatchProcess?: boolean): ActionContext => ({
	actionContext: context,
	actionDetail: _actionDetails ? Object.assign({}, actionDetails, _actionDetails) : actionDetails,
	cache: {
		[getCacheKey('repos', {owner: context.repo.owner, repo: context.repo.repo})]: branch ?? 'master',
	},
	isBatchProcess,
});

const context = (action: string, event = 'pull_request', ref = 'refs/pull/55/merge'): Context => generateContext({
	owner: 'hello',
	repo: 'world',
	event,
	action,
	ref,
	sha: '7638417db6d59f3c431d3e1f261cc637155684cd',
}, {
	actor: 'test-actor',
	payload: 'push' === event ? {} : {
		number: 11,
		'pull_request': {
			number: 11,
			id: 21031067,
			head: {
				ref: 'feature/new-feature',
			},
			base: {
				ref: 'master',
			},
		},
	},
});
const octokit = getOctokit();

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
				if (command.includes(' rev-parse')) {
					return 'hello-world/new-topic1';
				}
				return '';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&head=hello%3Amaster')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic2')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.post('/repos/octocat/Hello-World/issues/1347/comments')
			.reply(201)
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/octocat/Hello-World/git/refs/heads/hello-world/new-topic1')
			.reply(204);

		await expect(execute(octokit, getActionContext(context('closed'), {
			prBranchName: 'test-${PR_ID}',
			prCloseMessage: 'close message',
			checkDefaultBranch: false,
		}))).rejects.toThrow('There is a failed process.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/new-topic1:refs/remotes/origin/hello-world/new-topic1\'',
			'> Switching branch to [hello-world/new-topic1]...',
			'[command]git checkout -b hello-world/new-topic1 origin/hello-world/new-topic1',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/new-topic1',
			'[command]ls -la',
			'> Merging [origin/master] branch...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
			'[command]git config \'user.name\' test-actor',
			'[command]git config \'user.email\' \'test-actor@users.noreply.github.com\'',
			'[command]git merge --no-edit origin/master',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
			'[command]git diff \'HEAD..origin/master\' --name-only',
			'> Closing PullRequest... [hello-world/new-topic1]',
			'> Deleting reference... [refs/heads/hello-world/new-topic1]',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic1] has been closed because there is no reference diff',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
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
				if (command.includes(' rev-parse')) {
					return 'test';
				}
				return '';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Ftest-21031067')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls/11')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
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
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/test-21031067:refs/remotes/origin/hello-world/test-21031067\'',
			'::endgroup::',
			'::group::Switching branch to [hello-world/test-21031067]...',
			'[command]git checkout -b hello-world/test-21031067 origin/hello-world/test-21031067',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> test',
			'> remote branch [hello-world/test-21031067] not found.',
			'> now branch: test',
			'::endgroup::',
			'::group::Cloning [feature/new-feature] from the remote repo...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
			'[command]git checkout -b feature/new-feature origin/feature/new-feature',
			'[command]git checkout -b hello-world/test-21031067',
			'[command]ls -la',
			'::endgroup::',
			'::group::Running commands...',
			'[command]yarn upgrade',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'::endgroup::',
			'::group::Committing...',
			'[command]git commit -qm \'test: create pull request\'',
			'[command]git show \'--stat-count=10\' HEAD',
			'::endgroup::',
			'::group::Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
			'[command]git diff \'HEAD..origin/feature/new-feature\' --name-only',
			'::endgroup::',
			'::group::Closing PullRequest... [hello-world/test-21031067]',
			'::endgroup::',
			'::group::Deleting reference... [refs/heads/hello-world/test-21031067]',
			'::endgroup::',
			'> \x1b[32;40;0m✔\x1b[0m\t[feature/new-feature] has been closed because there is no reference diff',
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
			.get('/repos/hello/world/pulls/11')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
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
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/test-21031067:refs/remotes/origin/hello-world/test-21031067\'',
			'  >> stdout',
			'::endgroup::',
			'::group::Switching branch to [hello-world/test-21031067]...',
			'[command]git checkout -b hello-world/test-21031067 origin/hello-world/test-21031067',
			'  >> stdout',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> stdout',
			'> remote branch [hello-world/test-21031067] not found.',
			'> now branch: stdout',
			'::endgroup::',
			'::group::Cloning [feature/new-feature] from the remote repo...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
			'  >> stdout',
			'[command]git checkout -b feature/new-feature origin/feature/new-feature',
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
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
			'[command]git diff \'HEAD..origin/feature/new-feature\' --name-only',
			'::endgroup::',
			'::group::Closing PullRequest... [hello-world/test-21031067]',
			'::endgroup::',
			'::group::Deleting reference... [refs/heads/hello-world/test-21031067]',
			'::endgroup::',
			'> \x1b[32;40;0m✔\x1b[0m\t[feature/new-feature] has been closed because there is no reference diff',
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
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic2')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Amaster')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.close'))
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/octocat/Hello-World/git/refs/heads/hello-world/new-topic1')
			.reply(204);

		await expect(execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			prBranchName: 'test-${PR_ID}',
			checkDefaultBranch: false,
		}, 'develop'))).rejects.toThrow('There is a failed process.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'> Closing PullRequest... [hello-world/new-topic1]',
			'> Deleting reference... [refs/heads/hello-world/new-topic1]',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic1] has been closed because base PullRequest has been closed',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
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
				if (command.includes(' rev-parse')) {
					return 'hello-world/new-topic1';
				}
				return '';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc&head=hello%3Amaster')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic2')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.post('/repos/octocat/Hello-World/issues/1347/comments')
			.reply(201)
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/octocat/Hello-World/git/refs/heads/hello-world/new-topic1')
			.reply(204);

		await expect(execute(octokit, getActionContext(context('closed'), {
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-${PR_ID}',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
			prCloseMessage: 'close message',
			checkDefaultBranch: false,
		}))).rejects.toThrow('There is a failed process.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/new-topic1:refs/remotes/origin/hello-world/new-topic1\'',
			'> Switching branch to [hello-world/new-topic1]...',
			'[command]git checkout -b hello-world/new-topic1 origin/hello-world/new-topic1',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/new-topic1',
			'[command]ls -la',
			'> Merging [origin/master] branch...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'[command]git merge --no-edit origin/master',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'> Committing...',
			'[command]git commit -qm \'test: create pull request\'',
			'[command]git show \'--stat-count=10\' HEAD',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
			'[command]git diff \'HEAD..origin/master\' --name-only',
			'> Closing PullRequest... [hello-world/new-topic1]',
			'> Deleting reference... [refs/heads/hello-world/new-topic1]',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic1] has been closed because there is no reference diff',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
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
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic2')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Amaster')
			.reply(200, () => [])
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.delete('/repos/octocat/Hello-World/git/refs/heads/hello-world/new-topic1')
			.reply(204);

		await expect(execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			prBranchName: 'test-${PR_ID}',
			checkDefaultBranch: false,
		}, 'develop'))).rejects.toThrow('There is a failed process.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'> Closing PullRequest... [hello-world/new-topic1]',
			'> Deleting reference... [refs/heads/hello-world/new-topic1]',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic1] has been closed because base PullRequest does not exist',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
			'::endgroup::',
		]);
	});

	it('should do nothing (action pull request not found)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic1')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic2')
			.reply(200, () => []);

		await expect(execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			prBranchName: 'test-${PR_ID}',
			checkDefaultBranch: false,
		}))).rejects.toThrow('There are failed processes.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Total:2  Succeeded:0  Failed:2  Skipped:0',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic1] not found',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
			'::endgroup::',
		]);
	});

	it('should do nothing (not target branch)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list2'))
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'));

		await expect(execute(octokit, getActionContext(context('', 'schedule'), {
			targetBranchPrefix: 'test/',
		}))).rejects.toThrow('There is a failed process.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [feature/new-topic1]',
			'::endgroup::',
			'::group::Target PullRequest Ref [feature/new-topic2]',
			'::endgroup::',
			'::group::Target PullRequest Ref [master]',
			'::endgroup::',
			'::group::Total:3  Succeeded:0  Failed:1  Skipped:2',
			'> \x1b[33;40;0m→\x1b[0m\t[feature/new-topic1] This is not target branch',
			'> \x1b[33;40;0m→\x1b[0m\t[feature/new-topic2] This is not target branch',
			'> \x1b[31;40;0m×\x1b[0m\t[master] parameter [prBranchName] is required.',
			'::endgroup::',
		]);
	});

	it('should do nothing (no diff)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
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
			.reply(200, () => []);

		await execute(octokit, getActionContext(context('synchronize'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			prBranchName: 'test-${PR_ID}',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/test-21031067:refs/remotes/origin/hello-world/test-21031067\'',
			'  >> stdout',
			'::endgroup::',
			'::group::Switching branch to [hello-world/test-21031067]...',
			'[command]git checkout -b hello-world/test-21031067 origin/hello-world/test-21031067',
			'  >> stdout',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> stdout',
			'> remote branch [hello-world/test-21031067] not found.',
			'> now branch: stdout',
			'::endgroup::',
			'::group::Cloning [feature/new-feature] from the remote repo...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
			'  >> stdout',
			'[command]git checkout -b feature/new-feature origin/feature/new-feature',
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
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
			'[command]git diff \'HEAD..origin/feature/new-feature\' --name-only',
			'::endgroup::',
			'> \x1b[33;40;0m✔\x1b[0m\t[feature/new-feature] There is no diff',
		]);
	});

	it('should do nothing (no diff (push)))', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' rev-parse')) {
					return 'test/change';
				}
				return '';
			},
		});
		setExists(true);

		await execute(octokit, getActionContext(context('', 'push', 'refs/heads/test/change'), {
			targetBranchPrefix: 'test/',
			executeCommands: ['yarn upgrade'],
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/test/change:refs/remotes/origin/test/change\'',
			'::endgroup::',
			'::group::Switching branch to [test/change]...',
			'[command]git checkout -b test/change origin/test/change',
			'[command]git rev-parse --abbrev-ref HEAD',
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
			'> \x1b[33;40;0m✔\x1b[0m\t[test/change] There is no diff',
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
				if (command.includes(' rev-parse')) {
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

		await execute(octokit, getActionContext(context('', 'push', 'refs/heads/test/change'), {
			targetBranchPrefix: 'test/',
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/test/change:refs/remotes/origin/test/change\'',
			'::endgroup::',
			'::group::Switching branch to [test/change]...',
			'[command]git checkout -b test/change origin/test/change',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> test/change',
			'[command]ls -la',
			'::endgroup::',
			'::group::Running commands...',
			'[command]yarn upgrade',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
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
			'> \x1b[31;40;0m×\x1b[0m\t[test/change] Branch is protected',
		]);
	});
});

describe('autoMerge', () => {
	disableNetConnect(nock);
	testEnv();
	testChildProcess();

	it('should return false 1', async() => {
		expect(await autoMerge({
			'created_at': '',
			number: 1347,
		}, new Logger(), octokit, getActionContext(context('synchronize')))).toBe(false);
	});

	it('should return false 2', async() => {
		expect(await autoMerge({
			'created_at': moment().subtract(10, 'days').toISOString(),
			number: 1347,
		}, new Logger(), octokit, getActionContext(context('synchronize'), {
			autoMergeThresholdDays: '10',
		}))).toBe(false);
	});

	it('should return false 3', async() => {
		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.false'));

		expect(await autoMerge({
			'created_at': moment().subtract(11, 'days').toISOString(),
			number: 1347,
		}, new Logger(), octokit, getActionContext(context('synchronize'), {
			autoMergeThresholdDays: '10',
		}))).toBe(false);
	});

	it('should return false 4', async() => {
		const mockStdout = spyOnStdout();
		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
			.put('/repos/hello/world/pulls/1347/merge')
			.reply(405, {
				'message': 'Pull Request is not mergeable',
				'documentation_url': 'https://developer.github.com/v3/pulls/#merge-a-pull-request-merge-button',
			});

		expect(await autoMerge({
			'created_at': moment().subtract(11, 'days').toISOString(),
			number: 1347,
		}, new Logger(), octokit, getActionContext(context('synchronize'), {
			autoMergeThresholdDays: '10',
		}))).toBe(false);

		stdoutCalledWith(mockStdout, [
			'::warning::Pull Request is not mergeable',
		]);
	});

	it('should return true', async() => {
		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
			.put('/repos/hello/world/pulls/1347/merge')
			.reply(200, {
				'sha': '6dcb09b5b57875f334f61aebed695e2e4193db5e',
				'merged': true,
				'message': 'Pull Request successfully merged',
			});

		expect(await autoMerge({
			'created_at': moment().subtract(11, 'days').toISOString(),
			number: 1347,
		}, new Logger(), octokit, getActionContext(context('synchronize'), {
			autoMergeThresholdDays: '10',
		}))).toBe(true);
	});
});
