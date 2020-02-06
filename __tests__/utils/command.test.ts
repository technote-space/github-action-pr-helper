/* eslint-disable no-magic-numbers */
import { Context } from '@actions/github/lib/context';
import nock from 'nock';
import { resolve } from 'path';
import { Logger, GitHelper, Utils } from '@technote-space/github-action-helper';
import {
	generateContext,
	testEnv,
	spyOnExec,
	execCalledWith,
	spyOnStdout,
	stdoutCalledWith,
	setChildProcessParams,
	testChildProcess,
	testFs,
	disableNetConnect,
	getApiFixture,
	getOctokit,
} from '@technote-space/github-action-test-helper';
import { ActionContext, ActionDetails, CommandOutput } from '../../src/types';
import {
	clone,
	checkBranch,
	getDiff,
	getChangedFiles,
	isMergeable,
	updatePr,
	resolveConflicts,
	getDefaultBranch,
	getNewPatchVersion,
} from '../../src/utils/command';
import { getCacheKey, isCached } from '../../src/utils/misc';

beforeEach(() => {
	Logger.resetForTesting();
});
const workDir                      = resolve(__dirname, 'test-dir');
const logger                       = new Logger(string => Utils.replaceAll(string, workDir, '[Working Directory]'));
const helper                       = new GitHelper(logger, {depth: -1, token: 'test-token'});
const setExists                    = testFs();
const rootDir                      = resolve(__dirname, '..', 'fixtures');
const octokit                      = getOctokit();
const context                      = (pr: object): Context => generateContext({
	owner: 'hello',
	repo: 'world',
	event: 'pull_request',
	ref: 'pull/55/merge',
}, {
	payload: {
		number: 11,
		'pull_request': Object.assign({
			number: 11,
			id: 21031067,
			head: {
				ref: 'feature/new-feature',
			},
			base: {
				ref: 'master',
			},
			title: 'title',
			'html_url': 'url',
		}, pr),
	},
});
const actionDetails: ActionDetails = {
	actionName: 'Test Action',
	actionOwner: 'octocat',
	actionRepo: 'hello-world',
};
const getActionContext             = (context: Context, _actionDetails?: object, defaultBranch?: string): ActionContext => ({
	actionContext: context,
	actionDetail: _actionDetails ? Object.assign({}, actionDetails, _actionDetails) : actionDetails,
	cache: {
		[getCacheKey('repos', {owner: context.repo.owner, repo: context.repo.repo})]: defaultBranch ?? 'master',
	},
});

describe('clone', () => {
	testEnv();
	testChildProcess();

	it('should run clone command', async() => {
		process.env.GITHUB_WORKSPACE = workDir;
		const mockExec               = spyOnExec();
		const mockStdout             = spyOnStdout();

		await clone(helper, logger, octokit, getActionContext(context({
			head: {
				ref: 'head-test',
			},
			base: {
				ref: 'base-test',
			},
		}), {
			prBranchName: 'test-branch',
		}));

		execCalledWith(mockExec, [
			'git init \'.\'',
			'git remote add origin \'https://octocat:test-token@github.com/hello/world.git\' > /dev/null 2>&1 || :',
			'git fetch origin || :',
			'git checkout -b hello-world/test-branch origin/hello-world/test-branch || :',
		]);
		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]git init \'.\'',
			'  >> stdout',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'  >> stdout',
			'::endgroup::',
			'::group::Switching branch to [hello-world/test-branch]...',
			'[command]git checkout -b hello-world/test-branch origin/hello-world/test-branch',
			'  >> stdout',
		]);
	});
});

