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
	getLogStdout,
} from '@technote-space/github-action-test-helper';
import { ActionContext, ActionDetails } from '../../src/types';
import { execute } from '../../src/utils/process';
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
const getActionContext             = (context: Context, _actionDetails?: object, branch?: string): ActionContext => ({
	actionContext: context,
	actionDetail: _actionDetails ? Object.assign({}, actionDetails, _actionDetails) : actionDetails,
	cache: {
		[getCacheKey('repos', {owner: context.repo.owner, repo: context.repo.repo})]: branch ?? 'master',
	},
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

	it('should create pull request', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
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
				if (command.includes(' rev-parse')) {
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
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/test-21031067:refs/remotes/origin/hello-world/test-21031067\'',
			'[command]git reset --hard',
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
			'::group::Pushing to hello/world@hello-world/test-21031067...',
			'[command]git push origin hello-world/test-21031067:refs/heads/hello-world/test-21031067',
			'::endgroup::',
			'::group::Creating comment to PullRequest...',
			'::set-output name=result::succeeded',
			'::endgroup::',
			'> \x1b[32;40;0m✔\x1b[0m\t[feature/new-feature] updated',
		]);
	});

	it('should skip', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' diff ')) {
					return '__tests__/fixtures/test.md';
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
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Ftest-21031067')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
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
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/test-21031067:refs/remotes/origin/hello-world/test-21031067\'',
			'[command]git reset --hard',
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
			'> There is no diff.',
			'::endgroup::',
			'::group::Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
			'[command]git diff \'HEAD..origin/feature/new-feature\' --name-only',
			'::set-output name=result::not changed',
			'::endgroup::',
			'> \x1b[33;40;0m✔\x1b[0m\t[feature/new-feature] There is no diff',
		]);
	});

	it('should skip (close event, no diff))', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' diff ')) {
					return '__tests__/fixtures/test.md';
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
			.get('/repos/hello/world/pulls?sort=created&direction=asc&head=hello%3Amaster')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Atest%2Ftest-1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Atest%2Ftest-2')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'));

		await execute(octokit, getActionContext(context('closed'), {
			prBranchPrefix: 'test/',
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
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/test/test-1:refs/remotes/origin/test/test-1\'',
			'[command]git reset --hard',
			'> Switching branch to [test/test-1]...',
			'[command]git checkout -b test/test-1 origin/test/test-1',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> test',
			'> remote branch [test/test-1] not found.',
			'> now branch: test',
			'> Cloning [hello-world/new-topic1] from the remote repo...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/new-topic1:refs/remotes/origin/hello-world/new-topic1\'',
			'[command]git checkout -b hello-world/new-topic1 origin/hello-world/new-topic1',
			'[command]git checkout -b test/test-1',
			'[command]ls -la',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/hello-world/new-topic1:refs/remotes/origin/hello-world/new-topic1',
			'[command]git diff \'HEAD..origin/hello-world/new-topic1\' --name-only',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/test/test-2:refs/remotes/origin/test/test-2\'',
			'[command]git reset --hard',
			'> Switching branch to [test/test-2]...',
			'[command]git checkout -b test/test-2 origin/test/test-2',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> test',
			'> remote branch [test/test-2] not found.',
			'> now branch: test',
			'> Cloning [hello-world/new-topic2] from the remote repo...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/new-topic2:refs/remotes/origin/hello-world/new-topic2\'',
			'[command]git checkout -b hello-world/new-topic2 origin/hello-world/new-topic2',
			'[command]git checkout -b test/test-2',
			'[command]ls -la',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/hello-world/new-topic2:refs/remotes/origin/hello-world/new-topic2',
			'[command]git diff \'HEAD..origin/hello-world/new-topic2\' --name-only',
			'::endgroup::',
			'::group::Total:2  Succeeded:0  Failed:0  Skipped:2',
			'> \x1b[33;40;0m✔\x1b[0m\t[hello-world/new-topic1] This is close event',
			'> \x1b[33;40;0m✔\x1b[0m\t[hello-world/new-topic2] This is close event',
			'::endgroup::',
		]);
	});

	it('should skip (close event, diff)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
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
			.get('/repos/hello/world/pulls?sort=created&direction=asc&head=hello%3Amaster')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'));

		await execute(octokit, getActionContext(context('closed'), {
			prBranchPrefix: 'test/',
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-branch',
			prCloseMessage: 'close message',
			checkDefaultBranch: false,
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/test/test-branch:refs/remotes/origin/test/test-branch\'',
			'[command]git reset --hard',
			'> Switching branch to [test/test-branch]...',
			'[command]git checkout -b test/test-branch origin/test/test-branch',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> test',
			'> remote branch [test/test-branch] not found.',
			'> now branch: test',
			'> Cloning [hello-world/new-topic1] from the remote repo...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/new-topic1:refs/remotes/origin/hello-world/new-topic1\'',
			'[command]git checkout -b hello-world/new-topic1 origin/hello-world/new-topic1',
			'[command]git checkout -b test/test-branch',
			'[command]ls -la',
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
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/hello-world/new-topic1:refs/remotes/origin/hello-world/new-topic1',
			'[command]git diff \'HEAD..origin/hello-world/new-topic1\' --name-only',
			'::endgroup::',
			'::group::Total:2  Succeeded:0  Failed:0  Skipped:2',
			'> \x1b[33;40;0m✔\x1b[0m\t[hello-world/new-topic1] This is close event',
			'> \x1b[33;40;0m→\x1b[0m\t[hello-world/new-topic2] duplicated (test/test-branch)',
			'::endgroup::',
		]);
	});

	it('should skip (action pull request)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
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
			.get('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
			.post('/repos/octocat/Hello-World/issues/1347/comments')
			.reply(201);

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
			'[command]git reset --hard',
			'> Switching branch to [hello-world/new-topic1]...',
			'[command]git checkout -b hello-world/new-topic1 origin/hello-world/new-topic1',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/new-topic1',
			'[command]git merge --no-edit origin/hello-world/new-topic1',
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
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Total:2  Succeeded:0  Failed:1  Skipped:1',
			'> \x1b[33;40;0m✔\x1b[0m\t[hello-world/new-topic1] This is close event',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
			'::endgroup::',
		]);
	});

	it('should create commit', async() => {
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

		await execute(octokit, getActionContext(context('', 'push', 'refs/heads/test'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create test commit',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/test:refs/remotes/origin/test\'',
			'[command]git reset --hard',
			'::endgroup::',
			'::group::Switching branch to [test]...',
			'[command]git checkout -b test origin/test',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> test',
			'[command]git merge --no-edit origin/test',
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
			'[command]git commit -qm \'test: create test commit\'',
			'[command]git show \'--stat-count=10\' HEAD',
			'::endgroup::',
			'::group::Pushing to hello/world@test...',
			'[command]git push origin test:refs/heads/test',
			'::set-output name=result::succeeded',
			'::endgroup::',
			'> \x1b[32;40;0m✔\x1b[0m\t[test] updated',
		]);
	});

	it('should create commit (action pull request)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
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
			.get('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
			.post('/repos/octocat/Hello-World/issues/1347/comments')
			.reply(201);

		await expect(execute(octokit, getActionContext(context('', 'schedule'), {
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
			'[command]git reset --hard',
			'> Switching branch to [hello-world/new-topic1]...',
			'[command]git checkout -b hello-world/new-topic1 origin/hello-world/new-topic1',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/new-topic1',
			'[command]git merge --no-edit origin/hello-world/new-topic1',
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
			'> Pushing to octocat/Hello-World@hello-world/new-topic1...',
			'[command]git push origin hello-world/new-topic1:refs/heads/hello-world/new-topic1',
			'> Creating comment to PullRequest...',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic1] updated',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
			'::endgroup::',
		]);
	});

	it('should do schedule', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
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
				if (command.includes(' rev-parse')) {
					return 'test';
				}
				return '';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list2'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Ftest-branch')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.patch('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'))
			.get('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
			.post('/repos/octocat/Hello-World/issues/1347/comments')
			.reply(201);

		await execute(octokit, getActionContext(context('', 'schedule'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-branch',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
			targetBranchPrefix: 'feature/',
			checkDefaultBranch: false,
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [feature/new-topic1]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/test-branch:refs/remotes/origin/hello-world/test-branch\'',
			'[command]git reset --hard',
			'> Switching branch to [hello-world/test-branch]...',
			'[command]git checkout -b hello-world/test-branch origin/hello-world/test-branch',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> test',
			'> remote branch [hello-world/test-branch] not found.',
			'> now branch: test',
			'> Cloning [feature/new-topic1] from the remote repo...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/feature/new-topic1:refs/remotes/origin/feature/new-topic1\'',
			'[command]git checkout -b feature/new-topic1 origin/feature/new-topic1',
			'[command]git checkout -b hello-world/test-branch',
			'[command]ls -la',
			'> Running commands...',
			'[command]yarn upgrade',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'> Committing...',
			'[command]git commit -qm \'test: create pull request\'',
			'[command]git show \'--stat-count=10\' HEAD',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/feature/new-topic1:refs/remotes/origin/feature/new-topic1',
			'[command]git diff \'HEAD..origin/feature/new-topic1\' --name-only',
			'> Pushing to octocat/Hello-World@hello-world/test-branch...',
			'[command]git push origin hello-world/test-branch:refs/heads/hello-world/test-branch',
			'> Creating comment to PullRequest...',
			'::endgroup::',
			'::group::Total:2  Succeeded:1  Failed:0  Skipped:1',
			'> \x1b[32;40;0m✔\x1b[0m\t[feature/new-topic1] updated',
			'> \x1b[33;40;0m→\x1b[0m\t[feature/new-topic2] duplicated (hello-world/test-branch)',
			'::endgroup::',
		]);
	});

	it('should do schedule (action base pull request has not been closed)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' rev-parse')) {
					return 'hello-world/new-topic1';
				}
				return 'stdout';
			},
		});
		setExists(true);

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
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Ftest-1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

		await expect(execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			prBranchName: 'test-${PR_ID}',
			checkDefaultBranch: false,
		}, 'develop'))).rejects.toThrow('There is a failed process.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/new-topic1:refs/remotes/origin/hello-world/new-topic1\'',
			'  >> stdout',
			'[command]git reset --hard',
			'  >> stdout',
			'> Switching branch to [hello-world/new-topic1]...',
			'[command]git checkout -b hello-world/new-topic1 origin/hello-world/new-topic1',
			'  >> stdout',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/new-topic1',
			'[command]git merge --no-edit origin/hello-world/new-topic1',
			'  >> stdout',
			'[command]ls -la',
			'  >> stdout',
			'> Merging [origin/master] branch...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
			'  >> stdout',
			'[command]git config \'user.name\' test-actor',
			'  >> stdout',
			'[command]git config \'user.email\' \'test-actor@users.noreply.github.com\'',
			'  >> stdout',
			'[command]git merge --no-edit origin/master',
			'  >> stdout',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'  >> stdout',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
			'[command]git diff \'HEAD..origin/master\' --name-only',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Total:2  Succeeded:0  Failed:1  Skipped:1',
			'> \x1b[33;40;0m✔\x1b[0m\t[hello-world/new-topic1] There is no diff',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
			'::endgroup::',
		]);
	});

	it('should do schedule (action base pull request is default branch)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' rev-parse')) {
					return 'hello-world/new-topic1';
				}
				return 'stdout';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic2')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Ftest-1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

		await expect(execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			prBranchName: 'test-${PR_ID}',
			checkDefaultBranch: false,
		}))).rejects.toThrow('There is a failed process.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/new-topic1:refs/remotes/origin/hello-world/new-topic1\'',
			'  >> stdout',
			'[command]git reset --hard',
			'  >> stdout',
			'> Switching branch to [hello-world/new-topic1]...',
			'[command]git checkout -b hello-world/new-topic1 origin/hello-world/new-topic1',
			'  >> stdout',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/new-topic1',
			'[command]git merge --no-edit origin/hello-world/new-topic1',
			'  >> stdout',
			'[command]ls -la',
			'  >> stdout',
			'> Merging [origin/master] branch...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
			'  >> stdout',
			'[command]git config \'user.name\' test-actor',
			'  >> stdout',
			'[command]git config \'user.email\' \'test-actor@users.noreply.github.com\'',
			'  >> stdout',
			'[command]git merge --no-edit origin/master',
			'  >> stdout',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'  >> stdout',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
			'[command]git diff \'HEAD..origin/master\' --name-only',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Total:2  Succeeded:0  Failed:1  Skipped:1',
			'> \x1b[33;40;0m✔\x1b[0m\t[hello-world/new-topic1] There is no diff',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
			'::endgroup::',
		]);
	});

	it('should process default branch', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
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
				if (command.includes(' rev-parse')) {
					return 'test';
				}
				return '';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
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
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/test-0:refs/remotes/origin/hello-world/test-0\'',
			'[command]git reset --hard',
			'> Switching branch to [hello-world/test-0]...',
			'[command]git checkout -b hello-world/test-0 origin/hello-world/test-0',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> test',
			'> remote branch [hello-world/test-0] not found.',
			'> now branch: test',
			'> Cloning [master] from the remote repo...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
			'[command]git checkout -b master origin/master',
			'[command]git checkout -b hello-world/test-0',
			'[command]ls -la',
			'> Running commands...',
			'[command]yarn upgrade',
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
			'> Pushing to hello/world@hello-world/test-0...',
			'[command]git push origin hello-world/test-0:refs/heads/hello-world/test-0',
			'> Creating comment to PullRequest...',
			'::endgroup::',
			'::group::Total:1  Succeeded:1  Failed:0  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[master] updated',
			'::endgroup::',
		]);
	});

	it('should do fail', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					throw new Error('test error');
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
			.get('/repos/hello/world')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list2'))
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'));

		await expect(execute(octokit, getActionContext(context('', 'schedule'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-branch',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
		}))).rejects.toThrow('There is a failed process.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [feature/new-topic1]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/test-branch:refs/remotes/origin/hello-world/test-branch\'',
			'[command]git reset --hard',
			'> Switching branch to [hello-world/test-branch]...',
			'[command]git checkout -b hello-world/test-branch origin/hello-world/test-branch',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> test',
			'> remote branch [hello-world/test-branch] not found.',
			'> now branch: test',
			'> Cloning [feature/new-topic1] from the remote repo...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/feature/new-topic1:refs/remotes/origin/feature/new-topic1\'',
			'[command]git checkout -b feature/new-topic1 origin/feature/new-topic1',
			'[command]git checkout -b hello-world/test-branch',
			'[command]ls -la',
			'> Running commands...',
			'[command]yarn upgrade',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'undefined',
			'{}',
			'::endgroup::',
			'::group::Total:3  Succeeded:0  Failed:1  Skipped:2',
			'> \x1b[31;40;0m×\x1b[0m\t[feature/new-topic1] command [git status] exited with code undefined. message: test error',
			'> \x1b[33;40;0m→\x1b[0m\t[feature/new-topic2] duplicated (hello-world/test-branch)',
			'> \x1b[33;40;0m→\x1b[0m\t[master] duplicated (hello-world/test-branch)',
			'::endgroup::',
		]);
	});

	it('should do fail (closed action)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.GITHUB_REPOSITORY  = 'hello/world';
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.endsWith('status --short -uno')) {
					throw new Error('test error');
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
			.reply(200, () => getApiFixture(rootDir, 'repos.get'));

		await expect(execute(octokit, getActionContext(context('closed'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			prBranchName: 'test-${PR_ID}',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
		}))).rejects.toThrow('There are failed processes.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/new-topic1:refs/remotes/origin/hello-world/new-topic1\'',
			'[command]git reset --hard',
			'> Switching branch to [hello-world/new-topic1]...',
			'[command]git checkout -b hello-world/new-topic1 origin/hello-world/new-topic1',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/new-topic1',
			'[command]git merge --no-edit origin/hello-world/new-topic1',
			'[command]ls -la',
			'> Merging [origin/master] branch...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'[command]git merge --no-edit origin/master',
			'> Running commands...',
			'[command]yarn upgrade',
			'> Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
			'undefined',
			'{}',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Target PullRequest Ref [master]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/test-0:refs/remotes/origin/hello-world/test-0\'',
			'[command]git reset --hard',
			'> Switching branch to [hello-world/test-0]...',
			'[command]git checkout -b hello-world/test-0 origin/hello-world/test-0',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/new-topic1',
			'> remote branch [hello-world/test-0] not found.',
			'> now branch: hello-world/new-topic1',
			'> Cloning [master] from the remote repo...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
			'[command]git checkout -b master origin/master',
			'[command]git checkout -b hello-world/test-0',
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
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic1] command [git status] exited with code undefined. message: test error',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
			'> \x1b[31;40;0m×\x1b[0m\t[master] command [git status] exited with code undefined. message: test error',
			'::endgroup::',
		]);
	});

	it('should resolve conflicts', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
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
				if (command.includes(' rev-parse')) {
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
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/test-21031067:refs/remotes/origin/hello-world/test-21031067\'',
			'[command]git reset --hard',
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
			'> There is no diff.',
			'::endgroup::',
			'::group::Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
			'[command]git diff \'HEAD..origin/feature/new-feature\' --name-only',
			'::endgroup::',
			'::group::Merging [origin/feature/new-feature] branch...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'[command]git merge --no-edit origin/feature/new-feature',
			'  >> Already up to date.',
			'::endgroup::',
			'::group::Pushing to hello/world@hello-world/test-21031067...',
			'[command]git push origin hello-world/test-21031067:refs/heads/hello-world/test-21031067',
			'::set-output name=result::succeeded',
			'::endgroup::',
			'> \x1b[32;40;0m✔\x1b[0m\t[feature/new-feature] updated',
		]);
	});

	it('should throw error if push branch not found', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({stdout: ''});

		await expect(execute(octokit, getActionContext(context('', 'push', 'refs/heads/test/change'), {
			executeCommands: ['yarn upgrade'],
			targetBranchPrefix: 'test/',
		}))).rejects.toThrow('remote branch [test/change] not found.');

		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]git init \'.\'',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/test/change:refs/remotes/origin/test/change\'',
			'[command]git reset --hard',
			'::endgroup::',
			'::group::Switching branch to [test/change]...',
			'[command]git checkout -b test/change origin/test/change',
		]);
	});

	it('should throw error if push failed', async() => {
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
					throw new Error('unexpected error');
				}
				return '';
			},
		});
		setExists(true);

		await expect(execute(octokit, getActionContext(context('', 'push', 'refs/heads/test/change'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			targetBranchPrefix: 'test/',
		}))).rejects.toThrow('command [git push origin test/change:refs/heads/test/change] exited with code undefined.');

		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/test/change:refs/remotes/origin/test/change\'',
			'[command]git reset --hard',
			'::endgroup::',
			'::group::Switching branch to [test/change]...',
			'[command]git checkout -b test/change origin/test/change',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> test/change',
			'[command]git merge --no-edit origin/test/change',
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
		]);
	});

	it('should create commit', async() => {
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
				return '';
			},
		});
		setExists(true);

		await execute(octokit, getActionContext(context('', 'push', 'refs/heads/test/change'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			commitMessage: 'test: create pull request',
			targetBranchPrefix: 'test/',
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/test/change:refs/remotes/origin/test/change\'',
			'[command]git reset --hard',
			'::endgroup::',
			'::group::Switching branch to [test/change]...',
			'[command]git checkout -b test/change origin/test/change',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> test/change',
			'[command]git merge --no-edit origin/test/change',
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
			'::set-output name=result::succeeded',
			'::endgroup::',
			'> \x1b[32;40;0m✔\x1b[0m\t[test/change] updated',
		]);
	});

	it('should create pr (no diff, ref diff exists)', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Ahello-world%2Ftest-21031067')
			.reply(200, () => [])
			.get('/repos/hello/world/pulls/11')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
			.post('/repos/hello/world/pulls')
			.reply(201, () => getApiFixture(rootDir, 'pulls.create'))
			.post('/repos/hello/world/issues/1347/labels')
			.reply(200, () => getApiFixture(rootDir, 'issues.labels.create'));

		await execute(octokit, getActionContext(context('synchronize'), {
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
			prBranchName: 'test-${PR_ID}',
			prTitle: 'test: create pull request (${PR_NUMBER})',
			prBody: 'pull request body',
			labels: ['label1', 'label2'],
		}));

		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/test-21031067:refs/remotes/origin/hello-world/test-21031067\'',
			'  >> stdout',
			'[command]git reset --hard',
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
			'::group::Creating PullRequest...',
			'> Adding labels...',
			getLogStdout(['label1', 'label2']),
			'::set-output name=result::succeeded',
			'::endgroup::',
			'> \x1b[32;40;0m✔\x1b[0m\t[feature/new-feature] PullRequest created',
		]);
	});

	it('should auto merge', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		process.env.GITHUB_RUN_ID      = '123';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' rev-parse')) {
					return 'hello-world/new-topic1';
				}
				if (command.includes(' diff ')) {
					return '__tests__/fixtures/test.md';
				}
				return 'stdout';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic1')
			.reply(200, () => {
				const result            = getApiFixture(rootDir, 'pulls.list.state.open');
				result[0]['created_at'] = moment().subtract(11, 'days').toISOString();
				return result;
			})
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic2')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Ftest-1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
			.put('/repos/octocat/Hello-World/pulls/1347/merge')
			.reply(200, {
				'sha': '6dcb09b5b57875f334f61aebed695e2e4193db5e',
				'merged': true,
				'message': 'Pull Request successfully merged',
			})
			.get('/repos/octocat/Hello-World/commits/7638417db6d59f3c431d3e1f261cc637155684cd/status')
			.reply(200, () => getApiFixture(rootDir, 'status.success'))
			.get('/repos/octocat/Hello-World/actions/runs/123')
			.reply(200, () => getApiFixture(rootDir, 'actions.workflow.run'))
			.get('/repos/octocat/Hello-World/commits/7638417db6d59f3c431d3e1f261cc637155684cd/check-suites')
			.reply(200, () => getApiFixture(rootDir, 'checks.success'));

		await expect(execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			prBranchName: 'test-${PR_ID}',
			checkDefaultBranch: false,
			autoMergeThresholdDays: '10',
		}))).rejects.toThrow('There is a failed process.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/new-topic1:refs/remotes/origin/hello-world/new-topic1\'',
			'  >> stdout',
			'[command]git reset --hard',
			'  >> stdout',
			'> Switching branch to [hello-world/new-topic1]...',
			'[command]git checkout -b hello-world/new-topic1 origin/hello-world/new-topic1',
			'  >> stdout',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/new-topic1',
			'[command]git merge --no-edit origin/hello-world/new-topic1',
			'  >> stdout',
			'[command]ls -la',
			'  >> stdout',
			'> Merging [origin/master] branch...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
			'  >> stdout',
			'[command]git config \'user.name\' test-actor',
			'  >> stdout',
			'[command]git config \'user.email\' \'test-actor@users.noreply.github.com\'',
			'  >> stdout',
			'[command]git merge --no-edit origin/master',
			'  >> stdout',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'  >> stdout',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
			'[command]git diff \'HEAD..origin/master\' --name-only',
			'> Checking auto merge...',
			'> All checks are passed.',
			'> Auto merging...',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
			'> \x1b[32;40;0m✔\x1b[0m\t[hello-world/new-topic1] has been auto merged',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
			'::endgroup::',
		]);
	});

	it('should not auto merge', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		const mockStdout               = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' rev-parse')) {
					return 'hello-world/new-topic1';
				}
				if (command.includes(' diff ')) {
					return '__tests__/fixtures/test.md';
				}
				return 'stdout';
			},
		});
		setExists(true);

		nock('https://api.github.com')
			.persist()
			.get('/repos/octocat/Hello-World')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'))
			.get('/repos/hello/world/pulls?sort=created&direction=asc')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic1')
			.reply(200, () => {
				const result            = getApiFixture(rootDir, 'pulls.list.state.open');
				result[0]['created_at'] = moment().subtract(10, 'days').toISOString();
				return result;
			})
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Fnew-topic2')
			.reply(200, () => [])
			.get('/repos/octocat/Hello-World/pulls?head=octocat%3Ahello-world%2Ftest-1')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
			.get('/repos/octocat/Hello-World/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
			.put('/repos/octocat/Hello-World/pulls/1347/merge')
			.reply(200, {
				'sha': '6dcb09b5b57875f334f61aebed695e2e4193db5e',
				'merged': true,
				'message': 'Pull Request successfully merged',
			});

		await expect(execute(octokit, getActionContext(context('', 'schedule'), {
			prBranchPrefix: 'hello-world/',
			prBranchName: 'test-${PR_ID}',
			checkDefaultBranch: false,
			autoMergeThresholdDays: '10',
		}))).rejects.toThrow('There is a failed process.');

		stdoutCalledWith(mockStdout, [
			'::group::Target PullRequest Ref [hello-world/new-topic1]',
			'> Fetching...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/hello-world/new-topic1:refs/remotes/origin/hello-world/new-topic1\'',
			'  >> stdout',
			'[command]git reset --hard',
			'  >> stdout',
			'> Switching branch to [hello-world/new-topic1]...',
			'[command]git checkout -b hello-world/new-topic1 origin/hello-world/new-topic1',
			'  >> stdout',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/new-topic1',
			'[command]git merge --no-edit origin/hello-world/new-topic1',
			'  >> stdout',
			'[command]ls -la',
			'  >> stdout',
			'> Merging [origin/master] branch...',
			'[command]git remote add origin',
			'[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
			'  >> stdout',
			'[command]git config \'user.name\' test-actor',
			'  >> stdout',
			'[command]git config \'user.email\' \'test-actor@users.noreply.github.com\'',
			'  >> stdout',
			'[command]git merge --no-edit origin/master',
			'  >> stdout',
			'> Running commands...',
			'> Checking diff...',
			'[command]git add --all',
			'  >> stdout',
			'[command]git status --short -uno',
			'> There is no diff.',
			'> Checking references diff...',
			'[command]git fetch --prune --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
			'[command]git diff \'HEAD..origin/master\' --name-only',
			'> Checking auto merge...',
			'> Number of days since creation is not more than threshold.',
			'> days: 10, threshold: 10',
			'::endgroup::',
			'::group::Target PullRequest Ref [hello-world/new-topic2]',
			'::endgroup::',
			'::group::Total:2  Succeeded:0  Failed:1  Skipped:1',
			'> \x1b[33;40;0m✔\x1b[0m\t[hello-world/new-topic1] There is no diff',
			'> \x1b[31;40;0m×\x1b[0m\t[hello-world/new-topic2] not found',
			'::endgroup::',
		]);
	});
});
