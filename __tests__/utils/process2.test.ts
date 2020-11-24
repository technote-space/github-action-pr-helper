/* eslint-disable no-magic-numbers */
import {Context} from '@actions/github/lib/context';
import moment from 'moment';
import nock from 'nock';
import {resolve} from 'path';
import {Logger} from '@technote-space/github-action-log-helper';
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
import {ActionContext, ActionDetails} from '../../src/types';
import {execute} from '../../src/utils/process';
import {getCacheKey} from '../../src/utils/misc';

const workDir   = resolve(__dirname, 'test');
const rootDir   = resolve(__dirname, '..', 'fixtures');
const setExists = testFs();
beforeEach(() => {
  Logger.resetForTesting();
});

const actionDetails: ActionDetails = {
  actionName: 'Test Action',
  actionOwner: 'octocat',
  actionRepo: 'Hello-World',
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getActionContext             = (context: Context, _actionDetails?: { [key: string]: any }, branch?: string): ActionContext => ({
  actionContext: context,
  actionDetail: _actionDetails ? Object.assign({}, actionDetails, _actionDetails) : actionDetails,
  cache: {
    [getCacheKey('repos', {owner: context.repo.owner, repo: context.repo.repo})]: branch ?? 'master',
  },
});

const context = (action: string, event = 'pull_request', ref = 'refs/pull/55/merge'): Context => generateContext({
  owner: 'octocat',
  repo: 'Hello-World',
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
    process.env.GITHUB_REPOSITORY  = 'octocat/Hello-World';
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
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-21031067'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .post('/repos/octocat/Hello-World/issues/1347/comments')
      .reply(201)
      .get('/repos/octocat/Hello-World/pulls/1347')
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
      '[command]git fetch --no-tags origin \'refs/heads/Hello-World/test-21031067:refs/remotes/origin/Hello-World/test-21031067\'',
      '[command]git reset --hard',
      '::endgroup::',
      '::group::Switching branch to [Hello-World/test-21031067]...',
      '[command]git checkout -b Hello-World/test-21031067 origin/Hello-World/test-21031067',
      '[command]git checkout Hello-World/test-21031067',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test',
      '> remote branch [Hello-World/test-21031067] not found.',
      '> now branch: test',
      '::endgroup::',
      '::group::Cloning [feature/new-feature] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
      '[command]git checkout -b feature/new-feature origin/feature/new-feature',
      '[command]git checkout feature/new-feature',
      '[command]git checkout -b Hello-World/test-21031067',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
      '[command]git diff \'HEAD..origin/feature/new-feature\' --name-only',
      '::endgroup::',
      '::group::Pushing to octocat/Hello-World@Hello-World/test-21031067...',
      '[command]git push origin Hello-World/test-21031067:refs/heads/Hello-World/test-21031067',
      '::endgroup::',
      '::group::Creating comment to PullRequest...',
      '::set-output name=result::succeeded',
      '::endgroup::',
      '> \x1b[32;40m✔\x1b[0m\t[feature/new-feature] updated',
    ]);
  });

  it('should skip', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.GITHUB_REPOSITORY  = 'octocat/Hello-World';
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
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-21031067'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls/1347')
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
      '[command]git fetch --no-tags origin \'refs/heads/Hello-World/test-21031067:refs/remotes/origin/Hello-World/test-21031067\'',
      '[command]git reset --hard',
      '::endgroup::',
      '::group::Switching branch to [Hello-World/test-21031067]...',
      '[command]git checkout -b Hello-World/test-21031067 origin/Hello-World/test-21031067',
      '[command]git checkout Hello-World/test-21031067',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test',
      '> remote branch [Hello-World/test-21031067] not found.',
      '> now branch: test',
      '::endgroup::',
      '::group::Cloning [feature/new-feature] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
      '[command]git checkout -b feature/new-feature origin/feature/new-feature',
      '[command]git checkout feature/new-feature',
      '[command]git checkout -b Hello-World/test-21031067',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
      '[command]git diff \'HEAD..origin/feature/new-feature\' --name-only',
      '::set-output name=result::not changed',
      '::endgroup::',
      '> \x1b[33;40m✔\x1b[0m\t[feature/new-feature] There is no diff',
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
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc&head=' + encodeURIComponent('octocat:master'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:test/test-1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:test/test-2'))
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
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/test/test-1:refs/remotes/origin/test/test-1\'',
      '[command]git reset --hard',
      '> Switching branch to [test/test-1]...',
      '[command]git checkout -b test/test-1 origin/test/test-1',
      '[command]git checkout test/test-1',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test',
      '> remote branch [test/test-1] not found.',
      '> now branch: test',
      '> Cloning [change/new-topic1] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '[command]git checkout change/new-topic1',
      '[command]git checkout -b test/test-1',
      '[command]ls -la',
      '> Running commands...',
      '> Checking diff...',
      '[command]git add --all',
      '[command]git status --short -uno',
      '> There is no diff.',
      '> Checking references diff...',
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1',
      '[command]git diff \'HEAD..origin/change/new-topic1\' --name-only',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/test/test-2:refs/remotes/origin/test/test-2\'',
      '[command]git reset --hard',
      '> Switching branch to [test/test-2]...',
      '[command]git checkout -b test/test-2 origin/test/test-2',
      '[command]git checkout test/test-2',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test',
      '> remote branch [test/test-2] not found.',
      '> now branch: test',
      '> Cloning [change/new-topic2] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic2:refs/remotes/origin/change/new-topic2\'',
      '[command]git checkout -b change/new-topic2 origin/change/new-topic2',
      '[command]git checkout change/new-topic2',
      '[command]git checkout -b test/test-2',
      '[command]ls -la',
      '> Running commands...',
      '> Checking diff...',
      '[command]git add --all',
      '[command]git status --short -uno',
      '> There is no diff.',
      '> Checking references diff...',
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/change/new-topic2:refs/remotes/origin/change/new-topic2',
      '[command]git diff \'HEAD..origin/change/new-topic2\' --name-only',
      '::endgroup::',
      '::group::Total:2  Succeeded:0  Failed:0  Skipped:2',
      '> \x1b[33;40m✔\x1b[0m\t[change/new-topic1] This is close event',
      '> \x1b[33;40m✔\x1b[0m\t[change/new-topic2] This is close event',
      '::set-output name=result::not changed',
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
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc&head=' + encodeURIComponent('octocat:master'))
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
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/test/test-branch:refs/remotes/origin/test/test-branch\'',
      '[command]git reset --hard',
      '> Switching branch to [test/test-branch]...',
      '[command]git checkout -b test/test-branch origin/test/test-branch',
      '[command]git checkout test/test-branch',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test',
      '> remote branch [test/test-branch] not found.',
      '> now branch: test',
      '> Cloning [change/new-topic1] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '[command]git checkout change/new-topic1',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1',
      '[command]git diff \'HEAD..origin/change/new-topic1\' --name-only',
      '::endgroup::',
      '::group::Total:2  Succeeded:0  Failed:0  Skipped:2',
      '> \x1b[33;40m✔\x1b[0m\t[change/new-topic1] This is close event',
      '> \x1b[33;40m→\x1b[0m\t[change/new-topic2] duplicated (test/test-branch)',
      '::set-output name=result::not changed',
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
          return 'change/new-topic1';
        }
        return '';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc&head=' + encodeURIComponent('octocat:master'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
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
      prBranchPrefix: 'change/',
    }))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '[command]git reset --hard',
      '> Switching branch to [change/new-topic1]...',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '[command]git checkout change/new-topic1',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> change/new-topic1',
      '[command]git merge --no-edit origin/change/new-topic1',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
      '[command]git diff \'HEAD..origin/master\' --name-only',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:0  Failed:1  Skipped:1',
      '> \x1b[33;40m✔\x1b[0m\t[change/new-topic1] This is close event',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should create commit', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.GITHUB_REPOSITORY  = 'octocat/Hello-World';
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
      '[command]git checkout test',
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
      '::group::Pushing to octocat/Hello-World@test...',
      '[command]git push origin test:refs/heads/test',
      '::set-output name=result::succeeded',
      '::endgroup::',
      '> \x1b[32;40m✔\x1b[0m\t[test] updated',
    ]);
  });

  it('should create commit (pull request)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.GITHUB_REPOSITORY  = 'octocat/Hello-World';
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.endsWith('status --short -uno')) {
          return 'M  __tests__/fixtures/test.md';
        }
        if (command.includes(' rev-parse')) {
          return 'feature/new-feature';
        }
        return '';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:feature/new-feature'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .post('/repos/octocat/Hello-World/issues/1347/comments')
      .reply(201)
      .get('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

    await execute(octokit, getActionContext(context('synchronize'), {
      executeCommands: ['yarn upgrade'],
      commitName: 'GitHub Actions',
      commitEmail: 'example@example.com',
      commitMessage: 'test: create test commit',
      notCreatePr: true,
      prBodyForComment: 'pull request comment body',
    }));

    stdoutCalledWith(mockStdout, [
      '::group::Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
      '[command]git reset --hard',
      '::endgroup::',
      '::group::Switching branch to [feature/new-feature]...',
      '[command]git checkout -b feature/new-feature origin/feature/new-feature',
      '[command]git checkout feature/new-feature',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> feature/new-feature',
      '[command]git merge --no-edit origin/feature/new-feature',
      '[command]ls -la',
      '::endgroup::',
      '::group::Merging [origin/feature/new-feature] branch...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
      '[command]git config \'user.name\' \'GitHub Actions\'',
      '[command]git config \'user.email\' \'example@example.com\'',
      '[command]git merge --no-edit origin/feature/new-feature',
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
      '::group::Pushing to octocat/Hello-World@feature/new-feature...',
      '[command]git push origin feature/new-feature:refs/heads/feature/new-feature',
      '::set-output name=result::succeeded',
      '::endgroup::',
      '> \x1b[32;40m✔\x1b[0m\t[feature/new-feature] updated',
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
          return 'change/new-topic1';
        }
        return '';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc&head=' + encodeURIComponent('octocat:master'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
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
      prBranchPrefix: 'change/',
    }))).rejects.toThrow();

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '[command]git reset --hard',
      '> Switching branch to [change/new-topic1]...',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '[command]git checkout change/new-topic1',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> change/new-topic1',
      '[command]git merge --no-edit origin/change/new-topic1',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
      '[command]git diff \'HEAD..origin/master\' --name-only',
      '> Pushing to octocat/Hello-World@change/new-topic1...',
      '[command]git push origin change/new-topic1:refs/heads/change/new-topic1',
      '> Creating comment to PullRequest...',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
      '> \x1b[32;40m✔\x1b[0m\t[change/new-topic1] updated',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should do schedule', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.GITHUB_REPOSITORY  = 'octocat/Hello-World';
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
      .get('/repos/octocat/Hello-World')
      .reply(200, () => getApiFixture(rootDir, 'repos.get'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list2'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-branch'))
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
      '::group::Target PullRequest Ref [feature/new-topic3]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/Hello-World/test-branch:refs/remotes/origin/Hello-World/test-branch\'',
      '[command]git reset --hard',
      '> Switching branch to [Hello-World/test-branch]...',
      '[command]git checkout -b Hello-World/test-branch origin/Hello-World/test-branch',
      '[command]git checkout Hello-World/test-branch',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test',
      '> remote branch [Hello-World/test-branch] not found.',
      '> now branch: test',
      '> Cloning [feature/new-topic3] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/feature/new-topic3:refs/remotes/origin/feature/new-topic3\'',
      '[command]git checkout -b feature/new-topic3 origin/feature/new-topic3',
      '[command]git checkout feature/new-topic3',
      '[command]git checkout -b Hello-World/test-branch',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/feature/new-topic3:refs/remotes/origin/feature/new-topic3',
      '[command]git diff \'HEAD..origin/feature/new-topic3\' --name-only',
      '> Pushing to octocat/Hello-World@Hello-World/test-branch...',
      '[command]git push origin Hello-World/test-branch:refs/heads/Hello-World/test-branch',
      '> Creating comment to PullRequest...',
      '::endgroup::',
      '::group::Total:2  Succeeded:1  Failed:0  Skipped:1',
      '> \x1b[32;40m✔\x1b[0m\t[feature/new-topic3] updated',
      '> \x1b[33;40m→\x1b[0m\t[feature/new-topic4] duplicated (Hello-World/test-branch)',
      '::set-output name=result::succeeded',
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
          return 'change/new-topic1';
        }
        return 'stdout';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World')
      .reply(200, () => getApiFixture(rootDir, 'repos.get.dev'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:master'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

    await expect(execute(octokit, getActionContext(context('', 'schedule'), {
      prBranchPrefix: 'change/',
      prBranchName: 'test-${PR_ID}',
      checkDefaultBranch: false,
    }, 'develop'))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '  >> stdout',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '  >> stdout',
      '[command]git reset --hard',
      '  >> stdout',
      '> Switching branch to [change/new-topic1]...',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '  >> stdout',
      '[command]git checkout change/new-topic1',
      '  >> stdout',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> change/new-topic1',
      '[command]git merge --no-edit origin/change/new-topic1',
      '  >> stdout',
      '[command]ls -la',
      '  >> stdout',
      '> Merging [origin/master] branch...',
      '[command]git remote add origin',
      '  >> stdout',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
      '  >> stdout',
      '[command]git diff \'HEAD..origin/master\' --name-only',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:0  Failed:1  Skipped:1',
      '> \x1b[33;40m✔\x1b[0m\t[change/new-topic1] There is no diff',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
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
          return 'change/new-topic1';
        }
        return 'stdout';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World')
      .reply(200, () => getApiFixture(rootDir, 'repos.get'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'));

    await expect(execute(octokit, getActionContext(context('', 'schedule'), {
      prBranchPrefix: 'change/',
      prBranchName: 'test-${PR_ID}',
      checkDefaultBranch: false,
    }))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '  >> stdout',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '  >> stdout',
      '[command]git reset --hard',
      '  >> stdout',
      '> Switching branch to [change/new-topic1]...',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '  >> stdout',
      '[command]git checkout change/new-topic1',
      '  >> stdout',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> change/new-topic1',
      '[command]git merge --no-edit origin/change/new-topic1',
      '  >> stdout',
      '[command]ls -la',
      '  >> stdout',
      '> Merging [origin/master] branch...',
      '[command]git remote add origin',
      '  >> stdout',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
      '  >> stdout',
      '[command]git diff \'HEAD..origin/master\' --name-only',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:0  Failed:1  Skipped:1',
      '> \x1b[33;40m✔\x1b[0m\t[change/new-topic1] There is no diff',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should process default branch (not create pr)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.GITHUB_REPOSITORY  = 'octocat/Hello-World';
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
      .get('/repos/octocat/Hello-World')
      .reply(200, () => getApiFixture(rootDir, 'repos.get'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:master'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
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
      checkOnlyDefaultBranch: true,
      notCreatePr: true,
    }));

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Target PullRequest Ref [master]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
      '[command]git reset --hard',
      '> Switching branch to [master]...',
      '[command]git checkout -b master origin/master',
      '[command]git checkout master',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test',
      '> remote branch [master] not found.',
      '> now branch: test',
      '> Cloning [master] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
      '[command]git checkout -b master origin/master',
      '[command]git checkout master',
      '[command]git checkout -b master',
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
      '> Pushing to octocat/Hello-World@master...',
      '[command]git push origin master:refs/heads/master',
      '::endgroup::',
      '::group::Total:3  Succeeded:1  Failed:0  Skipped:2',
      '> \x1b[33;40m→\x1b[0m\t[change/new-topic1] This is not target branch',
      '> \x1b[33;40m→\x1b[0m\t[change/new-topic2] This is not target branch',
      '> \x1b[32;40m✔\x1b[0m\t[master] updated',
      '::set-output name=result::succeeded',
      '::endgroup::',
    ]);
  });

  it('should do fail', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.GITHUB_REPOSITORY  = 'octocat/Hello-World';
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
      .get('/repos/octocat/Hello-World')
      .reply(200, () => getApiFixture(rootDir, 'repos.get'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
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
      '::group::Target PullRequest Ref [feature/new-topic3]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/Hello-World/test-branch:refs/remotes/origin/Hello-World/test-branch\'',
      '[command]git reset --hard',
      '> Switching branch to [Hello-World/test-branch]...',
      '[command]git checkout -b Hello-World/test-branch origin/Hello-World/test-branch',
      '[command]git checkout Hello-World/test-branch',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test',
      '> remote branch [Hello-World/test-branch] not found.',
      '> now branch: test',
      '> Cloning [feature/new-topic3] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/feature/new-topic3:refs/remotes/origin/feature/new-topic3\'',
      '[command]git checkout -b feature/new-topic3 origin/feature/new-topic3',
      '[command]git checkout feature/new-topic3',
      '[command]git checkout -b Hello-World/test-branch',
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
      '> \x1b[31;40m×\x1b[0m\t[feature/new-topic3] command [git status] exited with code undefined. message: test error',
      '> \x1b[33;40m→\x1b[0m\t[feature/new-topic4] duplicated (Hello-World/test-branch)',
      '> \x1b[33;40m→\x1b[0m\t[master] duplicated (Hello-World/test-branch)',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should do fail (closed action)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.GITHUB_REPOSITORY  = 'octocat/Hello-World';
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.endsWith('status --short -uno')) {
          throw new Error('test error');
        }
        if (command.includes(' rev-parse')) {
          return 'change/new-topic1';
        }
        return '';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc&head=' + encodeURIComponent('octocat:master'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
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
      prBranchPrefix: 'change/',
    }))).rejects.toThrow('There are failed processes.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '[command]git reset --hard',
      '> Switching branch to [change/new-topic1]...',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '[command]git checkout change/new-topic1',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> change/new-topic1',
      '[command]git merge --no-edit origin/change/new-topic1',
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
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Target PullRequest Ref [master]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/change/test-0:refs/remotes/origin/change/test-0\'',
      '[command]git reset --hard',
      '> Switching branch to [change/test-0]...',
      '[command]git checkout -b change/test-0 origin/change/test-0',
      '[command]git checkout change/test-0',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> change/new-topic1',
      '> remote branch [change/test-0] not found.',
      '> now branch: change/new-topic1',
      '> Cloning [master] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
      '[command]git checkout -b master origin/master',
      '[command]git checkout master',
      '[command]git checkout -b change/test-0',
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
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic1] command [git status] exited with code undefined. message: test error',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '> \x1b[31;40m×\x1b[0m\t[master] command [git status] exited with code undefined. message: test error',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });

  it('should resolve conflicts 1', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.GITHUB_REPOSITORY  = 'octocat/Hello-World';
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
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-21031067'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls/1347')
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
      '[command]git fetch --no-tags origin \'refs/heads/Hello-World/test-21031067:refs/remotes/origin/Hello-World/test-21031067\'',
      '[command]git reset --hard',
      '::endgroup::',
      '::group::Switching branch to [Hello-World/test-21031067]...',
      '[command]git checkout -b Hello-World/test-21031067 origin/Hello-World/test-21031067',
      '[command]git checkout Hello-World/test-21031067',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> test',
      '> remote branch [Hello-World/test-21031067] not found.',
      '> now branch: test',
      '::endgroup::',
      '::group::Cloning [feature/new-feature] from the remote repo...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
      '[command]git checkout -b feature/new-feature origin/feature/new-feature',
      '[command]git checkout feature/new-feature',
      '[command]git checkout -b Hello-World/test-21031067',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
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
      '::group::Pushing to octocat/Hello-World@Hello-World/test-21031067...',
      '[command]git push origin Hello-World/test-21031067:refs/heads/Hello-World/test-21031067',
      '::set-output name=result::succeeded',
      '::endgroup::',
      '> \x1b[32;40m✔\x1b[0m\t[feature/new-feature] updated',
    ]);
  });

  it('should resolve conflicts 2', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();
    setChildProcessParams({
      stdout: (command: string): string => {
        if (command.includes(' rev-parse')) {
          return 'change/new-topic1';
        }
        if (command.startsWith('git merge --no-edit')) {
          return 'Auto-merging merge.txt\nCONFLICT (content): Merge conflict in merge.txt\nAutomatic merge failed; fix conflicts and then commit the result.';
        }
        if (command.includes('--name-only')) {
          return 'package.json';
        }
        return '';
      },
    });
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => getApiFixture(rootDir, 'pulls.list.state.open'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.false'))
      .patch('/repos/octocat/Hello-World/pulls/1347')
      .reply(200, () => getApiFixture(rootDir, 'pulls.update'))
      .delete('/repos/octocat/Hello-World/git/refs/' + encodeURIComponent('heads/change/new-topic1'))
      .reply(204);

    await expect(execute(octokit, getActionContext(context('', 'schedule'), {
      prBranchPrefix: 'change/',
      prBranchName: 'test-${PR_ID}',
      checkDefaultBranch: false,
    }))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '[command]git reset --hard',
      '> Switching branch to [change/new-topic1]...',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '[command]git checkout change/new-topic1',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> change/new-topic1',
      '[command]git merge --no-edit origin/change/new-topic1',
      '  >> Auto-merging merge.txt',
      '  >> CONFLICT (content): Merge conflict in merge.txt',
      '  >> Automatic merge failed; fix conflicts and then commit the result.',
      '[command]ls -la',
      '> Merging [origin/master] branch...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
      '[command]git config \'user.name\' test-actor',
      '[command]git config \'user.email\' \'test-actor@users.noreply.github.com\'',
      '[command]git merge --no-edit origin/master',
      '  >> Auto-merging merge.txt',
      '  >> CONFLICT (content): Merge conflict in merge.txt',
      '  >> Automatic merge failed; fix conflicts and then commit the result.',
      '> Aborting merge...',
      '[command]git merge --abort',
      '> There is no diff.',
      '> Checking references diff...',
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
      '[command]git diff \'HEAD..origin/master\' --name-only',
      '> This PR is not mergeable.',
      '> Merging [origin/master] branch...',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
      '[command]git config \'user.name\' test-actor',
      '[command]git config \'user.email\' \'test-actor@users.noreply.github.com\'',
      '[command]git merge --no-edit origin/master',
      '  >> Auto-merging merge.txt',
      '  >> CONFLICT (content): Merge conflict in merge.txt',
      '  >> Automatic merge failed; fix conflicts and then commit the result.',
      '> Initializing working directory...',
      '[command]rm -rdf [Working Directory]',
      '[command]git remote add origin',
      '[command]git fetch --no-tags origin \'refs/heads/master:refs/remotes/origin/master\'',
      '[command]git checkout -b master origin/master',
      '[command]git checkout master',
      '[command]git checkout -b change/new-topic1',
      '> Running commands...',
      '> Checking diff...',
      '[command]git add --all',
      '[command]git status --short -uno',
      '> Closing PullRequest... [change/new-topic1]',
      '> Deleting reference... [refs/heads/change/new-topic1]',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
      '> \x1b[32;40m✔\x1b[0m\t[change/new-topic1] has been closed because there is no diff',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
      '::endgroup::',
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
      '[command]git checkout test/change',
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
      '[command]git checkout test/change',
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
      '::group::Pushing to octocat/Hello-World@test/change...',
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
      '[command]git checkout test/change',
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
      '::group::Pushing to octocat/Hello-World@test/change...',
      '[command]git push origin test/change:refs/heads/test/change',
      '::set-output name=result::succeeded',
      '::endgroup::',
      '> \x1b[32;40m✔\x1b[0m\t[test/change] updated',
    ]);
  });

  it('should create pr (no diff, ref diff exists)', async() => {
    process.env.GITHUB_WORKSPACE   = workDir;
    process.env.INPUT_GITHUB_TOKEN = 'test-token';
    const mockStdout               = spyOnStdout();
    setExists(true);

    nock('https://api.github.com')
      .persist()
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-21031067'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls/11')
      .reply(200, () => getApiFixture(rootDir, 'pulls.get.mergeable.true'))
      .post('/repos/octocat/Hello-World/pulls')
      .reply(201, () => getApiFixture(rootDir, 'pulls.create'))
      .post('/repos/octocat/Hello-World/issues/1347/labels')
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
      '  >> stdout',
      '[command]git fetch --no-tags origin \'refs/heads/Hello-World/test-21031067:refs/remotes/origin/Hello-World/test-21031067\'',
      '  >> stdout',
      '[command]git reset --hard',
      '  >> stdout',
      '::endgroup::',
      '::group::Switching branch to [Hello-World/test-21031067]...',
      '[command]git checkout -b Hello-World/test-21031067 origin/Hello-World/test-21031067',
      '  >> stdout',
      '[command]git checkout Hello-World/test-21031067',
      '  >> stdout',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> stdout',
      '> remote branch [Hello-World/test-21031067] not found.',
      '> now branch: stdout',
      '::endgroup::',
      '::group::Cloning [feature/new-feature] from the remote repo...',
      '[command]git remote add origin',
      '  >> stdout',
      '[command]git fetch --no-tags origin \'refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature\'',
      '  >> stdout',
      '[command]git checkout -b feature/new-feature origin/feature/new-feature',
      '  >> stdout',
      '[command]git checkout feature/new-feature',
      '  >> stdout',
      '[command]git checkout -b Hello-World/test-21031067',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/feature/new-feature:refs/remotes/origin/feature/new-feature',
      '  >> stdout',
      '[command]git diff \'HEAD..origin/feature/new-feature\' --name-only',
      '::endgroup::',
      '::group::Creating PullRequest...',
      '> Adding labels...',
      getLogStdout(['label1', 'label2']),
      '::set-output name=result::succeeded',
      '::endgroup::',
      '> \x1b[32;40m✔\x1b[0m\t[feature/new-feature] PullRequest created',
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
          return 'change/new-topic1';
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
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => {
        const result            = getApiFixture(rootDir, 'pulls.list.state.open');
        result[0]['created_at'] = moment().subtract(11, 'days').toISOString();
        return result;
      })
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-1'))
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
      prBranchPrefix: 'change/',
      prBranchName: 'test-${PR_ID}',
      checkDefaultBranch: false,
      autoMergeThresholdDays: '10',
    }))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '  >> stdout',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '  >> stdout',
      '[command]git reset --hard',
      '  >> stdout',
      '> Switching branch to [change/new-topic1]...',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '  >> stdout',
      '[command]git checkout change/new-topic1',
      '  >> stdout',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> change/new-topic1',
      '[command]git merge --no-edit origin/change/new-topic1',
      '  >> stdout',
      '[command]ls -la',
      '  >> stdout',
      '> Merging [origin/master] branch...',
      '[command]git remote add origin',
      '  >> stdout',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
      '  >> stdout',
      '[command]git diff \'HEAD..origin/master\' --name-only',
      '> Checking auto merge...',
      '> All checks are passed.',
      '> Auto merging...',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:1  Failed:1  Skipped:0',
      '> \x1b[32;40m✔\x1b[0m\t[change/new-topic1] has been auto merged',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
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
          return 'change/new-topic1';
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
      .get('/repos/octocat/Hello-World/pulls?sort=created&direction=asc')
      .reply(200, () => getApiFixture(rootDir, 'pulls.list'))
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic1'))
      .reply(200, () => {
        const result            = getApiFixture(rootDir, 'pulls.list.state.open');
        result[0]['created_at'] = moment().subtract(10, 'days').toISOString();
        return result;
      })
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:change/new-topic2'))
      .reply(200, () => [])
      .get('/repos/octocat/Hello-World/pulls?head=' + encodeURIComponent('octocat:Hello-World/test-1'))
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
      prBranchPrefix: 'change/',
      prBranchName: 'test-${PR_ID}',
      checkDefaultBranch: false,
      autoMergeThresholdDays: '10',
    }))).rejects.toThrow('There is a failed process.');

    stdoutCalledWith(mockStdout, [
      '::group::Target PullRequest Ref [change/new-topic1]',
      '> Fetching...',
      '[command]git remote add origin',
      '  >> stdout',
      '[command]git fetch --no-tags origin \'refs/heads/change/new-topic1:refs/remotes/origin/change/new-topic1\'',
      '  >> stdout',
      '[command]git reset --hard',
      '  >> stdout',
      '> Switching branch to [change/new-topic1]...',
      '[command]git checkout -b change/new-topic1 origin/change/new-topic1',
      '  >> stdout',
      '[command]git checkout change/new-topic1',
      '  >> stdout',
      '[command]git rev-parse --abbrev-ref HEAD',
      '  >> change/new-topic1',
      '[command]git merge --no-edit origin/change/new-topic1',
      '  >> stdout',
      '[command]ls -la',
      '  >> stdout',
      '> Merging [origin/master] branch...',
      '[command]git remote add origin',
      '  >> stdout',
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
      '[command]git fetch --prune --no-tags --no-recurse-submodules origin +refs/heads/master:refs/remotes/origin/master',
      '  >> stdout',
      '[command]git diff \'HEAD..origin/master\' --name-only',
      '> Checking auto merge...',
      '> Number of days since creation is not more than threshold.',
      '> days: 10, threshold: 10',
      '::endgroup::',
      '::group::Target PullRequest Ref [change/new-topic2]',
      '::endgroup::',
      '::group::Total:2  Succeeded:0  Failed:1  Skipped:1',
      '> \x1b[33;40m✔\x1b[0m\t[change/new-topic1] There is no diff',
      '> \x1b[31;40m×\x1b[0m\t[change/new-topic2] not found',
      '::set-output name=result::failed',
      '::endgroup::',
    ]);
  });
});