describe('checkBranch', () => {
	testEnv();
	testChildProcess();

	it('should do nothing', async() => {
		process.env.GITHUB_WORKSPACE = workDir;
		setChildProcessParams({stdout: 'hello-world/test-branch'});
		const mockExec = spyOnExec();
		setExists(true);

		expect(await checkBranch(helper, logger, octokit, getActionContext(context({}), {
			prBranchName: 'test-branch',
		}))).toBe(true);

		execCalledWith(mockExec, [
			'git rev-parse --abbrev-ref HEAD || :',
			'ls -la',
		]);
	});

	it('should checkout new branch', async() => {
		process.env.GITHUB_WORKSPACE = workDir;
		setChildProcessParams({stdout: 'test-branch2'});
		const mockExec = spyOnExec();
		setExists(true);

		expect(await checkBranch(helper, logger, octokit, getActionContext(context({}), {
			prBranchName: 'test-branch',
		}))).toBe(false);

		execCalledWith(mockExec, [
			'git rev-parse --abbrev-ref HEAD || :',
			'git checkout -b feature/new-feature origin/feature/new-feature || :',
			'git checkout -b hello-world/test-branch',
			'ls -la',
		]);
	});
});

describe('getDiff', () => {
	testEnv();
	testChildProcess();

	it('should get diff', async() => {
		process.env.GITHUB_WORKSPACE        = workDir;
		process.env.INPUT_FILTER_GIT_STATUS = 'M';
		process.env.INPUT_FILTER_EXTENSIONS = 'md';
		setChildProcessParams({stdout: 'M  test1.txt\nM  test2.md\nA  test3.md'});
		const mockExec = spyOnExec();

		expect(await getDiff(helper, logger)).toEqual(['test1.txt', 'test2.md', 'test3.md']);

		execCalledWith(mockExec, [
			'git add --all',
			'git status --short -uno',
		]);
	});
});

describe('getChangedFiles', () => {
	testEnv();
	testChildProcess();
	const _context = context({
		head: {
			ref: 'hello-world/test-branch',
		},
	});

	it('should get changed files 1', async() => {
		process.env.GITHUB_WORKSPACE = workDir;
		setChildProcessParams({stdout: 'M  file1\nA  file2\nD  file3\n   file4\n\nB  file5\n'});

		expect(await getChangedFiles(helper, logger, octokit, getActionContext(_context, {
			executeCommands: ['yarn upgrade'],
			prBranchName: 'test-branch',
		}))).toEqual({
			files: [
				'file1',
				'file2',
				'file3',
			],
			output: [
				{
					command: 'yarn upgrade',
					stdout: ['M  file1', 'A  file2', 'D  file3', '   file4', '', 'B  file5'],
					stderr: [],
				},
			],
		});
	});

	it('should get changed files 2', async() => {
		process.env.GITHUB_WORKSPACE      = workDir;
		process.env.INPUT_PACKAGE_MANAGER = 'yarn';
		setChildProcessParams({stdout: 'M  file1\nA  file2\nD  file3\n   file4\n\nB  file5\n'});

		expect(await getChangedFiles(helper, logger, octokit, getActionContext(_context, {
			executeCommands: ['yarn upgrade'],
			globalInstallPackages: ['npm-check-updates'],
			devInstallPackages: ['test1', 'test2'],
			installPackages: ['test3', 'test4'],
			prBranchName: 'test-branch',
		}))).toEqual({
			files: [
				'file1',
				'file2',
				'file3',
			],
			output: [
				{
					command: 'sudo yarn global add npm-check-updates',
					stdout: ['M  file1', 'A  file2', 'D  file3', '   file4', '', 'B  file5'],
					stderr: [],
				},
				{
					command: 'yarn add --dev test1 test2',
					stdout: ['M  file1', 'A  file2', 'D  file3', '   file4', '', 'B  file5'],
					stderr: [],
				},
				{
					command: 'yarn add test3 test4',
					stdout: ['M  file1', 'A  file2', 'D  file3', '   file4', '', 'B  file5'],
					stderr: [],
				},
				{
					command: 'yarn upgrade',
					stdout: ['M  file1', 'A  file2', 'D  file3', '   file4', '', 'B  file5'],
					stderr: [],
				},
			],
		});
	});

	it('should return empty 1', async() => {
		process.env.GITHUB_WORKSPACE = workDir;
		setChildProcessParams({stdout: 'test'});

		expect(await getChangedFiles(helper, logger, octokit, getActionContext(_context, {
			executeCommands: ['npm update'],
			deletePackage: true,
			globalInstallPackages: ['npm-check-updates'],
			devInstallPackages: ['test1', 'test2'],
			installPackages: ['test3', 'test4'],
			prBranchName: 'test-branch',
		}))).toEqual({
			files: [],
			output: [
				{
					command: 'rm -f package.json',
					stdout: ['test'],
					stderr: [],
				},
				{
					command: 'rm -f package-lock.json',
					stdout: ['test'],
					stderr: [],
				},
				{
					command: 'rm -f yarn.lock',
					stdout: ['test'],
					stderr: [],
				},
				{
					command: 'sudo npm install -g npm-check-updates',
					stdout: ['test'],
					stderr: [],
				},
				{
					command: 'npm install --save-dev test1 test2',
					stdout: ['test'],
					stderr: [],
				},
				{
					command: 'npm install --save test3 test4',
					stdout: ['test'],
					stderr: [],
				},
				{
					command: 'npm update',
					stdout: ['test'],
					stderr: [],
				},
			],
		});
	});

	it('should return empty 2', async() => {
		process.env.GITHUB_WORKSPACE = workDir;
		const mockStdout             = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' rev-parse')) {
					return 'hello-world/test-branch';
				}
				if (command.startsWith('git merge --no-edit')) {
					return 'Auto-merging merge.txt\nCONFLICT (content): Merge conflict in merge.txt\nAutomatic merge failed; fix conflicts and then commit the result.';
				}
				return '';
			},
		});
		setExists(true);

		expect(await getChangedFiles(helper, logger, octokit, getActionContext(_context, {
			executeCommands: ['npm update'],
			globalInstallPackages: ['npm-check-updates'],
			installPackages: ['test1', 'test2'],
			prBranchName: 'test-branch',
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
		}))).toEqual({
			files: [],
			output: [
				{
					command: 'sudo npm install -g npm-check-updates',
					stdout: [],
					stderr: [],
				},
				{
					command: 'npm install --save test1 test2',
					stdout: [],
					stderr: [],
				},
				{
					command: 'npm update',
					stdout: [],
					stderr: [],
				},
			],
		});
		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]rm -rdf [Working Directory]',
			'[command]git init \'.\'',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'::endgroup::',
			'::group::Switching branch to [hello-world/test-branch]...',
			'[command]git checkout -b hello-world/test-branch origin/hello-world/test-branch',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/test-branch',
			'[command]ls -la',
			'::endgroup::',
			'::group::Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'::endgroup::',
			'::group::Merging [hello-world/test-branch] branch...',
			'[command]git merge --no-edit origin/hello-world/test-branch || :',
			'  >> Auto-merging merge.txt',
			'  >> CONFLICT (content): Merge conflict in merge.txt',
			'  >> Automatic merge failed; fix conflicts and then commit the result.',
			'::endgroup::',
			'::group::Aborting merge...',
			'[command]git merge --abort',
			'::endgroup::',
			'::group::Running commands...',
			'[command]sudo npm install -g npm-check-updates',
			'[command]npm install --save test1 test2',
			'[command]npm update',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
		]);
	});

	it('should return empty 3', async() => {
		process.env.GITHUB_WORKSPACE  = workDir;
		process.env.GITHUB_REPOSITORY = 'hello/world';
		const mockStdout              = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' rev-parse')) {
					return 'hello-world/test-branch';
				}
				if (command.startsWith('git merge')) {
					return 'Already up to date.';
				}
				return '';
			},
		});
		setExists(true);

		expect(await getChangedFiles(helper, logger, octokit, getActionContext(_context, {
			executeCommands: ['npm update'],
			globalInstallPackages: ['npm-check-updates'],
			installPackages: ['test1', 'test2'],
			prBranchName: 'test-branch',
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
		}))).toEqual({
			files: [],
			output: [
				{
					command: 'sudo npm install -g npm-check-updates',
					stdout: [],
					stderr: [],
				},
				{
					command: 'npm install --save test1 test2',
					stdout: [],
					stderr: [],
				},
				{
					command: 'npm update',
					stdout: [],
					stderr: [],
				},
			],
		});
		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]rm -rdf [Working Directory]',
			'[command]git init \'.\'',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'::endgroup::',
			'::group::Switching branch to [hello-world/test-branch]...',
			'[command]git checkout -b hello-world/test-branch origin/hello-world/test-branch',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/test-branch',
			'[command]ls -la',
			'::endgroup::',
			'::group::Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'::endgroup::',
			'::group::Merging [hello-world/test-branch] branch...',
			'[command]git merge --no-edit origin/hello-world/test-branch || :',
			'  >> Already up to date.',
			'::endgroup::',
			'::group::Running commands...',
			'[command]sudo npm install -g npm-check-updates',
			'[command]npm install --save test1 test2',
			'[command]npm update',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
		]);
	});

	it('should run task', async() => {
		process.env.GITHUB_WORKSPACE  = workDir;
		process.env.GITHUB_REPOSITORY = 'hello/world';
		const mockStdout              = spyOnStdout();
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.includes(' rev-parse')) {
					return 'hello-world/test-branch';
				}
				if (command.startsWith('git merge')) {
					return 'Already up to date.';
				}
				return '';
			},
		});
		setExists(true);

		expect(await getChangedFiles(helper, logger, octokit, getActionContext(_context, {
			executeCommands: [
				'string command1',
				(): CommandOutput => {
					logger.debug('test task1-1');
					logger.debug('test task1-2');
					return {
						command: 'test task1',
						stdout: ['stdout1', 'stdout2'],
						stderr: ['stderr1', 'stderr2'],
					};
				},
				'string command2',
				(): CommandOutput => {
					logger.debug('test task2-1');
					logger.debug('test task2-2');
					return {
						command: 'test task2',
						stdout: [],
						stderr: [],
					};
				},
			],
			globalInstallPackages: ['npm-check-updates'],
			installPackages: ['test1', 'test2'],
			prBranchName: 'test-branch',
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
		}))).toEqual({
			files: [],
			output: [
				{
					command: 'sudo npm install -g npm-check-updates',
					stdout: [],
					stderr: [],
				},
				{
					command: 'npm install --save test1 test2',
					stdout: [],
					stderr: [],
				},
				{
					command: 'string command1',
					stdout: [],
					stderr: [],
				},
				{
					command: 'test task1',
					stdout: ['stdout1', 'stdout2'],
					stderr: ['stderr1', 'stderr2'],
				},
				{
					command: 'string command2',
					stdout: [],
					stderr: [],
				},
				{
					command: 'test task2',
					stdout: [],
					stderr: [],
				},
			],
		});
		stdoutCalledWith(mockStdout, [
			'::group::Fetching...',
			'[command]rm -rdf [Working Directory]',
			'[command]git init \'.\'',
			'[command]git remote add origin',
			'[command]git fetch origin',
			'::endgroup::',
			'::group::Switching branch to [hello-world/test-branch]...',
			'[command]git checkout -b hello-world/test-branch origin/hello-world/test-branch',
			'[command]git rev-parse --abbrev-ref HEAD',
			'  >> hello-world/test-branch',
			'[command]ls -la',
			'::endgroup::',
			'::group::Configuring git committer to be GitHub Actions <example@example.com>',
			'[command]git config \'user.name\' \'GitHub Actions\'',
			'[command]git config \'user.email\' \'example@example.com\'',
			'::endgroup::',
			'::group::Merging [hello-world/test-branch] branch...',
			'[command]git merge --no-edit origin/hello-world/test-branch || :',
			'  >> Already up to date.',
			'::endgroup::',
			'::group::Running commands...',
			'[command]sudo npm install -g npm-check-updates',
			'[command]npm install --save test1 test2',
			'[command]string command1',
			'::debug::test task1-1',
			'::debug::test task1-2',
			'[command]test task1',
			'  >> stdout1',
			'  >> stdout2',
			'::warning::  >> stderr1',
			'::warning::  >> stderr2',
			'[command]string command2',
			'::debug::test task2-1',
			'::debug::test task2-2',
			'[command]test task2',
			'::endgroup::',
			'::group::Checking diff...',
			'[command]git add --all',
			'[command]git status --short -uno',
		]);
	});
});

describe('isMergeable', () => {
	disableNetConnect(nock);

	it('should use cache', async() => {
		const fn            = jest.fn();
		const actionContext = getActionContext(context({}));
		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls/1347')
			.reply(200, () => {
				fn();
				return getApiFixture(rootDir, 'pulls.get.mergeable.true');
			});

		expect(await isMergeable(1347, octokit, actionContext)).toBe(true);
		expect(fn).toBeCalledTimes(1);
		expect(await isMergeable(1347, octokit, actionContext)).toBe(true);
		expect(fn).toBeCalledTimes(1);
	});
});

describe('updatePr', () => {
	disableNetConnect(nock);
	testEnv();

	it('should return true 1', async() => {
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Atest')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.post('/repos/hello/world/issues/1347/comments')
			.reply(201, () => getApiFixture(rootDir, 'issues.comment.create'))
			.get('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

		expect(await updatePr('test', [], [], helper, logger, octokit, getActionContext(context({}), {
			prTitle: 'test title',
			prBody: 'test body',
		}))).toBe(true);
	});

	it('should return true 2', async() => {
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Atest')
			.reply(200, () => [])
			.get('/repos/hello/world/pulls/11')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
			.post('/repos/hello/world/pulls')
			.reply(201, () => getApiFixture(rootDir, 'pulls.create'));

		expect(await updatePr('test', [], [], helper, logger, octokit, getActionContext(context({}), {
			prTitle: 'test title',
			prBody: 'test body',
		}))).toBe(true);
	});

	it('should return false', async() => {
		process.env.INPUT_API_TOKEN = 'test-token';
		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Atest')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.post('/repos/hello/world/issues/1347/comments')
			.reply(201, () => getApiFixture(rootDir, 'issues.comment.create'))
			.get('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.false'));

		expect(await updatePr('test', [], [], helper, logger, octokit, getActionContext(context({}), {
			prTitle: 'test title',
			prBody: 'test body',
		}))).toBe(false);
	});

	it('should run push to trigger workflow', async() => {
		process.env.INPUT_API_TOKEN = 'test-token';
		const mockStdout            = spyOnStdout();
		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Atest')
			.reply(200, () => [])
			.get('/repos/hello/world/pulls/11')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
			.post('/repos/hello/world/pulls')
			.reply(201, () => getApiFixture(rootDir, 'pulls.create'));

		expect(await updatePr('test', [], [], helper, logger, octokit, getActionContext(context({}), {
			prTitle: 'test title',
			prBody: 'test body',
		}))).toBe(true);

		stdoutCalledWith(mockStdout, [
			'::group::Creating PullRequest...',
			'[command]git commit --allow-empty -qm \'chore: trigger workflow\'',
			'  >> stdout',
			'::endgroup::',
			'::group::Pushing to hello/world@test...',
			'[command]git push origin test:refs/heads/test',
		]);
	});
});

describe('resolveConflicts', () => {
	disableNetConnect(nock);
	testEnv();
	testChildProcess();

	it('should merge', async() => {
		process.env.GITHUB_WORKSPACE = workDir;
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.startsWith('git merge')) {
					return 'Already up to date.';
				}
				return '';
			},
		});
		const mockExec = spyOnExec();

		await resolveConflicts('test', helper, logger, octokit, getActionContext(context({}), {
			prBranchName: 'test-branch',
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
		}));

		execCalledWith(mockExec, [
			'git config \'user.name\' \'GitHub Actions\'',
			'git config \'user.email\' \'example@example.com\'',
			'git merge --no-edit origin/feature/new-feature || :',
			'git push \'https://octocat:test-token@github.com/hello/world.git\' \'test:refs/heads/test\' > /dev/null 2>&1',
		]);
	});

	it('should close pull request', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.startsWith('git merge')) {
					return 'Auto-merging merge.txt\nCONFLICT (content): Merge conflict in merge.txt\nAutomatic merge failed; fix conflicts and then commit the result.';
				}
				return '';
			},
		});
		const mockExec = spyOnExec();
		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Atest')
			.reply(200, () => []);

		await resolveConflicts('test', helper, logger, octokit, getActionContext(context({}), {
			prBranchName: 'test-branch',
			executeCommands: ['yarn upgrade'],
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
		}));

		execCalledWith(mockExec, [
			'git config \'user.name\' \'GitHub Actions\'',
			'git config \'user.email\' \'example@example.com\'',
			'git merge --no-edit origin/feature/new-feature || :',
			'git init \'.\'',
			'git remote add origin \'https://octocat:test-token@github.com/hello/world.git\' > /dev/null 2>&1 || :',
			'git clone \'--branch=feature/new-feature\' \'https://octocat:test-token@github.com/hello/world.git\' \'.\' > /dev/null 2>&1 || :',
			'git checkout -b hello-world/test-branch',
			'yarn upgrade',
			'git add --all',
			'git status --short -uno',
		]);
	});

	it('should rebase', async() => {
		process.env.GITHUB_WORKSPACE   = workDir;
		process.env.INPUT_GITHUB_TOKEN = 'test-token';
		setChildProcessParams({
			stdout: (command: string): string => {
				if (command.startsWith('git merge')) {
					return 'Auto-merging merge.txt\nCONFLICT (content): Merge conflict in merge.txt\nAutomatic merge failed; fix conflicts and then commit the result.';
				}
				if (command.endsWith('status --short -uno')) {
					return 'M  __tests__/fixtures/test.md';
				}
				return '';
			},
		});
		const mockExec = spyOnExec();
		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world/pulls?head=hello%3Atest')
			.reply(200, () => getApiFixture(rootDir, 'pulls.list'))
			.get('/repos/hello/world/pulls/11')
			.reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
			.patch('/repos/hello/world/pulls/1347')
			.reply(200, () => getApiFixture(rootDir, 'pulls.update'));

		await resolveConflicts('test', helper, logger, octokit, getActionContext(context({}), {
			prBranchName: 'test-branch',
			executeCommands: ['yarn upgrade'],
			commitMessage: 'commit message',
			prTitle: 'pr title',
			prBody: 'pr body',
			commitName: 'GitHub Actions',
			commitEmail: 'example@example.com',
		}));

		execCalledWith(mockExec, [
			'git config \'user.name\' \'GitHub Actions\'',
			'git config \'user.email\' \'example@example.com\'',
			'git merge --no-edit origin/feature/new-feature || :',
			'git init \'.\'',
			'git remote add origin \'https://octocat:test-token@github.com/hello/world.git\' > /dev/null 2>&1 || :',
			'git clone \'--branch=feature/new-feature\' \'https://octocat:test-token@github.com/hello/world.git\' \'.\' > /dev/null 2>&1 || :',
			'git checkout -b hello-world/test-branch',
			'yarn upgrade',
			'git add --all',
			'git status --short -uno',
			'git config \'user.name\' \'GitHub Actions\'',
			'git config \'user.email\' \'example@example.com\'',
			'git commit -qm \'commit message\'',
			'git show \'--stat-count=10\' HEAD',
			'git push --force \'https://octocat:test-token@github.com/hello/world.git\' \'test:refs/heads/test\' > /dev/null 2>&1',
		]);
	});
});

describe('getDefaultBranch', () => {
	it('should get default branch', async() => {
		nock('https://api.github.com')
			.persist()
			.get('/repos/hello/world')
			.reply(200, () => getApiFixture(rootDir, 'repos.get'));

		expect(await getDefaultBranch(octokit, getActionContext(context({})))).toBe('master');
	});
});

describe('getNewPatchVersion', () => {
	testChildProcess();

	it('should get new patch version', async() => {
		setChildProcessParams({stdout: '1.2.3'});
		setExists(true);
		const actionContext = getActionContext(context({}));
		expect(isCached(getCacheKey('new-patch-version'), actionContext)).toBe(false);

		expect(await getNewPatchVersion(helper, actionContext)).toBe('v1.2.4');

		expect(isCached(getCacheKey('new-patch-version'), actionContext)).toBe(true);
	});

	it('should get new patch version from cache', async() => {
		setChildProcessParams({stdout: '1.2.3'});
		setExists(true);
		const actionContext = Object.assign({}, getActionContext(context({})), {newPatchVersion: 'v1.2.5'});
		expect(actionContext.newPatchVersion).toBe('v1.2.5');

		await getNewPatchVersion(helper, actionContext);

		expect(actionContext.newPatchVersion).toBe('v1.2.5');
	});
});
